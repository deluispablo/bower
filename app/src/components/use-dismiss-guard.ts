/**
 * Guards a sheet's backdrop-tap dismissal against the open tap itself
 * (#510, item 3.7): a sheet's panel slides up over ~`--motion-base`
 * (200ms); a fast double-tap that opens it can land its second tap on
 * the backdrop, now covering the same spot, before the panel has
 * finished sliding into place — closing what it just opened. For `ms`
 * after the sheet mounts, a backdrop tap is swallowed instead of calling
 * `onDismiss`; once the window has passed, a tap dismisses normally.
 *
 * `ms` defaults to 300: `--motion-base` (200ms) plus margin for the
 * paint and event-dispatch time between the two taps of a fast
 * double-tap, the report's own "about 300 ms".
 */

import { useRef } from 'preact/hooks';

export function useDismissGuard(onDismiss: () => void, ms = 300): () => void {
  // Set synchronously on the first render (not from an effect, which can
  // still be pending — and so read as 0 — by the time a second tap of a
  // fast double-tap arrives before the next paint).
  const openedAt = useRef(Date.now());

  return (): void => {
    if (Date.now() - openedAt.current < ms) return;
    onDismiss();
  };
}
