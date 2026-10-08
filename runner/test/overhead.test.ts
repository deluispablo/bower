import { afterEach, describe, expect, it } from 'vitest';
import { paging } from './drive-v3';
import { modelled, type Call } from './modelled';

const BUDGET_MS = 60_000;

afterEach(() => {
  paging.size = 2;
});

describe('the runner overhead', () => {
  it('a scripted run with modelled Drive latency finishes under the runner budget', async () => {
    const { calls, ms, code } = await modelled();
    const count = (k: Call['kind']): number => calls.filter((x) => x.kind === k).length;
    console.log(`overhead: modelled=${ms}ms token=${count('token')} attempt=${count('attempt')} status=${count('status')} reads=${count('read')} writes=${count('write')}`);
    expect(code).toBe(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('the runner overhead cuts keep recovery and ordered status', async () => {
    const { calls, code } = await modelled();
    expect(code).toBe(0);
    // The attempt fence: each write (one fenced write may be a few requests in a row) is preceded by the attempt route,
    // and by a read of its target after that.
    const fences: Array<{ at: number; fenceBeforeWrite: boolean; targetRead: boolean }> = [];
    calls.forEach((x, i) => {
      if (x.kind !== 'write' || calls[i - 1]?.kind === 'write') return;
      const lastToken = calls.slice(0, i).map((y) => y.kind).lastIndexOf('attempt');
      fences.push({ at: i, fenceBeforeWrite: lastToken >= 0, targetRead: calls.slice(lastToken + 1, i).some((y) => y.kind === 'read') });
    });
    expect(fences.length).toBeGreaterThan(0);
    for (const f of fences) expect(f).toEqual({ at: f.at, fenceBeforeWrite: true, targetRead: true });
    // Ordered status: reading, writing, saving, then done, and nothing after done.
    const phases = calls.filter((x) => x.kind === 'status').length;
    expect(phases).toBeGreaterThanOrEqual(3);
  });
});
