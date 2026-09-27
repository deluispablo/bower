/**
 * A long press (500 ms, `pointerdown`/`pointerup`, spec §14, issue #216):
 * fires `onLongPress` once a row has been held for `LONG_PRESS_MS` without
 * moving past `MOVE_TOLERANCE_PX`. The click that follows a real long press
 * on a touch device must never also run the row's own tap action (open the
 * note, toggle the folder) — `consumeLongPress()` is how a row's own
 * `onClick` checks that: called first, it returns `true` (and resets)
 * exactly once right after a long press fired, `false` for a plain tap, so
 * the row bails out of its own handler only that one time. A genuine
 * `contextmenu` event (a real right-click, or the keyboard's Menu key /
 * Shift+F10, which fires it with no pointer at all) calls `onLongPress` the
 * same way, so the sheet stays one keypress away without a dedicated menu
 * button.
 *
 * One instance serves every row (`tree.tsx` maps a variable number of rows,
 * where calling this per row would break the Rules of Hooks): `onLongPress`
 * receives the element the gesture happened on, and the caller reads
 * whichever data attribute it put there (`data-row-path`, in `tree.tsx`) to
 * know which row.
 */

import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: JSX.TargetedPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: JSX.TargetedMouseEvent<HTMLElement>) => void;
  /** Checked first, inside a row's own `onClick`: `true` exactly once right
   * after a long press fired (and resets), so that one click is skipped. */
  consumeLongPress: () => boolean;
}

export function useLongPress(
  onLongPress: (target: HTMLElement) => void,
): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  function clear(): void {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }

  return {
    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
      const target = event.currentTarget;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPressRef.current(target);
      }, LONG_PRESS_MS);
    },
    onPointerMove(event) {
      const from = start.current;
      if (from === null) return;
      if (
        Math.abs(event.clientX - from.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - from.y) > MOVE_TOLERANCE_PX
      ) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu(event) {
      event.preventDefault();
      onLongPressRef.current(event.currentTarget);
    },
    consumeLongPress() {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}
