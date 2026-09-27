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

  it('sends a signed-in user with a vault away from /login', () => {
    expect(decideRedirect('signed-in', true, '/login')).toBe('/');
  });

  it('never redirects away from the public /not-invited path', () => {
    expect(decideRedirect('signed-out', false, '/not-invited')).toBeNull();
    expect(decideRedirect('signed-in', false, '/not-invited')).toBeNull();
  });

  it('never redirects away from the public /privacy path', () => {
    expect(decideRedirect('signed-out', false, '/privacy')).toBeNull();
    expect(decideRedirect('signed-in', false, '/privacy')).toBeNull();
    expect(decideRedirect('signed-in', true, '/privacy')).toBeNull();
  });

  it('does not redirect while loading', () => {
    expect(decideRedirect('loading', false, '/')).toBeNull();
  });

  it('does not loop when already at the target', () => {
    expect(decideRedirect('signed-out', false, '/login')).toBeNull();
    expect(decideRedirect('signed-in', false, '/onboarding')).toBeNull();
  });

  // #207: a signed-out visitor who has never seen the intro lands on
  // /welcome from /, but not from a deep link, and /welcome is never
  // redirected away from either way.
  it('sends a signed-out visitor who has not seen the intro to /welcome from /', () => {
    expect(decideRedirect('signed-out', false, '/', false)).toBe('/welcome');
  });

  // #313, 6.3.2: /login is the way out of the intro, never a way in — a
  // sign-in link or a reload of the sign-in page must never show the
  // intro instead of the sign-in form.
  it('never redirects /login to the intro, seen or not', () => {
    expect(decideRedirect('signed-out', false, '/login', false)).toBeNull();
    expect(decideRedirect('signed-out', false, '/login', true)).toBeNull();
  });

  it('never sends a deep link to /welcome, even unseen', () => {
    expect(decideRedirect('signed-out', false, '/note/id-1', false)).toBe(
      '/login',
    );
    expect(
      decideRedirect('signed-out', false, '/not-invited', false),
    ).toBeNull();
  });

  it('leaves a signed-out visitor who has seen the intro alone', () => {
    expect(decideRedirect('signed-out', false, '/', true)).toBe('/login');
  });

  it('never redirects away from /welcome itself, signed in or out', () => {
    expect(decideRedirect('signed-out', false, '/welcome', false)).toBeNull();
    expect(decideRedirect('signed-in', true, '/welcome')).toBeNull();
    expect(decideRedirect('signed-in', false, '/welcome')).toBeNull();
  });

  // #193: the demo signs in as Alex from the very first load (`getMe()`
  // always answers signed in, `demo/api.ts`), so without this check a
  // first-time visitor would skip the intro and "Run your own Bower"
  // entirely and land straight in the app.
  describe('in a demo build', () => {
    it('sends a first-time visitor to /welcome from / even though already signed in', () => {
      expect(decideRedirect('signed-in', true, '/', false, true)).toBe(
        '/welcome',
      );
    });

    // #313: /login never redirects to the intro, in the demo either — it
    // renders "Run your own Bower" there instead (`app.tsx`).
    it('never redirects /login to the intro, even unseen', () => {
      expect(
        decideRedirect('signed-in', true, '/login', false, true),
      ).toBeNull();
    });

    it('goes home once the intro has been seen (Skip or Explore the demo)', () => {
      expect(decideRedirect('signed-in', true, '/', true, true)).toBeNull();
    });

    // #287: the tour's last step links to /login, which a demo build
    // renders as "Run your own Bower" (`app.tsx`), not a sign-in form. A
    // signed-in-as-Alex visitor who already saw the intro must be able to
    // land there instead of bouncing back to Home.
    it('leaves /login alone once the intro has been seen', () => {
      expect(
        decideRedirect('signed-in', true, '/login', true, true),
      ).toBeNull();
    });

    it('never sends a deep link to /welcome, even unseen', () => {
      expect(
        decideRedirect('signed-in', true, '/note/id-1', false, true),
      ).toBeNull();
    });

    it('does not apply outside a demo build', () => {
      expect(decideRedirect('signed-in', true, '/', false, false)).toBeNull();
    });
  });
});
