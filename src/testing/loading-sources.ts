/** For tests: data that never finishes loading, to see screens in their loading state. */
import type { Sources } from '@/data/sources';

export function loadingSources(): Sources {
  const never = (): Promise<never> => new Promise(() => undefined);
  const off = (): (() => void) => () => undefined;
  return {
    session: { current: never, signIn: never, signOut: never, folderState: never, createFolder: never, subscribe: off },
    vault: new Proxy({}, { get: (_t, k) => (k === 'subscribe' ? off : never) }),
    runs: { start: never, current: async () => null, markSeen: never, subscribe: off },
  } as unknown as Sources;
}

