import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { RunReport, RunState } from '@/data/types';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';
import { StatusBar } from './StatusBar';
import { TidySheet } from './TidySheet';
import { runDetail, runTitle } from './run-words';

const PATH = 'Areas/Home/Allotment diary.md';
const WHY = "Bower didn't add the line: it found nothing about this note in what you added.";
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const left = (): RunReport => ({ ...empty(), leftAsWritten: [{ name: PATH, fileId: 'allotment-note', why: WHY }] });

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

async function open(scope: RunState['scope'], report: RunReport) {
  const base = loadingSources();
  let run: RunState = { id: 'request-run', scope, phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  const initial = run;
  const listeners = new Set<() => void>();
  const markSeen = vi.fn(async () => { run = { ...run, seen: true }; listeners.forEach((cb) => cb()); });
  const doors: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => [],
      changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault,
    runs: { ...base.runs, current: async () => run, markSeen,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } },
  };
  useUi.setState({ tidyOpen: false, replayRunId: null });
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main><StatusBar /><TidySheet /></DataProvider></MemoryRouter>); });
  return { run: initial, markSeen };
}

function assertLeft(scope: HTMLElement) {
  const list = within(scope).getByRole('list', { name: 'Left as you wrote them' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText(WHY, { exact: true })).toBeVisible();
  expect(within(list).getByRole('link', { name: 'Allotment diary' })).toHaveAttribute('href', '/note/Areas/Home/Allotment%20diary.md');
}

it('request report: Home shows instructions leftAsWritten with today’s words and Got it alone', async () => {
  const { run, markSeen } = await open('instructions', left());
  const heading = screen.getByRole('heading', { name: runTitle(run), level: 2 });
  const card = heading.closest('section');
  expect(card).not.toBeNull();
  if (!card) throw new Error('Missing report card');
  expect(within(card).getByText(runDetail(run), { exact: true })).toBeVisible();
  assertLeft(card);
  expect(within(card).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
  expect(within(card).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(within(card).getByRole('button', { name: 'Got it' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: runTitle(run) })).toBeNull());
  expect(markSeen).toHaveBeenCalledWith(run.id);
});

it('request report: status bar reopens unseen instructions leftAsWritten instead of Nothing to tidy', async () => {
  const { run, markSeen } = await open('instructions', left());
  fireEvent.click(screen.getByRole('button', { name: /^Last tidy-up/ }));
  const sheet = screen.getByRole('dialog', { name: runTitle(run) });
  assertLeft(sheet);
  expect(within(sheet).getByText(runDetail(run), { exact: true })).toBeVisible();
  expect(within(sheet).queryByText('Nothing to tidy')).toBeNull();
  expect(within(sheet).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(markSeen).toHaveBeenCalledWith(run.id));
  fireEvent.click(screen.getByRole('button', { name: /^Last tidy-up/ }));
  expect(screen.getByRole('dialog', { name: 'Nothing to tidy' })).toBeVisible();
});

it('request report: all with filings retains Home replay and status bar replay', async () => {
  const { run } = await open('all', { ...left(), filed: [{ name: 'Garden update.txt', title: 'Garden update', kind: 'other', to: 'Areas/Home' }] });
  const heading = screen.getByRole('heading', { name: runTitle(run), level: 2 });
  const card = heading.closest('section');
  if (!card) throw new Error('Missing report card');
  assertLeft(card);
  expect(within(card).getByText(runDetail(run), { exact: true })).toBeVisible();
  expect(within(card).getByRole('button', { name: 'Watch what Bower did' })).toBeVisible();
  expect(within(card).getByRole('button', { name: 'Got it' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /1 thing filed\. Watch what Bower did/ }));
  expect(useUi.getState().replayRunId).toBe(run.id);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: %s with no rows has no Home card and opens Nothing to tidy', async (scope) => {
  const { run } = await open(scope, empty());
  const button = screen.getByRole('button', { name: /^Last tidy-up/ });
  expect(screen.queryByRole('heading', { name: runTitle(run) })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  fireEvent.click(button);
  expect(screen.getByRole('dialog', { name: 'Nothing to tidy' })).toBeVisible();
});

it.each([
  { created: [{ path: PATH, what: 'Made from 1 thing' }] },
  { updated: [{ path: PATH, what: 'One line added to its Timeline, as you asked.' }] },
  { setAside: [{ name: 'Garden update', why: 'Keep it for later.' }] },
  { questions: [{ id: 'question', text: 'Write it?', yes: 'Write it', no: 'Keep mine', askedAt: 0 }] },
])('request report: instructions report stays reachable for row %j', async (rows) => {
  const { run } = await open('instructions', { ...empty(), ...rows });
  expect(screen.getByRole('heading', { name: runTitle(run), level: 2 })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^Last tidy-up/ }));
  expect(screen.getByRole('dialog', { name: runTitle(run) })).toBeVisible();
});
