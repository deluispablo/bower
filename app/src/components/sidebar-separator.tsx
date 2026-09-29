/**
 * The desktop sidebar's resize handle (R-SIDE-1, R-SIDE-4).
 *
 * A vertical `role="separator"` on the sidebar's right edge. The width lives
 * in the `--sidebar-width` custom property of the shell (`.shell`), which the
 * grid, the toast and the ledge already read. A pointer drag writes that
 * property straight to the DOM once per animation frame and never touches
 * component state, so neither the tree nor the rest of the page re-renders
 * while the pointer moves. The width is committed (state and
 * `bower:pref:sidebarWidth`) when the drag ends or a key is pressed.
 *
 * Mount it inside `.shell-sidebar` (a positioned box): the handle is placed
 * on that box's right edge by `explorer.css`.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 264;
export const SIDEBAR_STEP = 16;
/** The main column never gets narrower than this (R-SIDE-2). */
const MAIN_MIN = 560;
const STORAGE_KEY = 'bower:pref:sidebarWidth';

/** `px` kept to 200 to 480 and to what leaves the main column 560 px in a
 * window `viewport` px wide (the 200 floor wins). */
export function clampWidth(px: number, viewport: number): number {
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewport - MAIN_MIN));
  return Math.min(max, Math.max(SIDEBAR_MIN, Math.round(px)));
}

/** The width a key asks for from `current`, or `null` for a key that does
 * not resize. */
export function widthForKey(key: string, current: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return current - SIDEBAR_STEP;
    case 'ArrowRight':
      return current + SIDEBAR_STEP;
    case 'Home':
      return SIDEBAR_MIN;
    case 'End':
      return SIDEBAR_MAX;
    case 'Enter':
      return SIDEBAR_DEFAULT;
    default:
      return null;
  }
}

function readStoredWidth(): number {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    );
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  } catch {
    // Storage blocked or unreadable: the default applies.
  }
  return SIDEBAR_DEFAULT;
}

function storeWidth(px: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(px));
  } catch (error) {
    // Storage blocked: the width still applies for this visit.
    console.warn('Could not remember the sidebar width', error);
  }
}

export function SidebarSeparator(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // What was asked for (stored or dragged), and the window it must fit; the
  // value shown is the clamped result, so a narrow window reports the width
  // actually on screen.
  const [stored, setStored] = useState(readStoredWidth);
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const width = clampWidth(stored, viewport);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    startX: number;
    startWidth: number;
    latest: number;
    frame: number | null;
  } | null>(null);

  /** The shell that owns `--sidebar-width`. */
  function shell(): HTMLElement {
    return ref.current?.closest<HTMLElement>('.shell') ?? document.body;
  }

  /** The width now on screen, from the sidebar's own box. */
  function current(): number {
    const box = ref.current?.parentElement;
    const measured = box?.getBoundingClientRect().width ?? 0;
    return measured > 0 ? Math.round(measured) : SIDEBAR_DEFAULT;
  }

  // Follow the stored width on mount and keep the handle's value in step.
  useEffect(() => {
    const measured = ref.current?.parentElement?.getBoundingClientRect().width;
    if (measured !== undefined && measured > 0) setStored(Math.round(measured));
    const onResize = (): void => {
      setViewport(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(
    () => () => {
      const state = drag.current;
      if (state?.frame != null) cancelAnimationFrame(state.frame);
    },
    [],
  );

  /** Writes `px` to the DOM only (no state), for the drag's frames. */
  function paint(px: number): void {
    shell().style.setProperty('--sidebar-width', `${px}px`);
    ref.current?.setAttribute('aria-valuenow', String(px));
  }

  function commit(px: number): void {
    paint(px);
    setStored(px);
    storeWidth(px);
  }

  function onPointerDown(
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = current();
    drag.current = {
      startX: event.clientX,
      startWidth: start,
      latest: start,
      frame: null,
    };
    setDragging(true);
  }

  function onPointerMove(
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ): void {
    const state = drag.current;
    if (state === null) return;
    state.latest = clampWidth(
      state.startWidth + event.clientX - state.startX,
      window.innerWidth,
    );
    if (state.frame !== null) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = null;
      paint(state.latest);
    });
  }

  function endDrag(event: JSX.TargetedPointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (state === null) return;
    drag.current = null;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    commit(state.latest);
  }

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLDivElement>): void {
    const next = widthForKey(event.key, width);
    if (next === null) return;
    event.preventDefault();
    commit(clampWidth(next, window.innerWidth));
  }

  return (
    <div
      ref={ref}
      class={`sidebar-separator${dragging ? ' sidebar-separator-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDblClick={() => {
        commit(SIDEBAR_DEFAULT);
      }}
    />
  );
}
