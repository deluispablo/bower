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

/** The second tab's label (owner review O-R5): "Folders" everywhere the
 * tab is named. A label only: the route stays `/notes` and the kind
 * "Notes" (Search groups, Filter chips) is not renamed. */
export const FOLDERS_TAB_LABEL = 'Folders';

/** The desktop sidebar's landmark and the drawer's title (O-R5). */
export const FOLDERS_LANDMARK = 'Your folders';

/** The Folders tab's route (unchanged by the rename). */
export const FOLDERS_PATH = '/notes';

/** Just filed (#345): a child of Home (K-5). */
export const JUST_FILED_PATH = '/just-filed';

/** Settings: reached from the avatar (phone) or the sidebar (desktop). */
export const SETTINGS_PATH = '/settings';

export type TabId = 'home' | 'folders' | 'add' | 'bower';

/**
 * The phone tab lit on `path` (spec §3.2, R-TABBAR-2): Home on Home and
 * Just filed; Folders on the Folders tab, every folder, note and file, and
 * Health (reached from the Folders tab); Add and Bower on their own tab.
 * Settings and every other screen light none.
 */
export function activeTab(path: string): TabId | null {
  if (path === '/' || path === JUST_FILED_PATH) return 'home';
  if (
    path === FOLDERS_PATH ||
    path === '/health' ||
    path === '/folder' ||
    path.startsWith('/folder/') ||
    path.startsWith('/note/') ||
    path.startsWith('/file/')
  ) {
    return 'folders';
  }
  if (path === '/add') return 'add';
  if (path === BOWER_PATH) return 'bower';
  return null;
}

/**
 * The phone top bar's variant (spec §3.1, R-TOPBAR-1): `explorer` on the
 * Folders tab (title, ⋯, avatar; no files button), `tab` on Home, Add and
 * Bower (files, title, ⋯, avatar), `inner` everywhere else (files, back,
 * avatar).
 */
export type TopBarVariant = 'tab' | 'inner' | 'explorer';

export function topBarVariant(path: string): TopBarVariant {
  if (path === FOLDERS_PATH) return 'explorer';
  if (path === '/' || path === '/add' || path === BOWER_PATH) return 'tab';
  return 'inner';
}

/** Whether the phone bar shows the avatar: everywhere but Settings (ST-1). */
export function barHasAvatar(path: string): boolean {
  return path !== SETTINGS_PATH;
}

/** The four tabs (#317); every other screen in the shell is an inner one. */
const TAB_PATHS = new Set(['/', FOLDERS_PATH, '/add', BOWER_PATH]);

/**
 * Whether `path` is an inner screen (#318): a note, a folder, Health,
 * Settings, Not found — anything in the shell that is not one of the four
 * tabs. Its top bar shows Back where a tab shows nothing.
 */
export function isInnerScreen(path: string, demo = false): boolean {
  return usesShell(path, demo) && !TAB_PATHS.has(path);
}

/**
 * Which Help "Help and about this" opens on `path` (#330, #919, R-HELP-2):
 * the tab's own on a tab; Just filed's and Settings' own; a folder's, a
 * note's or a file's own (the screen refines it with `useHelpTopic`); the
 * Folders Help on Search, which is reached from Folders; Home's elsewhere.
 */
export function helpScreenFor(path: string): HelpScreen {
  if (path === FOLDERS_PATH || path === '/search') return 'notes';
  if (path === JUST_FILED_PATH) return 'justFiled';
  if (path === SETTINGS_PATH) return 'settings';
  if (path.startsWith('/note/')) return 'note';
  if (path.startsWith('/file/')) return 'file';
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
