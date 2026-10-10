import { clientsClaim } from 'workbox-core';
import { addRoute, cleanupOutdatedCaches, createHandlerBoundToURL, precache } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Populate the revision map before binding the fallback, without routing yet.
precache(self.__WB_MANIFEST);
const shell = createHandlerBoundToURL('/index.html');

registerRoute(new NavigationRoute(new NetworkFirst({
  networkTimeoutSeconds: 3,
  plugins: [{
    // Keep only the installed shell: online HTML can refer to a newer build
    // whose assets this worker has not precached for offline use.
    cacheWillUpdate: async () => null,
    // NetworkFirst consults this on failure AND timeout. Always provide the
    // revisioned shell, even when its runtime navigation cache is empty.
    cachedResponseWillBeUsed: ({ event, request }) => shell({ event, request, url: new URL(request.url) }),
  }],
}), {
  // Landing and the Worker's paths remain network-owned.
  denylist: [/^\/landing/, /^\/(auth|me|drive|vault|process|status|session|health|runs|push)(\/|$)/],
}));

// Navigations must win before precached HTML or directory/clean-URL aliases.
addRoute();
