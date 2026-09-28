/**
 * The demo's standing reminder (#362, board Demo-Home): one line under the
 * top bar on every shell route, in demo builds only (`isDemo()`, `api.ts`),
 * with "Run your own" to the demo's `/login`, which is Run your own Bower
 * (`routes/run-your-own.tsx`). A visitor who skips the tour still meets it
 * there. Mounted once in `layout.tsx`, next to `OfflineBanner`;
 * `role="status"` since it is a standing fact about the screen rather than
 * an alert.
 *
 * While the tour is on screen (`tourOpen`) the banner steps aside, so the
 * tour's card is the only thing asking for attention.
 */

import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import '../styles/demo-banner.css';

/** The banner's one sentence; the link follows it. */
export const DEMO_BANNER_TEXT =
  'This is a demo, not the real thing: sample notes, nothing saved.';

export interface DemoBannerProps {
  /** The first-run tour is showing; the banner hides until it ends. */
  tourOpen?: boolean;
}

export function DemoBanner({
  tourOpen = false,
}: DemoBannerProps): JSX.Element | null {
  if (!isDemo() || tourOpen) return null;

  return (
    <div class="demo-banner" role="status">
      <svg
        class="demo-banner-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <span class="demo-banner-text">{DEMO_BANNER_TEXT}</span>
      <a class="demo-banner-link" href="/login">
        Run your own
      </a>
    </div>
  );
}
