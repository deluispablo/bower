/**
 * Small typed wrapper around `localStorage` for preferences that live only
 * in this browser and are never sent to the Worker. A missing or unreadable
 * value falls back to its default; a blocked or full `localStorage` (private
 * browsing, storage quota) never throws.
 */

export interface Prefs {
  /** Notify me when Bower finishes. Read by the push subscription added in #39. */
  notifyOnFinish: boolean;
  /** Process automatically after adding. Read by #35. */
  autoProcessOnAdd: boolean;
  /** The push permission prompt (#39) has been shown once already. */
  pushPromptShown: boolean;
}

const DEFAULTS: Prefs = {
  notifyOnFinish: false,
  autoProcessOnAdd: true,
  pushPromptShown: false,
};

const STORAGE_PREFIX = 'bower:pref:';

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return DEFAULTS[key];
    return JSON.parse(raw) as Prefs[K];
  } catch {
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
