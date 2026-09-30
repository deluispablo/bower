/** First name and initial of the signed-in person (#905, R-API-13). */

import { describe, expect, it } from 'vitest';

import { personOf } from '../src/session.js';

describe('personOf', () => {
  it('reads the first name and its initial', () => {
    expect(personOf({ name: 'Alex Doe', email: 'you@example.com' })).toEqual({
      firstName: 'Alex',
      initial: 'A',
    });
  });

  it('falls back to the address for the initial, never inventing a name', () => {
    expect(personOf({ email: 'you@example.com' })).toEqual({
      firstName: null,
      initial: 'Y',
    });
  });

  it('shows "?" with nobody signed in', () => {
    expect(personOf(undefined)).toEqual({ firstName: null, initial: '?' });
  });
});
