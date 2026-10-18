import { create } from 'zustand';

/** Per-device preferences. Kept in localStorage; never sent anywhere. */
export type Theme = 'system' | 'dark' | 'light';

interface Prefs {
  theme: Theme;
  /** "Bower moves": off holds Bower still everywhere. */
  birdMoves: boolean;
  /** "Look things up on the web" (phase 2: an account setting kept by the Worker). */
  lookUpWeb: boolean;
  /** "Tell me when a tidy-up ends": a notification when the app is in the background. */
  notifyRuns: boolean;
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  /** The right panel follows rightOpen: the person chose it, or the first tidy-up was done. */
  rightSettled: boolean;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

const KEY = 'bower:prefs';

function load(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Anything but a plain object (null, a number, an array) holds no prefs.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Prefs>) : {};
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return {};
  }
}

const stored = load();

export const usePrefs = create<Prefs>((set, get) => ({
  theme: 'system',
  birdMoves: true,
  lookUpWeb: false,
  notifyRuns: false,
  leftWidth: 300,
  rightWidth: 320,
  leftOpen: true,
  rightOpen: true,
  // Prefs stored before rightSettled existed always hold rightOpen: stored panel prefs win.
  rightSettled: 'rightOpen' in stored,
  ...stored,
  set: (patch) => {
    // Every deliberate open or close is a stored choice.
    if ('rightOpen' in patch) patch = { ...patch, rightSettled: true };
    set(patch);
    const { set: _omit, ...rest } = { ...get(), ...patch };
    void _omit;
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      // expected: Private windows may refuse storage; the preference holds for this visit.
    }
  },
}));

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
