/**
 * ux-home-priorities-run-bar: an admitted run counts as step 2, since Drive keeps a run's record only once it reports
 * (rulings Cause 1). Made-up words only.
 */
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { offersTidy } from '@/data/contracts/first-tidy';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';
import { useFirstTidy } from './useFirstTidy';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

const thing = (id: string): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer' });
const piles = (n: number): Pile[] => Array.from({ length: n }, (_, i) => ({
  id: `p${n - i}`, path: `Inbox/Pile ${n - i}`, text: `Pile ${n - i}`, createdAt: 10_000 - i * 100, items: [thing(`t${n - i}`)],
}));
const run = (extra: Partial<RunState>): RunState => ({ id: 'r1', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 2000, seen: false, ...extra });
const notStarted = async () => ({ added: true, started: false, reviewed: false });

function sourcesFor(opts: { piles?: Pile[]; run?: RunState | null; doors?: Record<string, unknown> }): Sources {
  const base = loadingSources();
  const current = opts.piles ?? [];
  const listeners = new Set<() => void>();
  const doors: Record<string, unknown> = {
    piles: async () => current, pilesListed: async () => null, tree: async () => [], changes: async () => [],
    questions: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    ...opts.doors,
  };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  return { ...base, vault, runs: { ...base.runs, current: async () => opts.run ?? null } };
}
function mount(opts: { piles?: Pile[]; run?: RunState | null; doors?: Record<string, unknown> }) {
  return render(<MemoryRouter><DataProvider sources={sourcesFor(opts)}>
    <main id="main" tabIndex={-1}><Home /></main>
  </DataProvider></MemoryRouter>);
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const checklist = () => screen.getByRole('region', { name: 'Your first tidy-up' });
function expectStepThree() {
  expect(within(checklist()).queryByRole('button', { name: 'Tidy up' })).toBeNull();
  expect(checklist().querySelector('[aria-current="step"]')?.textContent).toContain('See where it went');
}
function hook(r: RunState | null) {
  const sources = sourcesFor({ piles: piles(1), run: r, doors: { firstTidy: notStarted } });
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter><DataProvider sources={sources}>{children}</DataProvider></MemoryRouter>;
  return renderHook(() => useFirstTidy(), { wrapper });
}

describe('ux-home-priorities-run-bar AC1: an admitted run is step 2', () => {
  it('AC1 running_run_is_step_two: a reading run moves the checklist to step 3, no Tidy up', async () => {
    mount({ piles: piles(1), run: run({ phase: 'reading' }), doors: { firstTidy: notStarted } });
    await settle();
    expectStepThree();
  });

  it('AC1 stopped_run_is_step_two: a failed run moves the checklist to step 3, no Tidy up', async () => {
    mount({ piles: piles(1), run: run({ phase: 'failed', seen: false, failure: 'Drive did not answer.' }), doors: { firstTidy: notStarted } });
    await settle();
    expectStepThree();
  });

  it('AC1 hook_folds_the_run: useFirstTidy reads step 2 done while a run goes', async () => {
    const { result } = hook(run({ phase: 'reading' }));
    await settle();
    expect(result.current.data).toEqual({ added: true, started: true, reviewed: false });
    expect(offersTidy(result.current.data)).toBe(false);
  });

  it('AC1 no_run_unchanged (guard): with no run the progress is the folder\'s', async () => {
    const { result } = hook(null);
    await settle();
    expect(result.current.data).toEqual({ added: true, started: false, reviewed: false });
    expect(offersTidy(result.current.data)).toBe(true);
  });
});
