import { useSyncExternalStore } from 'react';

/** True from 900 px wide: the desktop shell (spec, "Screens and navigation"). */
export const DESKTOP = '(min-width: 900px)';

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = (): boolean => useMedia(DESKTOP);
