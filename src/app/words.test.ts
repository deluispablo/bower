import { describe, expect, it } from 'vitest';
import { countOr } from './words';

describe('counts', () => {
  it('a count still loading reads as the thing, not as zero', () => {
    expect(countOr(undefined, 'rule', 'Rules')).toBe('Rules');
    expect(countOr(0, 'rule', 'Rules')).toBe('0 rules');
    expect(countOr(1, 'rule', 'Rules')).toBe('1 rule');
  });
});

import { goWithIt } from './words';

describe('words that agree', () => {
  it('one thing goes, things go', () => {
    expect(goWithIt(1)).toBe('The thing inside goes with it. You can get it back with Undo, or from the Bin of your Drive.');
    expect(goWithIt(3)).toBe('The 3 things inside go with it. You can get them back with Undo, or from the Bin of your Drive.');
  });
});
