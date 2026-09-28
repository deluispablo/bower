/**
 * The Ideas screen's data (#332): the groups match the board
 * (`Phone-Ideas.dc.html`), and `ideaHref` builds the same `/bower?text=…`
 * prefill link Health's "Ask Bower to fix these" uses.
 */

import { describe, expect, it } from 'vitest';

import { IDEAS, ideaHref } from '../src/ideas.js';

describe('IDEAS', () => {
  it("has the board's five groups, in order", () => {
    expect(IDEAS.map((group) => group.title)).toEqual([
      'Home and money',
      'Health',
      'Trips and projects',
      'Reading',
      'Rules that save time',
    ]);
  });

  it('gives every idea a non-empty prompt', () => {
    for (const group of IDEAS) {
      expect(group.ideas.length).toBeGreaterThan(0);
      for (const idea of group.ideas) {
        expect(idea.prompt.trim()).not.toBe('');
        expect(idea.text.trim()).not.toBe('');
      }
    }
  });
});

describe('ideaHref', () => {
  it('encodes the prompt into a Bower tab prefill link', () => {
    expect(ideaHref('How much did I spend on groceries this month?')).toBe(
      '/bower?text=How%20much%20did%20I%20spend%20on%20groceries%20this%20month%3F',
    );
  });
});
