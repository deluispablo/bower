/**
 * Light/dark theme (#42). The app follows the system by default (see the
 * `prefers-color-scheme` block in `styles/tokens.css`); a manual override is
 * applied by setting `data-theme="light"` or `data-theme="dark"` on the root
 * element, which tokens.css already knows how to read. The choice is
 * remembered in prefs (`theme.ts`'s only state) so it survives a reload.
 */

import type { ThemePref } from './prefs.js';
import { getPref, setPref } from './prefs.js';

/** Sets (or clears, for `'system'`) `data-theme` on the root element. */
export function applyTheme(theme: ThemePref, root: HTMLElement): void {
  if (theme === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}

/** Applies the remembered theme to `document.documentElement`; call once on startup. */
export function initTheme(): void {
  applyTheme(getPref('theme'), document.documentElement);
}

/** Remembers `theme` and applies it right away. */
export function setTheme(theme: ThemePref): void {
  setPref('theme', theme);
  applyTheme(theme, document.documentElement);
}

/**
 * The theme actually shown right now: the remembered light/dark override,
 * or (for `'system'`) whatever `prefers-color-scheme` currently says. Used
 * by the header's theme toggle and the switcher's theme command, which both
 * need to show and flip the theme the user is looking at, not the raw
 * `'system' | 'light' | 'dark'` preference.
 */
export function effectiveTheme(): 'light' | 'dark' {
  const pref = getPref('theme');
  if (pref !== 'system') return pref;
  const dark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}
