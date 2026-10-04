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
  'fail-run': 'The next tidy-up fails',
  slow: 'Everything answers slowly',
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
      sessionStorage.setItem(KEY, q);
      return q;
    }
    const s = sessionStorage.getItem(KEY);
    return isScenario(s) ? s : 'default';
  } catch {
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
    // Storage may be blocked; the default holds.
  }
  return 'demo';
}

export function chooseScenario(s: Scenario, scale?: TimeScale): void {
  try {
    sessionStorage.setItem(KEY, s);
    if (scale) sessionStorage.setItem(SCALE_KEY, scale);
  } catch {
    // Without storage the URL carries it.
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
