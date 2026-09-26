/**
 * Pure matchers for the service worker's runtime caching routes (#41, see
 * `sw.ts`). Kept dependency-free (no `workbox-*`, no `self`) so they are
 * unit-testable with a plain `URL`, without a service worker environment.
 */

/**
 * Drive itself. The service worker never caches these, whatever the path:
 * vault content only ever lives in IndexedDB (`cache.ts`), synced from
 * Drive directly, never through the service worker.
 */
export function isGoogleApi(url: URL): boolean {
  return url.hostname === 'www.googleapis.com';
}

/**
 * `GET /me` or `GET /status` on the Worker API (`api/`). The API origin
 * (`VITE_API_URL`) isn't known at service worker build time, so this
 * matches the path on any origin *except* Drive's — `isGoogleApi` above.
 */
export function isApiStatusRequest(url: URL): boolean {
  return (
    !isGoogleApi(url) && (url.pathname === '/me' || url.pathname === '/status')
  );
}
