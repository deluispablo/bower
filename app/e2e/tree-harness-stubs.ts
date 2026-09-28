/**
 * Test-only stand-ins for the two stores the tree reads, so the perf e2e
 * (`v4-perf.e2e.ts`) can mount `Tree` on its own. The harness build aliases
 * `vault-store.js` and `use-new.js` to this file; it is never part of the
 * app build.
 */

interface PinActions {
  pinNote: (id: string) => Promise<void>;
  unpinNote: (id: string) => Promise<void>;
  pinFolder: (path: string) => Promise<void>;
  unpinFolder: (path: string) => Promise<void>;
}

const noop = (): Promise<void> => Promise.resolve();

export function useVault(): PinActions {
  return {
    pinNote: noop,
    unpinNote: noop,
    pinFolder: noop,
    unpinFolder: noop,
  };
}

export function useNew(): {
  ids: ReadonlySet<string>;
  isNew: (id: string) => boolean;
  newCountIn: (path: string) => number;
} {
  return { ids: new Set<string>(), isNew: () => false, newCountIn: () => 0 };
}
