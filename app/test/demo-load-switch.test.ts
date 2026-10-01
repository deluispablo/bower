// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEMO_FAIL_KEY,
  DEMO_SLOW_KEY,
  DEMO_SLOW_MS,
  demoReadWaitMs,
  demoSlowMs,
  takeDemoFail,
} from '../src/demo/load-switch.js';

afterEach(() => sessionStorage.clear());

describe('the demo load switches (#950)', () => {
  it('waits only while slow is on', () => {
    expect(demoSlowMs()).toBe(0);
    sessionStorage.setItem(DEMO_SLOW_KEY, '1');
    expect(demoSlowMs()).toBe(DEMO_SLOW_MS);
  });

  it('fails once, then clears itself so a retry works', () => {
    expect(takeDemoFail()).toBe(false);
    sessionStorage.setItem(DEMO_FAIL_KEY, '1');
    expect(takeDemoFail()).toBe(true);
    expect(takeDemoFail()).toBe(false);
  });

  it('lets reads in a row share one wait, and waits again after a pause', () => {
    sessionStorage.setItem(DEMO_SLOW_KEY, '1');
    expect(demoReadWaitMs(100_000)).toBe(DEMO_SLOW_MS);
    expect(demoReadWaitMs(100_000 + DEMO_SLOW_MS)).toBe(0);
    expect(demoReadWaitMs(100_000 + DEMO_SLOW_MS + 200)).toBe(0);
    expect(demoReadWaitMs(200_000)).toBe(DEMO_SLOW_MS);
  });
});
