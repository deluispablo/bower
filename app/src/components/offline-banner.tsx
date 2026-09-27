/**
 * A slim card under the top bar when the app has no network (#41,
 * redesigned #143 as the bird card of `Phone-Offline.dc.html`). Uses
 * `useOnline()`, the general connectivity signal; the vault store's own
 * `offline` status stays the home screen's own indicator for a stale cached
 * listing (see `home.tsx`'s `bubbleFor`).
 */

import { Bird } from './bird.js';
import { useOnline } from '../online.js';
import '../styles/offline-banner.css';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div class="offline-banner" role="status" aria-live="polite">
      <Bird state="offline" size={40} />
      <span class="offline-banner-text">
        You&rsquo;re offline. Showing the notes saved on this device; adding and
        tidying up will wait.
      </span>
    </div>
  );
}
