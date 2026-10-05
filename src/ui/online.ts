import { useSyncExternalStore } from 'react';

const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Whether the browser says it is online (it can be wrong the other way, never this way). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
