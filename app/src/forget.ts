/**
 * Forgets everything this device holds about the signed-in user: the
 * IndexedDB vault cache, the two Cache Storage buckets the service worker
 * and the Web Share Target use, the in-memory Drive token, the per-user
 * local preferences (keeping `theme`, a device setting rather than a user
 * one), the list of sent sentences older versions kept, and the
 * recent-searches and opened-lately lists, and the upload queue (every
 * user's files still waiting on this device, R-UPL-7).
 *
 * `forgetDevice` takes its work as injected dependencies so it is
 * unit-tested hermetically, without a real IndexedDB, Cache Storage or
 * `localStorage`. Every dependency always runs, even if another one
 * throws or rejects — whoever calls this is leaving anyway — and every
 * failure goes to `console.error`, never left silent and never thrown
 * onward.
 *
 * The default export wires the real dependencies together; it is what
 * `session.tsx` (sign-out, and a 401 for a session that was previously
 * signed in) and `routes/settings.tsx` (delete account, transitively via
 * sign-out) actually call.
 */

import { clearAll } from './cache.js';
import { invalidateToken } from './drive.js';
import { resetPrefs } from './prefs.js';
import { clearRecentSearches } from './search.js';
import { SHARE_CACHE_NAME } from './share-target.js';
import { clearOpened } from './switcher-store.js';
import { clearSent } from './tell.js';
import { clearUploadQueue } from './upload-queue.js';

/** Matches the Worker cache the service worker registers in `sw.ts`. */
const API_CACHE_NAME = 'bower-api';

export interface ForgetDeviceDeps {
  /** Drops every cached index, note and blob (`clearAll` in `cache.ts`). */
  clearIdb: () => Promise<void>;
  /** Deletes a named Cache Storage bucket, e.g. `caches.delete`. */
  deleteCache: (name: string) => Promise<boolean>;
  /** Forgets the cached Drive access token (`invalidateToken` in `drive.ts`). */
  invalidateToken: () => void;
  /** Drops per-user local preferences, keeping `theme` (`prefs.ts`). */
  resetPrefs: () => void;
  /** Drops the sent list older versions kept (`clearSent` in `tell.ts`). */
  clearSent: () => void;
  /** Drops the local recent-searches list (`clearRecentSearches` in `search.ts`). */
  clearRecentSearches: () => void;
  /** Drops the opened-lately list (`clearOpened` in `switcher-store.ts`). */
  clearOpened: () => void;
  /** Stops the upload queue and drops its device copies (`upload-queue.ts`). */
  clearUploadQueue: () => Promise<void>;
}

/** Runs `task`, sending anything it throws or rejects with to `console.error`. */
async function runSafely(task: () => unknown): Promise<void> {
  try {
    await task();
  } catch (err) {
    console.error(err);
  }
}

/**
 * Clears the device via the injected dependencies. Every dependency is
 * called regardless of what the others do; one of them failing never
 * stops, delays or skips the rest.
 */
export async function forgetDevice(deps: ForgetDeviceDeps): Promise<void> {
  await Promise.all([
    runSafely(() => deps.clearIdb()),
    runSafely(() => deps.deleteCache(API_CACHE_NAME)),
    runSafely(() => deps.deleteCache(SHARE_CACHE_NAME)),
    runSafely(() => deps.invalidateToken()),
    runSafely(() => deps.resetPrefs()),
    runSafely(() => deps.clearSent()),
    runSafely(() => deps.clearRecentSearches()),
    runSafely(() => deps.clearOpened()),
    runSafely(() => deps.clearUploadQueue()),
  ]);
}

export default function forgetThisDevice(): Promise<void> {
  return forgetDevice({
    clearIdb: clearAll,
    deleteCache: (name) => caches.delete(name),
    invalidateToken,
    resetPrefs,
    clearSent,
    clearRecentSearches,
    clearOpened,
    clearUploadQueue: () => clearUploadQueue(),
  });
}
