import type { HelpScreen } from './help-rows.js';

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

/** The four tabs (#317); every other screen in the shell is an inner one. */
const TAB_PATHS = new Set(['/', '/notes', '/add', BOWER_PATH]);

/**
 * Whether `path` is an inner screen (#318): a note, a folder, Health,
 * Settings, Not found — anything in the shell that is not one of the four
 * tabs. Its top bar shows Back where a tab shows the folder menu button.
 */
export function isInnerScreen(path: string): boolean {
  return usesShell(path) && !TAB_PATHS.has(path);
}

/**
 * Which help sheet the top bar's "?" opens on `path` (#330): the tab's own
 * sheet on a tab; the folder sheet on a folder; the Notes sheet on a note
 * or a search, which are reached from Notes; Home's everywhere else.
 */
export function helpScreenFor(path: string): HelpScreen {
  if (path === '/notes' || path === '/search' || path.startsWith('/note/')) {
    return 'notes';
  }
  if (path === '/folder' || path.startsWith('/folder/')) return 'folder';
  if (path === '/add') return 'add';
  if (path === BOWER_PATH) return 'bower';
  return 'home';
}

export function usesShell(path: string): boolean {
  return !BARE_PATHS.has(path);
}
