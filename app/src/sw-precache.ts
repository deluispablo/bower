/**
 * Pure rules for the service worker's precache (#992, see `sw.ts`). Kept
 * dependency-free (no `workbox-*`, no `self`, no `caches`) so they are
 * unit-testable without a service worker environment.
 */

/**
 * The precache's Cache Storage name. Bumped from Workbox's default
 * (`workbox-precache-v2-<scope>`) so every device downloads every shell
 * file again: some devices hold an `index.html` stored as a JS chunk
 * (#992), and Workbox never refetches an entry whose hash is unchanged.
 * Bump the trailing number again to force the same full refresh.
 */
export const PRECACHE_NAME = 'bower-precache-v2';

/**
 * Whether `cacheName` is an earlier precache to delete on `activate`:
 * Workbox's default name (`workbox-precache-…`) or any other name with
 * `-precache-` in it, the substring Workbox's own `cleanupOutdatedCaches`
 * looks for. Never the current precache, and never the other caches the
 * app keeps (`bower-api`, `bower-share`).
 */
export function isOutdatedPrecache(cacheName: string): boolean {
  return cacheName !== PRECACHE_NAME && cacheName.includes('-precache-');
}

/** The `content-type` media type, lower case, without parameters. */
function mediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

const SCRIPT_TYPES = new Set([
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript',
]);

/**
 * Whether a precache response may be stored (#992). Refuses:
 * - any error status (400 and up), as Workbox's default precache check
 *   does, which a custom `cacheWillUpdate` plugin replaces;
 * - a response for `/assets/*.js` whose `content-type` is not JavaScript,
 *   or for `/assets/*.css` whose `content-type` is not CSS. Cloudflare
 *   Pages answers a missing asset with the SPA's `index.html` (status
 *   200); stored as a chunk, it breaks every screen that imports it.
 *
 * A refused response is not cached, so the install fails and the browser
 * retries it later: better than a poisoned cache.
 */
export function isCacheablePrecacheResponse(
  url: URL,
  status: number,
  contentType: string | null,
): boolean {
  if (status >= 400) return false;
  if (!url.pathname.startsWith('/assets/')) return true;
  const type = mediaType(contentType);
  if (url.pathname.endsWith('.js')) return SCRIPT_TYPES.has(type);
  if (url.pathname.endsWith('.css')) return type === 'text/css';
  return true;
}
