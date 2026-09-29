import { describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import { reduce, sheetShowsResult } from '../src/run-store.js';
import type { RunState } from '../src/run-store.js';

const done: Run = {
  state: 'done',
  requestedAt: '2026-01-01T00:00:00.000Z',
  processed: ['a.md'],
};

describe('a done run met cold', () => {
  const cold: RunState = {
    phase: 'idle',
    run: null,
    sheetOpen: false,
    sheetRunId: null,
  };

  it('arrives idle with its sheet closed, waiting for the chip', () => {
    const met = reduce(cold, { type: 'status', run: done, stale: false });
    expect(met).toMatchObject({ phase: 'idle', sheetOpen: false });
    expect(reduce(met, { type: 'sheet-opened' }).sheetOpen).toBe(true);
  });

  it('a later poll of the same run does not close the sheet the chip opened', () => {
    const met = reduce(cold, { type: 'status', run: done, stale: false });
    const opened = reduce(met, { type: 'sheet-opened' });
    const again = reduce(opened, { type: 'status', run: done, stale: false });
    expect(again.sheetOpen).toBe(true);
  });
});

describe('sheetShowsResult', () => {
  it('counts the run as seen only when an open sheet shows a finished result', () => {
    expect(sheetShowsResult('idle', true, done)).toBe(true);
    expect(sheetShowsResult('done', true, done)).toBe(true);
    expect(sheetShowsResult('idle', false, done)).toBe(false);
    expect(sheetShowsResult('idle', true, null)).toBe(false);
    expect(sheetShowsResult('running', true, done)).toBe(false);
    expect(sheetShowsResult('quota', true, done)).toBe(false);
    expect(sheetShowsResult('starting', true, done)).toBe(false);
  });
});
