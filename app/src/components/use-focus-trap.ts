/**
 * Keeps keyboard focus inside a modal panel (the phone explorer drawer)
 * for as long as the calling component is mounted: focus moves to the
 * panel's first control on mount, Tab and Shift+Tab wrap at its edges,
 * Escape calls `onEscape`, and on unmount focus goes back to whatever had
 * it before (the button that opened the panel).
 *
 * Traps nest: a pin sheet opened from a row of a panel that already traps
 * focus traps it inside that panel's own trap. Only the innermost open trap answers a key,
 * so Escape closes the sheet alone and Tab wraps inside the sheet.
 */

import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(',');

/** Every open trap's container, the innermost last. */
const openTraps: HTMLElement[] = [];

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  onEscape: () => void,
  /** The element to give focus back to; defaults to the focused one at mount. */
  opener?: RefObject<HTMLElement | null>,
): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const container = ref.current;
    if (container === null) return;
    const previous =
      opener?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    (focusables(container)[0] ?? container).focus();
    openTraps.push(container);

    function onKeyDown(event: KeyboardEvent): void {
      if (openTraps[openTraps.length - 1] !== container) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab' || container === null) return;
      const items = focusables(container);
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !container.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openTraps.lastIndexOf(container);
      if (at !== -1) openTraps.splice(at, 1);
      previous?.focus();
    };
  }, [ref, opener]);
}
