import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The phone's back button (and the browser's) closes an open overlay instead
 * of leaving the page under it. Opening pushes a history entry for the same
 * URL; going back pops it and closes the overlay; closing it any other way
 * goes back over that entry itself.
 *
 * Those self-made backs must not close anything else: one overlay closing as
 * another opens (the tidy-up sheet handing over to the replay) would
 * otherwise close the new one. So the module counts its own backs, marks the
 * popstate they cause, and new entries wait until that back has landed.
 */
let selfBacks = 0;
let lastPopWasSelf = false;
let landed: Promise<void> = Promise.resolve();
let settle: (() => void) | null = null;
// Open overlays live here, independently of the history entries still waiting to land.
let openOverlays = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const isOpen = (): boolean => openOverlays > 0;
const serverOpen = (): boolean => false;

export function useOverlaysOpen(): boolean {
  return useSyncExternalStore(subscribe, isOpen, serverOpen);
}

if (typeof window !== 'undefined') {
  // Registered first, so it runs before any overlay's listener.
  window.addEventListener('popstate', () => {
    lastPopWasSelf = selfBacks > 0;
    if (selfBacks > 0) selfBacks--;
    if (selfBacks === 0 && settle) {
      settle();
      settle = null;
    }
  });
}

/** Resolves once the app's own backs (from closing overlays) have landed; navigate after it. */
export function afterOverlaysClosed(): Promise<void> {
  return selfBacks > 0 ? landed : Promise.resolve();
}

function goBackOver(): void {
  if (selfBacks === 0) landed = new Promise((r) => (settle = r));
  selfBacks++;
  history.back();
}

export function useBackCloses(open: boolean, close: () => void): void {
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    if (!open) return;
    openOverlays++;
    for (const listener of listeners) listener();
    return () => {
      openOverlays--;
      for (const listener of listeners) listener();
    };
  }, [open]);
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    let live = true;
    let pushed = false;
    let poppedByBack = false;
    const onPop = (): void => {
      if (lastPopWasSelf) return;
      poppedByBack = true;
      closeRef.current();
    };
    void landed.then(() => {
      if (!live) return;
      history.pushState({ ...(history.state as object | null), bowerOverlay: id }, '');
      pushed = true;
      window.addEventListener('popstate', onPop);
    });
    return () => {
      live = false;
      window.removeEventListener('popstate', onPop);
      const st = history.state as { bowerOverlay?: string } | null;
      if (pushed && !poppedByBack && st?.bowerOverlay === id) goBackOver();
    };
  }, [open]);
}
