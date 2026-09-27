/**
 * A slim card under the top bar when the app has no network (#41,
 * redesigned #143, text and the wifi icon since #206 — spec §14: the bird
 * stays only on the Home greeting, the big sad one). Uses `useOnline()`,
 * the general connectivity signal; the vault store's own `offline` status
 * stays the home screen's own indicator for a stale cached listing (see
 * `home.tsx`'s `bubbleFor`).
 */

import { IconWifi } from './icons.js';
import { useOnline } from '../online.js';
import '../styles/offline-banner.css';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div class="offline-banner" role="status" aria-live="polite">
      <IconWifi />
      <span class="offline-banner-text">
        You&rsquo;re offline. Showing the notes saved on this device; adding and
        tidying up will wait.
      </span>
    </div>
  );
}
