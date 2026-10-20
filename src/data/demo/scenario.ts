/**
 * Demo situations, so every screen of the design can be reached without
 * touching code: `?scenario=back`, or the debug panel (⌘⇧D). The choice is
 * kept for the tab (sessionStorage) so it survives navigation and reloads.
 */
export const SCENARIOS = {
  default: 'Alex, with piles waiting',
  'signed-out': 'Signed out',
  first: 'First sign-in: no Bower folder yet',
  back: 'Back after a tidy-up that ended while away',
  running: 'A tidy-up is running',
  empty: 'Nothing waiting in the inbox',
  'fail-run': 'The next tidy-up fails (trying again works)',
  'start-fails': 'The next tidy-up cannot start (trying again works)',
  slow: 'Everything answers slowly',
  'slow-report': 'The last tidy-up and the questions answer slowly',
  'inbox-read-fails': 'The full read of the inbox fails after the listing (heals when the page says so)',
  'inbox-held': 'The inbox answers only when the page says so',
  'journal-refused': 'Notes of your changes wait, then Drive refuses them when the page says so',
  'withdraw-unreached': 'When the page says so, notes of changes and pile things find no network, nor do checks of them; or Drive finds none at all',
  'gone-answers': 'Answers wait whose notes or things went to the Bin since (pretend Drive)',
  'write-it': 'Two Current states changed by hand, with an update to write in each (pretend Drive)',
  offline: 'Offline',
} as const;
export type Scenario = keyof typeof SCENARIOS;

export type TimeScale = 'demo' | 'real' | 'instant';

const KEY = 'bower:demo:scenario';
const SCALE_KEY = 'bower:demo:scale';

function isScenario(v: string | null): v is Scenario {
  return !!v && v in SCENARIOS;
}

export function readScenario(): Scenario {
  try {
    const q = new URLSearchParams(location.search).get('scenario');
    if (isScenario(q)) {
      // An address opened with a situation starts it afresh; a reload or Back keeps what happened since.
      const how = (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
      if (how === 'navigate' && sessionStorage.getItem(KEY) !== null) sessionStorage.removeItem('bower:demo:signed-in');
      sessionStorage.setItem(KEY, q);
      return q;
    }
    const s = sessionStorage.getItem(KEY);
    return isScenario(s) ? s : 'default';
  } catch {
    // expected: storage may be blocked (a private window); the default holds.
    return 'default';
  }
}

export function readTimeScale(): TimeScale {
  try {
    const q = new URLSearchParams(location.search).get('time') ?? sessionStorage.getItem(SCALE_KEY);
    if (q === 'real' || q === 'instant' || q === 'demo') {
      sessionStorage.setItem(SCALE_KEY, q);
      return q;
    }
  } catch {
    // expected: Storage may be blocked; the default holds.
  }
  return 'demo';
}

export function chooseScenario(s: Scenario, scale?: TimeScale): void {
  try {
    sessionStorage.setItem(KEY, s);
    // A new situation starts as it says: signed in or not.
    sessionStorage.removeItem(SIGNED_KEY);
    // Folders open in one situation are not open in the next, nor its tabs.
    localStorage.removeItem('bower:open');
    sessionStorage.removeItem('bower:tabs');
    if (scale) sessionStorage.setItem(SCALE_KEY, scale);
  } catch {
    // expected: Without storage the URL carries it.
  }
  const url = new URL(location.href);
  url.searchParams.set('scenario', s);
  if (scale) url.searchParams.set('time', scale);
  location.assign(url.pathname === '/sign-in' || url.pathname === '/welcome' ? `/?${url.searchParams}` : url.toString());
}

/** How long each phase of a simulated run lasts, in ms. */
export const PHASE_MS: Record<TimeScale, Record<'queued' | 'reading' | 'writing' | 'saving', number>> = {
  demo: { queued: 3000, reading: 5000, writing: 9000, saving: 5000 },
  real: { queued: 40_000, reading: 60_000, writing: 150_000, saving: 50_000 },
  instant: { queued: 0, reading: 0, writing: 0, saving: 0 },
};

const SIGNED_KEY = 'bower:demo:signed-in';

/** Whether the person signed in or out in this tab, over the situation's start (null: as the situation says). */
export function keptSignedIn(): boolean | null {
  try {
    const v = sessionStorage.getItem(SIGNED_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    // expected: no storage; the situation decides.
    return null;
  }
}

export function keepSignedIn(on: boolean): void {
  try {
    sessionStorage.setItem(SIGNED_KEY, on ? '1' : '0');
  } catch (e) {
    console.error(e);
  }
}

/**
 * Before anything reads the device's storage: an address opened with another
 * situation than the one this tab had starts it clean, as choosing it in the
 * panel does (signed in or not, no tabs, folders closed).
 */
export function startCleanIfNewSituation(): void {
  try {
    const q = new URLSearchParams(location.search).get('scenario');
    const how = (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
    const before = sessionStorage.getItem(KEY);
    if (!isScenario(q) || how !== 'navigate' || before === null || before === q) return;
    for (const k of [SIGNED_KEY, 'bower:tabs']) sessionStorage.removeItem(k);
    localStorage.removeItem('bower:open');
  } catch {
    // expected: storage may be blocked (a private window); nothing was kept.
  }
}
