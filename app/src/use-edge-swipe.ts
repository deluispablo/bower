/**
 * The left-edge swipe that pulls out the drawer "Your folders" (#909, spec
 * §3.14): a touch or pen that starts within 16 px of the left edge and
 * travels 24 px right opens it; the drawer follows the finger meanwhile.
 * Ignored over horizontal scrollers (a chip row, a table) and over the tree,
 * and when the move is mostly vertical (a scroll). Pointer Events only.
 */

import { useEffect, useRef } from 'preact/hooks';

/** How close to the left edge a swipe must start, px. */
export const EDGE_PX = 16;
/** How far right it must travel to open the drawer, px. */
export const OPEN_TRAVEL_PX = 24;
/** Movement before the swipe decides between horizontal and vertical, px. */
const SLOP_PX = 6;

/** Whether `el` scrolls sideways (it has more content than width). */
function scrollsSideways(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const { overflowX } = getComputedStyle(el);
  return (
    (overflowX === 'auto' || overflowX === 'scroll') &&
    el.scrollWidth > el.clientWidth
  );
}

/** Whether a swipe starting on `target` belongs to something else. */
export function isOverIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  for (let el: Element | null = target; el !== null; el = el.parentElement) {
    if (el.getAttribute('role') === 'tree') return true;
    if (scrollsSideways(el)) return true;
  }
  return false;
}

/** Whether a pointer going down at `x` on `target` starts an edge swipe. */
export function startsEdgeSwipe(
  x: number,
  target: EventTarget | null,
): boolean {
  return x >= 0 && x <= EDGE_PX && !isOverIgnored(target);
}

export interface EdgeSwipeOptions {
  /** Off: no listener at all (desktop, the Folders tab, drawer open). */
  enabled: boolean;
  /** The finger is `px` right of where it started. */
  onDrag: (px: number) => void;
  /** Let go past the threshold. */
  onOpen: () => void;
  /** Let go short of it, or the move turned into a scroll. */
  onCancel: () => void;
}

interface Track {
  id: number;
  x: number;
  y: number;
  dragging: boolean;
}

export function useEdgeSwipe(options: EdgeSwipeOptions): void {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.enabled) return;
    let track: Track | null = null;

    function onDown(event: PointerEvent): void {
      if (event.pointerType === 'mouse') return;
      if (!startsEdgeSwipe(event.clientX, event.target)) return;
      track = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
      };
    }

    function onMove(event: PointerEvent): void {
      if (track === null || event.pointerId !== track.id) return;
      const dx = event.clientX - track.x;
      const dy = event.clientY - track.y;
      if (!track.dragging) {
        if (Math.abs(dy) > SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
          track = null;
          return;
        }
        if (dx <= SLOP_PX) return;
        track.dragging = true;
      }
      latest.current.onDrag(Math.max(0, dx));
    }

    function onUp(event: PointerEvent): void {
      if (track === null || event.pointerId !== track.id) return;
      const dx = event.clientX - track.x;
      const dragging = track.dragging;
      track = null;
      if (!dragging) return;
      if (dx >= OPEN_TRAVEL_PX) latest.current.onOpen();
      else latest.current.onCancel();
    }

    function onCancel(event: PointerEvent): void {
      if (track === null || event.pointerId !== track.id) return;
      const dragging = track.dragging;
      track = null;
      if (dragging) latest.current.onCancel();
    }

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, [options.enabled]);
}
