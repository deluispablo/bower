import { describe, expect, it } from 'vitest';

import { labelFor } from '../src/components/process-button.js';

describe('labelFor', () => {
  it('idle: "Tidy up", or with a pending count', () => {
    expect(labelFor('idle', 0)).toBe('Tidy up');
    expect(labelFor('idle', 3)).toBe('Tidy up (3)');
  });

  it('queued and running: "Tidying up…"', () => {
    expect(labelFor('queued', 0)).toBe('Tidying up…');
    expect(labelFor('running', 0)).toBe('Tidying up…');
  });

  it('done, failed, stale and quota: unchanged', () => {
    expect(labelFor('done', 0)).toBe('Done ✓');
    expect(labelFor('failed', 0)).toBe('Failed');
    expect(labelFor('stale', 0)).toBe('Failed');
    expect(labelFor('quota', 0)).toBe('Limit reached');
  });
});
