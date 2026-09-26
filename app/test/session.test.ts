import { describe, expect, it } from 'vitest';

import { decideRedirect } from '../src/session.js';

// Components are UI smoke only when cheap; `decideRedirect` is the pure
// logic that decides routing on load, so it is unit-tested directly.
describe('decideRedirect', () => {
  it('sends a signed-out user to /login', () => {
    expect(decideRedirect('signed-out', false, '/')).toBe('/login');
  });

  it('sends a signed-in user with no vault to /onboarding', () => {
    expect(decideRedirect('signed-in', false, '/')).toBe('/onboarding');
  });

  it('leaves a signed-in user with a vault on the current path', () => {
    expect(decideRedirect('signed-in', true, '/settings')).toBeNull();
  });

  it('never redirects away from the public /not-invited path', () => {
    expect(decideRedirect('signed-out', false, '/not-invited')).toBeNull();
    expect(decideRedirect('signed-in', false, '/not-invited')).toBeNull();
  });

  it('does not redirect while loading', () => {
    expect(decideRedirect('loading', false, '/')).toBeNull();
  });

  it('does not loop when already at the target', () => {
    expect(decideRedirect('signed-out', false, '/login')).toBeNull();
    expect(decideRedirect('signed-in', false, '/onboarding')).toBeNull();
  });
});
