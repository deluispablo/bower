/**
 * phone-stopped-launch: on the phone, a stop not seen yet keeps its card's Try again as the one control, as on the
 * desktop (qa-prod-10-F2 AC2); the tidy-up sheet shows that stop until it is seen (TidySheet showRun), so an Inbox Tidy up
 * would not open Confirm. With no unseen stop the phone Inbox still launches. Prior art: NN/g consistency and standards
 * (the same state offers the same action on both layouts). Helpers copied from qa-prod-10-F2.test.tsx. Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, RunReport, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { DESKTOP } from '@/ui/media';
import { TidySheet } from '@/features/tidy/TidySheet';
import { Home } from './Home';

let desktop = false;
beforeEach(() => {
  desktop = false;
  const real = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: desktop && q === DESKTOP }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

const thing = (id: string): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer' });
const piles = (n: number): Pile[] => Array.from({ length: n }, (_, i) => ({
  id: `p${n - i}`, path: `Inbox/Pile ${n - i}`, text: `Pile ${n - i}`, createdAt: 10_000 - i * 100, items: [thing(`t${n - i}`)],
}));
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const run = (extra: Partial<RunState>): RunState => ({ id: 'r1', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 2000, seen: false, ...extra });
const filed = (extra: Partial<RunState> = {}): RunState =>
  run({ finishedAt: 2000, report: { ...empty(), filed: [{ name: 'Policy.pdf', title: 'Policy', kind: 'pdf', to: 'Areas/Car' }] }, ...extra });

async function mount(current: RunState) {
  const base = loadingSources();
  const doors: Record<string, unknown> = {
    piles: async () => piles(1), pilesListed: async () => null, tree: async () => [], changes: async () => [],
    questions: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    firstTidy: async () => ({ added: true, started: true, reviewed: true }),
    subscribe: () => () => undefined,
  };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => current } };
  render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main><TidySheet /></DataProvider></MemoryRouter>);
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
  await screen.findByText(/^1 thing waiting/);
}
const inboxTidy = () => within(screen.getByRole('region', { name: 'Inbox' })).queryAllByRole('button', { name: /^Tidy up/ });

describe('phone-stopped-launch: the phone Inbox offers no Tidy up beside an unseen stop', () => {
  it('AC1 phone-stopped-keeps-try-again: a stop not seen yet adds no Inbox launch; its card\'s Try again is the one control', async () => {
    await mount(run({ phase: 'failed', failure: 'Drive did not answer.' }));
    expect(inboxTidy(), 'AC1: no Tidy up in the Inbox').toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^(Tidy up|Try again)/ }).map((b) => b.textContent), 'AC1: Try again is the one control').toEqual(['Try again']);
  });

  it('AC2 guards: with no unseen stop the phone Inbox launches into Confirm; the desktop is unchanged', async () => {
    await mount(run({ phase: 'failed', failure: 'Drive did not answer.', seen: true }));
    expect(inboxTidy().map((b) => b.textContent), 'AC2: seen stop, one Tidy up in the Inbox').toEqual(['Tidy up 1 thing']);
    await act(async () => { fireEvent.click(inboxTidy()[0] as HTMLElement); });
    expect(screen.getByRole('dialog', { name: 'Tidy up 1 thing?' }), 'AC2: it opens the Confirm step').toBeTruthy();
    cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null });
    await mount(filed());
    expect(inboxTidy().map((b) => b.textContent), 'AC2: unseen report, the phone Inbox launches').toEqual(['Tidy up 1 thing']);
    cleanup();
    desktop = true;
    await mount(filed());
    expect(inboxTidy().map((b) => b.textContent), 'AC2: desktop, unseen report keeps the Inbox launch').toEqual(['Tidy up 1 thing']);
    cleanup();
    await mount(run({ phase: 'failed', failure: 'Drive did not answer.' }));
    expect(inboxTidy(), 'AC2: desktop, unseen stop has no Inbox launch').toHaveLength(0);
  });
});
