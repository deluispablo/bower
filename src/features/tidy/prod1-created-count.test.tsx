import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { RunReport, RunState } from '@/data/types';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';

const P = 'Areas/Home/Chores checklist.md';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

it('Home replay heading never says 0 notes brought up to date when the only update is a new note', async () => {
  const base = loadingSources();
  const report: RunReport = { filed: [{ name: 'scan.pdf', title: 'Scan', kind: 'pdf', to: 'Areas/Home' }],
    created: [{ path: P, what: 'checklist' }], updated: [{ path: P, what: 'checklist' }], setAside: [], questions: [] };
  const run: RunState = { id: 'r', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  const doors: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => [],
    changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (t, k) => typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => run, subscribe: () => () => undefined } };
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><Home /></DataProvider></MemoryRouter>); });
  const heading = await screen.findByRole('heading', { level: 2, name: /filed/ });
  expect(heading.textContent).toBe('1 thing filed.');
});
