/**
 * prod1-active-copy: after a reload during a tidy-up, waiting changes and requests are not all put off to "the next
 * tidy-up", and a request added after the run started is described the same as one before it (no membership guess).
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { ChangeEntry, Request, RunPhase, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { BowerScreen } from '@/features/bower/BowerScreen';
import { Home } from './Home';

afterEach(cleanup);

const SENTENCE = 'A tidy-up is running. What it does not finish stays here.';
const REQUESTS: Request[] = [
  { id: 'R_OLD', text: 'Put the lease papers together', at: 500 },
  { id: 'R_NEW', text: 'Find the dentist letter', at: 2_000 },
];
const CHANGES: ChangeEntry[] = [
  { id: 'C_OLD', at: 500, kind: 'move', what: 'Moved Lease draft.pdf to Areas / Home' },
  { id: 'C_NEW', at: 2_000, kind: 'rename', what: 'Renamed Budget to Money plan' },
];

async function show(ui: ReactElement, run: RunState | null, changes: ChangeEntry[] = CHANGES) {
  const base = loadingSources();
  const doors: Record<string, unknown> = {
    driveLinks: false,
    subscribe: () => () => undefined,
    changes: async () => changes,
    requests: async () => REQUESTS,
    rules: async () => [],
    rulesProse: async () => '',
    questions: async () => [],
    failedChanges: async () => [],
    piles: async () => [],
    pilesListed: async () => [],
    suggestions: async () => [],
    uploadNotice: async () => null,
    orphanSummary: async () => ({ count: 0, complete: true }),
  };
  const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => run, subscribe: () => () => undefined } };
  render(<MemoryRouter><DataProvider sources={sources}>{ui}</DataProvider></MemoryRouter>);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const active = (phase: RunPhase): RunState => ({ id: 'ACTIVE_RUN', scope: 'all', phase, requestedAt: 1_000, phaseAt: 1_000, seen: false });
const panelSection = (): HTMLElement => {
  const section = screen.getByRole('heading', { name: 'You asked' }).closest('section');
  if (!section) throw new Error('no You asked section');
  return section;
};

describe.each(['queued', 'writing'] as const)('a reload during a tidy-up (%s)', (phase) => {
  it(`active_run_does_not_label_all_pending_work_next_run: Home journal (${phase})`, async () => {
    await show(<Home />, active(phase));
    await screen.findByText(SENTENCE, { exact: true });
    const region = screen.getByRole('region', { name: 'Since the last tidy-up' });
    expect(within(region).getByText(SENTENCE, { exact: true })).toBeVisible();
    expect(region.textContent).not.toMatch(/next tidy-up/);
  });

  it(`active_run_does_not_label_all_pending_work_next_run: request rows (${phase})`, async () => {
    await show(<BowerScreen />, active(phase));
    const region = await screen.findByRole('region', { name: 'What you asked' });
    expect(await within(region).findAllByText(SENTENCE, { exact: true })).toHaveLength(2);
    expect(within(region).queryByText('Waiting for the next tidy-up.')).toBeNull();
  });

  it(`active_run_does_not_label_all_pending_work_next_run: panel rows (${phase})`, async () => {
    await show(<BowerPanel />, active(phase));
    await screen.findByRole('heading', { name: 'You asked' });
    expect(within(panelSection()).getAllByText(SENTENCE, { exact: true })).toHaveLength(2);
    expect(within(panelSection()).queryByText('Waits for the next tidy-up')).toBeNull();
  });

  it(`late_arrival_is_not_claimed_as_admitted (${phase})`, async () => {
    await show(<BowerScreen />, active(phase));
    const sub = (text: string): string => (screen.getByText(text).closest('div')?.textContent ?? '').replace(text, '');
    const [old, late] = ['Put the lease papers together', 'Find the dentist letter'];
    await screen.findByText(late);
    expect(sub(old)).toBe(sub(late));
    expect(sub(late)).toBe(SENTENCE);
  });
});

describe('idle wording unchanged', () => {
  it('Home journal, one and two changes', async () => {
    await show(<Home />, null, CHANGES.slice(0, 1));
    expect(await screen.findByText('Bower reads this change in the next tidy-up, so it knows what you changed and where to look.', { exact: true })).toBeVisible();
    cleanup();
    await show(<Home />, null);
    expect(await screen.findByText('Bower reads these 2 changes in the next tidy-up, so it knows what you changed and where to look.', { exact: true })).toBeVisible();
  });

  it('BowerScreen request rows', async () => {
    await show(<BowerScreen />, null);
    const region = await screen.findByRole('region', { name: 'What you asked' });
    expect(await within(region).findAllByText('Waiting for the next tidy-up.', { exact: true })).toHaveLength(2);
  });

  it('BowerPanel request rows', async () => {
    await show(<BowerPanel />, null);
    await screen.findByRole('heading', { name: 'You asked' });
    expect(within(panelSection()).getAllByText('Waits for the next tidy-up', { exact: true })).toHaveLength(2);
  });
});
