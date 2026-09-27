import { describe, expect, it } from 'vitest';

import { progressFor } from '../src/run-progress.js';

describe('progressFor', () => {
  it('present: both counts known', () => {
    expect(progressFor({ processed: 2, total: 3 })).toEqual({
      filed: 2,
      total: 3,
      ratio: 2 / 3,
    });
  });

  it('absent: either count missing is indeterminate', () => {
    expect(progressFor({})).toBeNull();
    expect(progressFor({ processed: 2 })).toBeNull();
    expect(progressFor({ total: 3 })).toBeNull();
  });

  it('a non-positive total is indeterminate', () => {
    expect(progressFor({ processed: 0, total: 0 })).toBeNull();
    expect(progressFor({ processed: 0, total: -1 })).toBeNull();
  });

  it('over 100%: ratio clamps to 1', () => {
    expect(progressFor({ processed: 5, total: 3 })).toEqual({
      filed: 5,
      total: 3,
      ratio: 1,
    });
  });
});
