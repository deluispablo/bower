// @vitest-environment jsdom

/**
 * The start-up screen's states and hand-over (#985, R-BOOT-10 to R-BOOT-16).
 * The `#boot` markup is #984's contract, built here by hand; time is fake,
 * including `performance.now()`, which stands for "since navigation start".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMedia } from '../test/helpers/match-media.js';

const { focusNewPage } = vi.hoisted(() => ({ focusNewPage: vi.fn() }));
vi.mock('./components/layout.js', () => ({ focusNewPage }));

type BootModule = typeof import('./boot-screen.js');

function mountBoot(): HTMLElement {
  document.body.innerHTML = `
    <div id="boot" aria-busy="true">
      <p class="boot-line" role="status" aria-live="polite">Opening Bower…</p>
      <p class="boot-hint"></p>
      <a class="boot-retry" href="">Try again</a>
    </div>
    <div id="app"></div>`;
  const boot = document.getElementById('boot');
  if (boot === null) throw new Error('no #boot');
  return boot;
}

function text(selector: string): string | null | undefined {
  return document.querySelector(selector)?.textContent;
}

/** A fresh module per test: its timers and "dismissed" flag are module state. */
async function load(): Promise<BootModule> {
  vi.resetModules();
  return import('./boot-screen.js');
}

beforeEach(() => {
  vi.useFakeTimers({
    now: 0,
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  focusNewPage.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('boot states', () => {
  it('goes from normal to slow at 8 s with BOOT-2 and BOOT-3', async () => {
    const boot = mountBoot();
    const { startBootTimers } = await load();
    startBootTimers();
    vi.advanceTimersByTime(7_999);
    expect(boot.dataset.state).toBeUndefined();
    expect(text('.boot-line')).toBe('Opening Bower…');
    vi.advanceTimersByTime(1);
    expect(boot.dataset.state).toBe('slow');
    expect(text('.boot-line')).toBe('Still loading…');
    expect(text('.boot-hint')).toBe('This is taking longer than usual.');
  });

  it('counts the 8 s from navigation start, not from the call', async () => {
    const boot = mountBoot();
    vi.advanceTimersByTime(3_000);
    const { startBootTimers } = await load();
    startBootTimers();
    vi.advanceTimersByTime(5_000);
    expect(boot.dataset.state).toBe('slow');
  });

  it('never flashes slow when the script arrives late and the session answers at once', async () => {
    const boot = mountBoot();
    vi.advanceTimersByTime(9_000);
    const { dismissBoot, startBootTimers } = await load();
    startBootTimers();
    vi.advanceTimersByTime(50);
    expect(boot.dataset.state).toBeUndefined();
    dismissBoot();
    vi.advanceTimersByTime(5_000);
    expect(boot.dataset.state).toBeUndefined();
    expect(boot.querySelector('.boot-line')?.textContent).toBe(
      'Opening Bower…',
    );
    expect(boot.isConnected).toBe(false);
  });

  it('shows slow 1500 ms after a late start with no answer', async () => {
    const boot = mountBoot();
    vi.advanceTimersByTime(9_000);
    const { startBootTimers } = await load();
    startBootTimers();
    vi.advanceTimersByTime(1_499);
    expect(boot.dataset.state).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(boot.dataset.state).toBe('slow');
  });

  it('shows the error text, and slow never replaces it', async () => {
    const boot = mountBoot();
    const { bootState, startBootTimers } = await load();
    startBootTimers();
    bootState('error');
    expect(boot.dataset.state).toBe('error');
    expect(text('.boot-line')).toBe('Bower could not reach the server.');
    expect(text('.boot-hint')).toBe('Check your connection and try again.');
    vi.advanceTimersByTime(10_000);
    expect(boot.dataset.state).toBe('error');
  });

  it('shows the offline text and reloads on the online event', async () => {
    const boot = mountBoot();
    const add = vi.spyOn(window, 'addEventListener');
    const { bootState } = await load();
    bootState('offline');
    expect(boot.dataset.state).toBe('offline');
    expect(text('.boot-line')).toBe("You're offline.");
    expect(text('.boot-hint')).toBe("Bower opens when you're back online.");
    expect(add).toHaveBeenCalledWith('online', expect.any(Function));
  });

  it('does nothing without #boot', async () => {
    const { bootState, dismissBoot, startBootTimers } = await load();
    expect(() => {
      startBootTimers();
      bootState('error');
      bootState('offline');
      dismissBoot();
      vi.advanceTimersByTime(20_000);
    }).not.toThrow();
    expect(document.getElementById('boot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('hand-over', () => {
  it('removes the screen at once before 600 ms', async () => {
    mountBoot();
    vi.advanceTimersByTime(300);
    const { dismissBoot, startBootTimers } = await load();
    startBootTimers();
    dismissBoot();
    expect(document.getElementById('boot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits until 1100 ms when dismissed at 700 ms, then fades out', async () => {
    const boot = mountBoot();
    vi.advanceTimersByTime(700);
    const { dismissBoot } = await load();
    dismissBoot();
    vi.advanceTimersByTime(399);
    expect(boot.isConnected).toBe(true);
    expect(boot.dataset.leaving).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(boot.dataset.leaving).toBe('');
    expect(boot.dataset.state).toBeUndefined();
    expect(boot.isConnected).toBe(true);
    vi.advanceTimersByTime(250);
    expect(boot.isConnected).toBe(false);
  });

  it('removes the screen on transitionend before the 250 ms fallback', async () => {
    const boot = mountBoot();
    vi.advanceTimersByTime(2_000);
    const { dismissBoot } = await load();
    dismissBoot();
    vi.advanceTimersByTime(0);
    expect(boot.dataset.leaving).toBe('');
    boot.dispatchEvent(new Event('transitionend'));
    expect(boot.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the screen with no fade under reduced motion', async () => {
    const boot = mountBoot();
    stubMatchMedia((query) => query.includes('reduce'));
    vi.advanceTimersByTime(800);
    const { dismissBoot } = await load();
    dismissBoot();
    vi.advanceTimersByTime(300);
    expect(boot.isConnected).toBe(false);
    expect(boot.dataset.leaving).toBeUndefined();
  });

  it('clears the slow timer and the online listener', async () => {
    const boot = mountBoot();
    const remove = vi.spyOn(window, 'removeEventListener');
    vi.advanceTimersByTime(700);
    const { bootState, dismissBoot, startBootTimers } = await load();
    startBootTimers();
    bootState('offline');
    dismissBoot();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    vi.advanceTimersByTime(10_000);
    expect(boot.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the state, line and hint while it fades', async () => {
    const boot = mountBoot();
    const { bootState, dismissBoot } = await load();
    bootState('error');
    vi.advanceTimersByTime(700);
    dismissBoot();
    vi.advanceTimersByTime(400);
    expect(boot.dataset.leaving).toBe('');
    expect(boot.dataset.state).toBe('error');
    expect(text('.boot-line')).toBe('Bower could not reach the server.');
    expect(text('.boot-hint')).toBe('Check your connection and try again.');
  });

  it('hands focus over at the start of the fade, before data-leaving', async () => {
    const boot = mountBoot();
    const retry = boot.querySelector<HTMLElement>('.boot-retry');
    retry?.focus();
    focusNewPage.mockImplementation(() => {
      expect(boot.dataset.leaving).toBeUndefined();
    });
    vi.advanceTimersByTime(700);
    const { dismissBoot } = await load();
    dismissBoot();
    vi.advanceTimersByTime(400);
    expect(focusNewPage).toHaveBeenCalledTimes(1);
    expect(focusNewPage).toHaveBeenCalledWith(null);
    expect(boot.dataset.leaving).toBe('');
    vi.advanceTimersByTime(250);
    expect(boot.isConnected).toBe(false);
    expect(focusNewPage).toHaveBeenCalledTimes(1);
  });

  it('ends focus on the page heading, not on body (real focusNewPage)', async () => {
    const real = await vi.importActual<typeof import('./components/layout.js')>(
      './components/layout.js',
    );
    focusNewPage.mockImplementation(real.focusNewPage);
    const boot = mountBoot();
    const app = document.getElementById('app');
    if (app === null) throw new Error('no #app');
    app.innerHTML = '<main><h1>Home</h1></main>';
    const heading = app.querySelector('h1');
    if (heading === null) throw new Error('no heading');
    // jsdom lays nothing out: make the heading count as shown.
    heading.getClientRects = (): DOMRectList => [{}] as unknown as DOMRectList;
    boot.querySelector<HTMLElement>('.boot-retry')?.focus();
    vi.advanceTimersByTime(700);
    const { dismissBoot } = await load();
    dismissBoot();
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(250);
    vi.advanceTimersToNextFrame();
    expect(boot.isConnected).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  it('runs once', async () => {
    mountBoot();
    vi.advanceTimersByTime(700);
    const { dismissBoot } = await load();
    dismissBoot();
    dismissBoot();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('moves focus to the new page when it was on "Try again"', async () => {
    const boot = mountBoot();
    const retry = boot.querySelector<HTMLElement>('.boot-retry');
    retry?.focus();
    expect(document.activeElement).toBe(retry);
    const { dismissBoot } = await load();
    dismissBoot();
    expect(focusNewPage).toHaveBeenCalledWith(null);
    expect(boot.isConnected).toBe(false);
  });

  it('leaves focus alone otherwise', async () => {
    mountBoot();
    const { dismissBoot } = await load();
    dismissBoot();
    expect(focusNewPage).not.toHaveBeenCalled();
  });
});
