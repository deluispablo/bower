/**
 * c12-wait-words: a run that left things for the next tidy-up says how many wait, in one sentence from `runDetail`.
 * Made-up words only.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { RunReport, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { TidySheet } from './TidySheet';
import { runDetail, runTitle } from './run-words';

const NOT_READY = 'Nothing in the inbox was ready yet, so it stays as it is.';
const IN_PLACE = 'Everything has its place.';
const NOTHING_CHANGED = "Bower didn't change anything this time.";
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const done = (report: RunReport, scope: RunState['scope'] = 'all'): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false, report });

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null }); });

describe('AC1 the sentence', () => {
  it('a held run says how many wait, under the plain count', () => {
    const run = done({ ...empty(), waiting: 3 });
    expect(runTitle(run)).toBe('Done. 0 things filed.');
    expect(runDetail(run)).toBe('3 things wait for the next tidy-up.');
  });

  it('a partial run says its parts, then the sentence', () => {
    const run = done({ ...empty(), setAside: [{ name: 'a.pdf', why: 'x' }], waiting: 2 });
    expect(runDetail(run)).toBe('1 thing set aside. 2 things wait for the next tidy-up.');
  });

  it('one thing waits', () => {
    expect(runDetail(done({ ...empty(), waiting: 1 }))).toBe('1 thing waits for the next tidy-up.');
  });
});

describe('AC2 no sentence that says nothing is waiting', () => {
  it.each([
    ['all', {}],
    ['all', { nothingReady: true }],
    ['instructions', {}],
  ] as const)('%s %j with waiting never says nothing-ready, in place or nothing changed', (scope, extra) => {
    const said = runDetail(done({ ...empty(), ...extra, waiting: 3 }, scope));
    expect(said).toBe('3 things wait for the next tidy-up.');
    for (const no of [NOT_READY, IN_PLACE, NOTHING_CHANGED]) expect(said).not.toContain(no);
  });

  it('controls without waiting are unchanged', () => {
    expect(runDetail(done(empty()))).toBe(IN_PLACE);
    expect(runDetail(done({ ...empty(), nothingReady: true }))).toBe(NOT_READY);
    expect(runDetail(done(empty(), 'instructions'))).toBe(NOTHING_CHANGED);
  });
});

describe('AC3 the run screen', () => {
  it('shows the sentence in its live status line', async () => {
    const run = done({ ...empty(), waiting: 3 });
    const base = loadingSources();
    const sources = { ...base, runs: { ...base.runs, current: async () => run } } as Sources;
    useUi.setState({ tidyOpen: true, tidyReportRunId: run.id, replayRunId: null });
    await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><TidySheet /></DataProvider></MemoryRouter>); });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('status')).toHaveTextContent('3 things wait for the next tidy-up.');
  });
});
