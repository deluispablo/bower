/**
 * Online/offline signal (#41): a small hook plus the pure reason sentences
 * shown next to a control disabled because the app has no network.
 *
 * `vault-store.tsx` keeps its own `offline` status for the home indicator
 * ("showing a cached listing after a failed refresh"); this is the general
 * "can the app reach the network right now" signal, from `navigator.onLine`
 * plus the `online`/`offline` window events.
 */

import { useEffect, useState } from 'preact/hooks';

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function update(): void {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export type OfflineAction = 'add' | 'tell' | 'process' | 'append' | 'edit';

/**
 * The sentence shown next to a control disabled because the app is
 * offline. Add has no upload queue, so it gets its own wording rather than
 * the "will upload when you are back online" promise a queued design would
 * make.
 */
export function offlineReason(action: OfflineAction): string {
  switch (action) {
    case 'add':
      return 'You are offline. Adding files needs a connection.';
    case 'tell':
      return 'You are offline. Sending needs a connection.';
    case 'process':
      return 'You are offline. Bower can run when you are back online.';
    case 'append':
      return 'You are offline. Adding to a note needs a connection.';
    case 'edit':
      return 'You are offline. Saving your changes needs a connection.';
  }
}
