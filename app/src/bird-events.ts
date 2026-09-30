/**
 * What wakes Bower and what puts him to sleep (D30, R-BIRD-12, WCAG 2.2.2).
 * A looping pose settles to its still key pose after `SETTLE_MS`; an event
 * wakes it for one more cycle; a tap on the nap button makes every bird nap
 * until the next tap or the next page load. A tiny external store, like
 * `bird-presence.ts`: `Bird` reads it, nothing here touches the DOM until a
 * bird asks for the listeners (`retainWakeListeners`).
 *
 * The events that wake him from here: a file dragged over the page, typing in
 * any text field (the composer, the search box) and a route change. A run
 * ending and the microphone turning on change the bird's own state (Done,
 * Listening), and a new state starts a new cycle by itself.
 */

import { useSyncExternalStore } from 'preact/compat';

/** How long a looping pose plays before it settles. */
export const SETTLE_MS = 10_000;

/** One cycle of the Asleep pose, which the nap plays before it holds still. */
export const NAP_CYCLE_MS = 4_800;

/** Wakes closer together than this are one wake (a drag fires constantly). */
const WAKE_THROTTLE_MS = 1_000;

let wakes = 0;
let napping = false;
let lastWake = Number.NEGATIVE_INFINITY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wakes every settled bird for one more cycle. */
export function wakeBird(): void {
  const now = Date.now();
  if (now - lastWake < WAKE_THROTTLE_MS) return;
  lastWake = now;
  wakes += 1;
  emit();
}

/** The nap button: naps every bird, or wakes them all again. */
export function toggleNap(): void {
  napping = !napping;
  emit();
}

export function isNapping(): boolean {
  return napping;
}

/** For tests: back to awake, no listeners. */
export function resetBirdEvents(): void {
  wakes = 0;
  napping = false;
  lastWake = Number.NEGATIVE_INFINITY;
  listeners.clear();
}

/** A number that changes on every wake (re-renders on change). */
export function useWakeCount(): number {
  return useSyncExternalStore(subscribe, () => wakes);
}

/** Whether Bower is napping (re-renders on change). */
export function useNapping(): boolean {
  return useSyncExternalStore(subscribe, isNapping);
}

function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types !== undefined && Array.from(types).includes('Files');
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target.isContentEditable
  );
}

let retained = 0;
let release: (() => void) | undefined;

function install(): () => void {
  const onDrag = (event: DragEvent): void => {
    if (hasFiles(event)) wakeBird();
  };
  const onInput = (event: Event): void => {
    if (isTextField(event.target)) wakeBird();
  };
  const onRoute = (): void => wakeBird();
  document.addEventListener('dragenter', onDrag);
  document.addEventListener('dragover', onDrag);
  document.addEventListener('input', onInput);
  window.addEventListener('popstate', onRoute);
  // The router changes the address with `pushState`, which fires no event.
  const push = history.pushState;
  const replace = history.replaceState;
  history.pushState = function (...args: Parameters<History['pushState']>) {
    push.apply(this, args);
    onRoute();
  };
  history.replaceState = function (
    ...args: Parameters<History['replaceState']>
  ) {
    replace.apply(this, args);
    onRoute();
  };
  return () => {
    document.removeEventListener('dragenter', onDrag);
    document.removeEventListener('dragover', onDrag);
    document.removeEventListener('input', onInput);
    window.removeEventListener('popstate', onRoute);
    history.pushState = push;
    history.replaceState = replace;
  };
}

/**
 * Listens for the wake events while at least one bird is mounted; returns the
 * release. Counted, so many birds share one set of listeners.
 */
export function retainWakeListeners(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  retained += 1;
  if (retained === 1) release = install();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    retained -= 1;
    if (retained === 0) {
      release?.();
      release = undefined;
    }
  };
}
