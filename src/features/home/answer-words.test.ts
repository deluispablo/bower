import { describe, expect, it } from 'vitest';
import { answered, answeredNow, answerWaits } from './answer-words';

describe('answers', () => {
  it('an answer is confirmed in its own words, yes or no', () => {
    expect(answered('Keep one')).toBe('You chose "Keep one". Bower does it in the next tidy-up.');
    expect(answered('Yes, merge')).toBe('You chose "Yes, merge". Bower does it in the next tidy-up.');
  });

  it('an answer that starts a tidy-up says so, and a start that fails says the answer waits', () => {
    expect(answeredNow('Yes, keep one')).toBe('You chose "Yes, keep one". Bower is doing it now.');
    expect(answerWaits('You have tidied up enough for today.')).toBe('Your answer is saved for the next tidy-up. You have tidied up enough for today.');
    expect(answerWaits(null)).toBe('Your answer is saved for the next tidy-up.');
  });
});
