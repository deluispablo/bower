/// <reference lib="webworker" />
/**
 * Custom service worker (`injectManifest` strategy): precaches the app
 * shell like the generated one did, and additionally handles the Web Share
 * Target navigation (`POST /add`) that a generated service worker cannot.
 *
 * Android hands a share (e.g. "Share" on a PDF in Chrome) to this worker as
 * a `POST` to the manifest's `share_target.action`. There is no page to
 * receive the `FormData` directly, so it is stashed in Cache Storage
 * (`share-target.ts`) and the app picks it up after the redirect.
 */
import { ExpirationPlugin } from 'workbox-expiration';
import type { PrecacheEntry } from 'workbox-precaching';
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

import {
  filesFromFormData,
  isTrustedShareRequest,
  storeSharedFiles,
} from './share-target.js';
import {
  isCacheablePrecacheResponse,
  isOutdatedPrecache,
  PRECACHE_NAME,
} from './sw-precache.js';
import './sw-push.js';
import { isApiStatusRequest } from './sw-routes.js';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// The precache under its own name (#992), not Workbox's default one: a
// renamed cache makes every device fetch every shell file again, which heals
// devices that stored `index.html` as a JS chunk. `precacheAndRoute` cannot
// take a name without `workbox-core`'s `setCacheNameDetails` (not a direct
// dependency), so the controller is built explicitly; `precache` adds the
// same `install` and `activate` listeners `precacheAndRoute` does.
//
// The `cacheWillUpdate` plugin refuses HTML stored as a script or a style
// (`isCacheablePrecacheResponse`); a refused entry fails the install, and the
// browser retries later. Being a `cacheWillUpdate` plugin, it replaces
// Workbox's default precache check, so it refuses error statuses too.
const precacheController = new PrecacheController({
  cacheName: PRECACHE_NAME,
  plugins: [
    {
      cacheWillUpdate: async ({ request, response }) =>
        isCacheablePrecacheResponse(
          new URL(request.url),
          response.status,
          response.headers.get('content-type'),
        )
          ? response
          : null,
    },
  ],
});
precacheController.precache(self.__WB_MANIFEST);
registerRoute(new PrecacheRoute(precacheController));

const SHARE_TARGET_PATH = '/add';

async function handleShareTarget(request: Request): Promise<Response> {
  // A cross-site page can POST its own `FormData` to this origin's share
  // target exactly like the OS share sheet does; only the share sheet (and
  // other navigations with no triggering document) is `Sec-Fetch-Site:
  // none` (#262/M3). Refuse anything else: nothing stored, nothing shared.
  if (!isTrustedShareRequest(request.headers)) {
    return Response.redirect(SHARE_TARGET_PATH, 303);
  }
  try {
    const formData = await request.formData();
    await storeSharedFiles(filesFromFormData(formData));
  } catch (err) {
    // Errors are never swallowed (CLAUDE.md): logged here, and reported to
    // the page as one sentence (#134) since the worker has no UI of its own.
    console.error(err);
    return Response.redirect(`${SHARE_TARGET_PATH}?shared=failed`, 303);
  }
  return Response.redirect(`${SHARE_TARGET_PATH}?shared=1`, 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(event.request));
  }
});

// --- Runtime caching (#41), separate from the precached shell above -------
//
// `NetworkFirst` for the two Worker endpoints the shell needs to render
// while offline (`/me` for the account, `/status` for a run in progress):
// try the network for up to 3 s, fall back to the last good response.
// Drive (`www.googleapis.com`) is never cached here — `isApiStatusRequest`
// excludes it outright, and no other route below matches it either, so a
// Drive request always goes straight to the network.
registerRoute(
  ({ url }) => isApiStatusRequest(url),
  new NetworkFirst({
    cacheName: 'bower-api',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 2 })],
  }),
);

// Every other navigation falls back to the precached shell so the app opens
// offline. The Web Share Target's `POST /add` is a navigation too, but the
// fetch handler above already owns and responds to it, so it's denylisted
// here to avoid a second, conflicting `respondWith`.
registerRoute(
  new NavigationRoute(
    precacheController.createHandlerBoundToURL('/index.html'),
    {
      denylist: [new RegExp(`^${SHARE_TARGET_PATH}(\\?|$)`)],
    },
  ),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

/** Deletes every earlier precache (`isOutdatedPrecache`), e.g. Workbox's
 * default `workbox-precache-v2-<scope>` that held the bad chunk (#992). */
async function deleteOutdatedPrecaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names.filter(isOutdatedPrecache).map((name) => caches.delete(name)),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([deleteOutdatedPrecaches(), self.clients.claim()]),
  );
});
