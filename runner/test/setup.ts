/**
 * The runner's retries (`src/retry.ts`) wait no real time in tests: a test that loses the network (a killed runner,
 * a failed read) would otherwise sleep up to 7 s per call. The retry test sets the real waits, with timers faked.
 */
import { beforeEach } from 'vitest';
import { backoff } from '../src/retry';

beforeEach(() => {
  backoff.baseMs = 0;
});
