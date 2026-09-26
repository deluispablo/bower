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
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

import { filesFromFormData, storeSharedFiles } from './share-target.js';
import './sw-push.js';
import { isApiStatusRequest } from './sw-routes.js';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

precacheAndRoute(self.__WB_MANIFEST);

const SHARE_TARGET_PATH = '/add';

async function handleShareTarget(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    await storeSharedFiles(filesFromFormData(formData));
  } catch {
    // Nothing usable came through; the app just shows nothing shared.
  }
  return Response.redirect('/add?shared=1', 303);
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
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [new RegExp(`^${SHARE_TARGET_PATH}(\\?|$)`)],
  }),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
