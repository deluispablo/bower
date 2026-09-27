/**
 * The demo's persistent reminder (#193, spec §5): "These are sample notes.
 * Nothing here is real." under the top bar on every shell route, in demo
 * builds only (`isDemo()`, `api.ts`). Mounted once in `layout.tsx`, next to
 * `OfflineBanner`, which it otherwise matches — same slim card under the
 * header, `role="status"` since it is a standing fact about the screen
 * rather than an alert.
 *
 * `data-tour="banner"` (#195) is the first-run tour's fourth, demo-only step
 * (`components/tour.tsx`); "Show me around" replays that tour from here the
 * same way Settings › Advanced's "Show me around again" does
 * (`tour-store.ts`).
 */

import { isDemo } from '../api.js';
import { replayTour } from '../tour-store.js';
import '../styles/demo-banner.css';

export function DemoBanner() {
  if (!isDemo()) return null;

  return (
    <div class="demo-banner" role="status" data-tour="banner">
      <span>These are sample notes. Nothing here is real.</span>
      <button type="button" class="button-link" onClick={replayTour}>
        Show me around
      </button>
    </div>
  );
}
