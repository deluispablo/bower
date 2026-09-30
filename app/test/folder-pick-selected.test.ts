import { describe, expect, it } from 'vitest';

import { pickSelected } from '../src/components/folder-items.js';

const rows = [
  { key: 'a', file: { id: 'hub' } },
  { key: 'b', file: { id: 'two' } },
  { key: 'c', file: { id: 'three' } },
];

describe('pickSelected', () => {
  it('preselects the first row when nothing is skipped', () => {
    expect(pickSelected(rows, null)?.key).toBe('a');
  });

  it('never preselects the skipped project note on its own', () => {
    expect(pickSelected(rows, null, 'hub')?.key).toBe('b');
  });

  it('still shows the project note when its row is chosen', () => {
    expect(pickSelected(rows, 'a', 'hub')?.key).toBe('a');
  });

  it('is null when the only row is the skipped one', () => {
    expect(pickSelected(rows.slice(0, 1), null, 'hub')).toBeNull();
  });
});
