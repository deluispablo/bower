/**
 * qa6-panel-done (designer qa-6 P1): the desktop right panel's card for a finished tidy-up the person has not seen
 * opens that run's report in the tidy-up sheet, as the status bar does, never "Nothing in the inbox".
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { RunReport, RunState } from '@/data/types';
import { TidySheet } from '@/features/tidy/TidySheet';
import { runTitle } from '@/features/tidy/run-words';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null }); });

const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const filed = (): RunReport => ({ ...empty(), filed: [{ name: 'scan.pdf', title: 'Council tax bill', kind: 'pdf', to: 'Areas/Money' }], updated: [{ path: 'Areas/Money/Money.md', what: 'One line added.' }] });

async function panel(report: RunReport, scope: RunState['scope'] = 'all') {
  const base = loadingSources();
  const run: RunState = { id: 'done-run', scope, phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  const doors: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => [], questions: async () => [],
    requests: async () => [], rules: async () => [], changes: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k)) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => run, markSeen: vi.fn(async () => {}), subscribe: () => () => {} } };
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><BowerPanel /><TidySheet /></DataProvider></MemoryRouter>); });
  return run;
}

it('AC1 qa6-panel-done-report: the Done card of an unseen tidy-up that filed things opens its report', async () => {
  const run = await panel(filed());
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${runTitle(run)}`) }));
  expect(screen.getByRole('dialog', { name: runTitle(run) })).toBeVisible();
  expect(screen.queryByText('Nothing in the inbox')).toBeNull();
});

it('AC2 qa6-panel-done-no-rows: the Done card of an unseen run with nothing to list opens that run, not "Nothing in the inbox"', async () => {
  const run = await panel({ ...empty(), yourChanges: 1 }, 'instructions');
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${runTitle(run)}`) }));
  expect(screen.getByRole('dialog', { name: runTitle(run) })).toBeVisible();
  expect(screen.queryByText('Nothing in the inbox')).toBeNull();
});
