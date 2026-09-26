/**
 * A slim banner under the top bar when the app has no network (#41). Uses
 * `useOnline()`, the general connectivity signal; the vault store's own
 * `offline` status stays the home screen's own indicator for a stale cached
 * listing.
 */

import { useOnline } from '../online.js';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div class="offline-banner" role="status" aria-live="polite">
      You are offline. Showing saved notes.
    </div>
  );
}
