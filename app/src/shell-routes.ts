/**
 * Which routes render inside the shell (`components/layout.tsx`) and which
 * render bare (spec §14): sign-in, Not invited, Privacy, Terms, the
 * onboarding and the intro (#207, "What is Bower") — no top bar, no bottom
 * nav, no drawer for someone who has not signed in (or, for Privacy and
 * Terms, may never sign in at all; the intro reopens bare from Settings
 * too, since it is the same full-page track either way).
 *
 * Its own module, separate from `app.tsx`, so the split is unit-testable
 * without importing every route component and provider `app.tsx` pulls in.
 */
const BARE_PATHS = new Set([
  '/login',
  '/not-invited',
  '/privacy',
  '/terms',
  '/onboarding',
  '/welcome',
]);

/** The Bower tab (#317), which replaced `/tell`. */
export const BOWER_PATH = '/bower';

export function usesShell(path: string): boolean {
  return !BARE_PATHS.has(path);
}
