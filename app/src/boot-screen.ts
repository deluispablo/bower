/**
 * The start-up screen's states and hand-over (#985, spec §6.2, §6.3).
 *
 * `#boot` is static markup in `index.html` (#984), shown from the first
 * paint. This module only changes it: a "Still loading…" state at 8 s, the
 * offline and error states when the session check fails with nothing saved,
 * and its removal once the real screen has rendered under it.
 *
 * Every export is a no-op when `#boot` is absent: in tests, and in any
 * render without it.
 */

import { focusNewPage } from './components/layout.js';

export type BootState = 'slow' | 'offline' | 'error';

/** From navigation start: when the slow state shows (R-BOOT-11). */
export const BOOT_SLOW_MS = 8_000;
/** Started at or after `BOOT_SLOW_MS`: wait this long before the slow state. */
export const BOOT_LATE_SLOW_MS = 1_500;
/** Dismissed before this, the screen goes at once: only the bird was shown. */
export const BOOT_INSTANT_MS = 600;
/** Dismissed after `BOOT_INSTANT_MS`, the screen stays at least until this. */
export const BOOT_MIN_SHOWN_MS = 1_100;
/** Removal fallback when no `transitionend` arrives. */
export const BOOT_LEAVE_MS = 250;

/** The copy per state, BOOT-2 to BOOT-7 (spec §7). */
export const BOOT_COPY: Readonly<
  Record<BootState, { line: string; hint: string }>
> = {
  slow: {
    line: 'Still loading…',
    hint: 'This is taking longer than usual.',
  },
  offline: {
    line: "You're offline.",
    hint: "Bower opens when you're back online.",
  },
  error: {
    line: 'Bower could not reach the server.',
    hint: 'Check your connection and try again.',
  },
};

let slowTimer: ReturnType<typeof setTimeout> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let removeTimer: ReturnType<typeof setTimeout> | undefined;
let onOnline: (() => void) | undefined;
let dismissed = false;
let focusHandedOver = false;

function bootElement(): HTMLElement | null {
  return document.getElementById('boot');
}

/** Milliseconds since navigation start. */
function sinceStart(): number {
  return performance.now();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clearTimers(): void {
  clearTimeout(slowTimer);
  clearTimeout(leaveTimer);
  clearTimeout(removeTimer);
  slowTimer = undefined;
  leaveTimer = undefined;
  removeTimer = undefined;
  if (onOnline !== undefined) {
    window.removeEventListener('online', onOnline);
    onOnline = undefined;
  }
}

/**
 * Shows a state on the start-up screen (R-BOOT-10): sets `data-state` and
 * replaces the status line's text, so screen readers announce it. Slow never
 * replaces offline or error. Offline reloads the page once the device is
 * back online (R-BOOT-14).
 */
export function bootState(state: BootState): void {
  const boot = bootElement();
  if (boot === null || dismissed) return;
  const current = boot.dataset.state;
  if (state === 'slow' && current !== undefined) return;
  boot.dataset.state = state;
  const line = boot.querySelector('.boot-line');
  const hint = boot.querySelector('.boot-hint');
  if (line !== null) line.textContent = BOOT_COPY[state].line;
  if (hint !== null) hint.textContent = BOOT_COPY[state].hint;
  if (state === 'slow') return;
  clearTimeout(slowTimer);
  slowTimer = undefined;
  if (state === 'offline' && onOnline === undefined) {
    onOnline = (): void => {
      window.location.reload();
    };
    window.addEventListener('online', onOnline);
  }
}

/** Starts the 8 s "Still loading…" timer (R-BOOT-11). Call before `render`. */
export function startBootTimers(): void {
  if (bootElement() === null || dismissed) return;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    slowTimer = undefined;
    bootState('slow');
  }, slowDelay(sinceStart()));
}

/**
 * How long until "Still loading…". From navigation start to 8 s; when the
 * script itself arrives at 8 s or later, a grace of `BOOT_LATE_SLOW_MS` first,
 * so a session that answers at once never flashes it during the fade (the
 * CSS already shows the hint and "Try again" by then, #987).
 */
function slowDelay(now: number): number {
  return now >= BOOT_SLOW_MS ? BOOT_LATE_SLOW_MS : BOOT_SLOW_MS - now;
}

/**
 * R-BOOT-15: focus never stays on a node that is about to go. Runs before any
 * attribute change, since hiding "Try again" would blur it to `<body>` first.
 */
function handOverFocus(boot: HTMLElement): void {
  if (focusHandedOver) return;
  const retry = boot.querySelector('.boot-retry');
  if (retry !== null && document.activeElement === retry) {
    focusHandedOver = true;
    focusNewPage(null);
  }
}

function removeBoot(boot: HTMLElement): void {
  clearTimers();
  if (!boot.isConnected) return;
  handOverFocus(boot);
  boot.remove();
}

/**
 * The fade (R-BOOT-12). `data-leaving` is its own attribute so `data-state`,
 * and with it the line, hint and "Try again", stay as they were while the
 * screen fades.
 */
function leave(boot: HTMLElement): void {
  leaveTimer = undefined;
  handOverFocus(boot);
  if (prefersReducedMotion()) {
    removeBoot(boot);
    return;
  }
  boot.dataset.leaving = '';
  boot.addEventListener('transitionend', () => removeBoot(boot), {
    once: true,
  });
  removeTimer = setTimeout(() => removeBoot(boot), BOOT_LEAVE_MS);
}

/**
 * Hands over to the real screen (R-BOOT-12, spec §6.3). Under 600 ms the
 * screen goes at once; otherwise it stays until 1100 ms, then fades and is
 * removed on `transitionend` or after 250 ms (`data-leaving`). Under reduced motion it goes
 * with no fade. Runs once; later calls do nothing.
 */
export function dismissBoot(): void {
  if (dismissed) return;
  const boot = bootElement();
  if (boot === null) return;
  dismissed = true;
  clearTimers();
  const t = sinceStart();
  if (t < BOOT_INSTANT_MS) {
    removeBoot(boot);
    return;
  }
  leaveTimer = setTimeout(
    () => leave(boot),
    Math.max(0, BOOT_MIN_SHOWN_MS - t),
  );
}
