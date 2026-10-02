/**
 * Document titles (#899, WCAG 2.4.2): every route names its page in the tab
 * and the history, "<Screen> · Bower". Static screens are named here from the
 * path; routes that show something by name (a note, a folder, a file, a Learn
 * example) call `useTitle` themselves with that name.
 */

import { useEffect } from 'preact/hooks';

import { JUST_FILED_PATH } from './just-filed.js';
import { FOLDERS_PATH, FOLDERS_TAB_LABEL } from './shell-routes.js';

const SUFFIX = ' · Bower';

const SCREEN_TITLES: Readonly<Record<string, string>> = {
  '/': 'Home',
  '/login': 'Sign in',
  '/not-invited': 'Not invited',
  '/privacy': 'Privacy',
  '/terms': 'Terms',
  // The tab's label, not its route (#998): the tab reads Folders.
  [FOLDERS_PATH]: FOLDERS_TAB_LABEL,
  '/add': 'Add',
  '/bower': 'Bower',
  '/ideas': 'Ideas',
  [JUST_FILED_PATH]: 'Just filed',
  '/settings': 'Settings',
  '/health': 'Health',
  '/onboarding': 'Welcome',
  '/welcome': 'Welcome',
  '/recover': 'Recover your folder',
};

/** Paths that only redirect, or whose route names the page itself. */
const OWN_TITLE = /^\/(note|file|folder|learn|tell|search|lint)(\/|$)/;

/** "<name> · Bower"; "Bower" alone when it is the app's own name. */
export function documentTitle(name: string): string {
  const trimmed = name.trim();
  return trimmed === '' || trimmed === 'Bower' ? 'Bower' : trimmed + SUFFIX;
}

/** The title for a static screen, or `null` when the route sets its own. */
export function titleForPath(path: string, demoLogin = false): string | null {
  const clean = path.split(/[?#]/)[0] ?? path;
  const bare = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
  if (demoLogin && bare === '/login') return documentTitle('Run your own');
  const known = SCREEN_TITLES[bare];
  if (known !== undefined) return documentTitle(known);
  if (OWN_TITLE.test(bare)) return null;
  return documentTitle('Page not found');
}

/** Sets the tab title to "<name> · Bower"; `null` leaves it alone. */
export function useTitle(name: string | null): void {
  useEffect(() => {
    if (name === null) return;
    document.title = documentTitle(name);
  }, [name]);
}
