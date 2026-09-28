import { describe, expect, it } from 'vitest';

import { formatVersion } from '../src/routes/settings.js';

describe('formatVersion (#512)', () => {
  it('joins the version and the commit with a middle dot', () => {
    expect(formatVersion('0.1.0', 'a1b2c3d')).toBe('0.1.0 · a1b2c3d');
  });

  it('leaves no dangling separator when the commit is unknown', () => {
    expect(formatVersion('0.1.0', '')).toBe('0.1.0');
  });
});
