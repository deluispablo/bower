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
import type { PrecacheEntry } from 'workbox-precaching';
import { precacheAndRoute } from 'workbox-precaching';

import { filesFromFormData, storeSharedFiles } from './share-target.js';

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

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
