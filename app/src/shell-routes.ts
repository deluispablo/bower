import type { HelpScreen } from './help-rows.js';
import { isLearnPath } from './learn.js';

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
  '/recover',
]);

/**
 * In a demo build, sign-in's place is Run your own Bower (#366), drawn
 * inside the shell: the demo is always signed in as Alex, so the tabs are
 * the way back.
 */
const DEMO_SHELL_PATHS = new Set(['/login', '/not-invited']);

/** The Bower tab (#317), which replaced `/tell`. */
export const BOWER_PATH = '/bower';
/** The Bower tab opened on Activity (#345): Home's Last tidy-up card and
 * its "See what I did" link land on the last tidy-up's card. */
export const ACTIVITY_PATH = '/bower?show=activity';

/** The Ideas screen (#332): reached from the Bower tab's tip and every
 * help sheet's Ideas button; Back goes to the Bower tab. */
export const IDEAS_PATH = '/ideas';

/** The four tabs (#317); every other screen in the shell is an inner one. */
const TAB_PATHS = new Set(['/', '/notes', '/add', BOWER_PATH]);

/**
 * Whether `path` is an inner screen (#318): a note, a folder, Health,
 * Settings, Not found — anything in the shell that is not one of the four
 * tabs. Its top bar shows Back where a tab shows nothing.
 */
export function isInnerScreen(path: string, demo = false): boolean {
  return usesShell(path, demo) && !TAB_PATHS.has(path);
}

/**
 * Which help sheet the top bar's "?" opens on `path` (#330): the tab's own
 * sheet on a tab; the folder sheet on a folder; the Notes sheet on a note,
 * a file or a search, which are reached from Notes; Home's everywhere else.
 */
export function helpScreenFor(path: string): HelpScreen {
  if (
    path === '/notes' ||
    path === '/search' ||
    path === '/just-filed' ||
    path.startsWith('/note/') ||
    path.startsWith('/file/')
  ) {
    return 'notes';
  }
  if (path === '/folder' || path.startsWith('/folder/')) return 'folder';
  if (path === '/add') return 'add';
  if (path === BOWER_PATH) return 'bower';
  return 'home';
}

export function usesShell(
  path: string,
  demo = false,
  signedIn = true,
): boolean {
  // Learn Bower (R-LEARN-1) is public: inside the shell for someone signed
  // in, bare (ending in "Sign in with Google", not the tab bar) otherwise.
  if (isLearnPath(path)) return signedIn;
  if (demo && DEMO_SHELL_PATHS.has(path)) return true;
  return !BARE_PATHS.has(path);
}
