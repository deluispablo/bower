/**
 * The one toast (issues #216, #304): a short line at the bottom of the
 * screen, with an optional link, that goes away by itself after
 * `TOAST_LIFETIME_MS` or when closed. Anything can show it — the pin entry
 * points (`pin-action.ts`), a finished run (`run-store.tsx`) — and it is
 * mounted once, in the shell (`components/layout.tsx`).
 *
 * The lifetime lives here, not in the component: the timer starts when the
 * toast is shown and clears it from the store, so a component that mounts
 * again (a route change, the shell coming back after a bare page) renders
 * whatever is still current and never brings back an expired toast. Same
 * plain pub/sub pattern as `switcher-store.ts`.
 */

import { useEffect, useState } from 'preact/hooks';

/** How long a toast stays up unless it is closed first. */
export const TOAST_LIFETIME_MS = 6_000;

export interface ToastLink {
  href: string;
  label: string;
}

/** A button on the toast (Undo): `run` is called once, then the toast goes. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastState {
  message: string;
  link?: ToastLink;
  action?: ToastAction;
  /** Bumped on every `showToast`, so the same text twice is a new toast. */
  id: number;
}

let current: ToastState | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(state: ToastState | null) => void>();

function set(next: ToastState | null): void {
  current = next;
  for (const listener of listeners) listener(current);
}

function clearTimer(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

/**
 * Shows `message` (and `link` or `action`, if any) for `TOAST_LIFETIME_MS`.
 */
export function showToast(
  message: string,
  link?: ToastLink,
  action?: ToastAction,
): void {
  clearTimer();
  const id = nextId;
  nextId += 1;
  set({
    message,
    id,
    ...(link === undefined ? {} : { link }),
    ...(action === undefined ? {} : { action }),
  });
  timer = setTimeout(() => {
    timer = null;
    if (current?.id === id) set(null);
  }, TOAST_LIFETIME_MS);
}

/** Hides the toast now (its Close button). */
export function dismissToast(): void {
  clearTimer();
  set(null);
}

/** The toast showing right now, or `null`. */
export function currentToast(): ToastState | null {
  return current;
}

/** The toast's state; re-renders the subscriber when it changes. */
export function useToast(): ToastState | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    // Catch up with a change made between the first render and this effect.
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
