// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEMO_FAIL_KEY,
  DEMO_SLOW_KEY,
  DEMO_SLOW_MS,
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
});
