/**
 * Small typed wrapper around `localStorage` for preferences that live only
 * in this browser and are never sent to the Worker. A missing or unreadable
 * value falls back to its default; a blocked or full `localStorage` (private
 * browsing, storage quota) never throws.
 */

/** Light/dark, or follow the operating system (see `theme.ts`). */
export type ThemePref = 'system' | 'light' | 'dark';

/** The explorer tree's order (`navigation.ts#buildTree`). */
export type ExplorerSortPref = 'name' | 'modified';

export interface Prefs {
  /** Notify me when Bower finishes. Read by the push subscription added in #39. */
  notifyOnFinish: boolean;
  /** The push permission prompt (#39) has been shown once already. */
  pushPromptShown: boolean;
  /** Manual override of the light/dark theme; `'system'` follows the OS. */
  theme: ThemePref;
  /**
   * ISO time the health check screen was last opened; `''` before the
   * first time. Drives the "new report" badge (`health-report.ts`).
   */
  healthSeenAt: string;
  /**
   * ISO time Bower's suggestions (`Answers/Bower - Proposals.md`, #199)
   * were last shown in the Suggested group on the Bower tab (#346); `''`
   * before the first time.
   */
  proposalsSeenAt: string;
  /** The explorer tree's order: by name, or most recently modified first. */
  explorerSort: ExplorerSortPref;
  /**
   * Show Bower's own files (rulebook, catalogue, journal, instruction
   * notes, …) in the tree, Recent, search and the switcher, grouped
   * separately (spec §5.3). Off by default: users see only their notes.
   */
  showAppFiles: boolean;
}

const DEFAULTS: Prefs = {
  notifyOnFinish: false,
  pushPromptShown: false,
  theme: 'system',
  healthSeenAt: '',
  proposalsSeenAt: '',
  explorerSort: 'name',
  showAppFiles: false,
};

const STORAGE_PREFIX = 'bower:pref:';

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return DEFAULTS[key];
    return JSON.parse(raw) as Prefs[K];
  } catch {
    // Storage blocked or the value is corrupt: fall back to the default.
    return DEFAULTS[key];
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the preference just doesn't stick.
  }
}

/** Every preference except `theme`, which is a device setting, not a user one. */
const PER_USER_PREFS: ReadonlyArray<Exclude<keyof Prefs, 'theme'>> = [
  'notifyOnFinish',
  'pushPromptShown',
  'explorerSort',
  'showAppFiles',
];

/**
 * Drops every per-user preference so the next person on this device starts
 * from the defaults, keeping `theme` (the device's own display setting).
 * Called by `forget.ts` on sign-out and account deletion.
 */
export function resetPrefs(): void {
  for (const key of PER_USER_PREFS) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      // Storage blocked: nothing to remove.
    }
  }
}
