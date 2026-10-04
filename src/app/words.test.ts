import { describe, expect, it } from 'vitest';
import { countOr } from './words';

describe('counts', () => {
  it('a count still loading reads as the thing, not as zero', () => {
    expect(countOr(undefined, 'rule', 'Rules')).toBe('Rules');
    expect(countOr(0, 'rule', 'Rules')).toBe('0 rules');
    expect(countOr(1, 'rule', 'Rules')).toBe('1 rule');
  });
});
