import { describe, expect, it } from 'vitest';
import { answered } from './answer-words';

describe('answers', () => {
  it('an answer is confirmed in its own words, yes or no', () => {
    expect(answered('Keep one')).toBe('You chose "Keep one". Bower does it in the next tidy-up.');
    expect(answered('Yes, merge')).toBe('You chose "Yes, merge". Bower does it in the next tidy-up.');
  });
});
