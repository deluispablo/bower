/**
 * The demo's own preferences (#494). `DemoServer` is rebuilt from scratch
 * on every load, so `tourSeenAt` — a Worker preference on the real build —
 * would replay the four-sheet tour on every reload unless something
 * outlives the in-memory server. Persisted here, keyed like the intro flag
 * (`intro.ts`), so it survives a reload of the same browser session; "?"
 * (`help-sheet.tsx`) still replays the tour on demand regardless.
 *
 * Takes a `Storage` (not the `sessionStorage` global) so it is
 * unit-testable against a storage that throws, without touching real
 * browser storage. `sessionStorage`, not `localStorage`: a new tab gets a
 * fresh demo, same as reopening the site fresh.
 */

const TOUR_SEEN_KEY = 'bower:demo:tourSeenAt';

/**
 * The persisted `tourSeenAt`, or `undefined` if never set or the storage
 * throws (private browsing with storage blocked, or any other failure).
 */
export function demoTourSeenAt(storage: Storage): string | undefined {
  try {
    return storage.getItem(TOUR_SEEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Persists `seenAt`; a throwing `storage` is silently ignored (best effort). */
export function setDemoTourSeenAt(storage: Storage, seenAt: string): void {
  try {
    storage.setItem(TOUR_SEEN_KEY, seenAt);
  } catch {
    // Storage blocked or full: worst case the tour replays next reload.
  }
}
