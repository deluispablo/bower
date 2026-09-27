/**
 * Which routes render inside the shell (`components/layout.tsx`) and which
 * render bare (spec §14): sign-in, Not invited, Privacy, Terms and the
 * onboarding — no top bar, no bottom nav, no drawer for someone who has not
 * signed in (or, for Privacy and Terms, may never sign in at all).
 *
 * Its own module, separate from `app.tsx`, so the split is unit-testable
 * without importing every route component and provider `app.tsx` pulls in.
 *
 * The intro (#207, "What is Bower") goes in `BARE_PATHS` too once its route
 * exists.
 */
const BARE_PATHS = new Set([
  '/login',
  '/not-invited',
  '/privacy',
  '/terms',
  '/onboarding',
]);

export function usesShell(path: string): boolean {
  return !BARE_PATHS.has(path);
}
