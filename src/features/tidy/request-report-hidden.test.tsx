import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, RunReport, RunState } from '@/data/types';
import { Home } from '@/features/home/Home';
import { RightPanel } from '@/features/note/RightPanel';
import { loadingSources } from '@/testing/loading-sources';
import { StatusBar } from './StatusBar';
import { TidySheet } from './TidySheet';
import { runDetail, runTitle } from './run-words';

const PATH = 'Areas/Home/Allotment diary.md';
const WHY = "Bower didn't add the line: it found nothing about this note in what you added.";
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const left = (): RunReport => ({ ...empty(), leftAsWritten: [{ name: PATH, fileId: 'allotment-note', why: WHY }] });

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

async function open(scope: RunState['scope'], report: RunReport, piles: Pile[] = [], rightPanel = false) {
  const base = loadingSources();
  let run: RunState = { id: 'request-run', scope, phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  const initial = run;
  const listeners = new Set<() => void>();
  const markSeen = vi.fn(async () => { run = { ...run, seen: true }; listeners.forEach((cb) => cb()); });
  const doors: Record<string, unknown> = { piles: async () => piles, pilesListed: async () => null, tree: async () => [],
      changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault,
    runs: { ...base.runs, current: async () => run, markSeen,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } },
  };
  useUi.setState({ tidyOpen: false, replayRunId: null });
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main><StatusBar /><TidySheet />{rightPanel && <RightPanel />}</DataProvider></MemoryRouter>); });
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
  expect(within(card).queryByText('Everything has its place.', { exact: true })).toBeNull();
  assertLeft(card);
  expect(within(card).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
  expect(within(card).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(within(card).getByRole('button', { name: 'Got it' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: runTitle(run) })).toBeNull());
  expect(markSeen).toHaveBeenCalledWith(run.id);
});

it('request report: status bar reopens unseen instructions leftAsWritten instead of Nothing in the inbox', async () => {
  const { run, markSeen } = await open('instructions', { ...left(), yourChanges: 1 });
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  const sheet = screen.getByRole('dialog', { name: runTitle(run) });
  assertLeft(sheet);
  expect(within(sheet).getByText(runDetail(run), { exact: true })).toBeVisible();
  expect(within(sheet).queryByText('Nothing in the inbox')).toBeNull();
  expect(within(sheet).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(markSeen).toHaveBeenCalledWith(run.id));
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  expect(screen.getByRole('dialog', { name: 'Nothing in the inbox' })).toBeVisible();
});

it.each(['all', 'instructions'] as const)('request report: reopened %s sheet omits fallback detail with leftAsWritten', async (scope) => {
  const { run } = await open(scope, left());
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  const sheet = screen.getByRole('dialog', { name: runTitle(run) });
  assertLeft(sheet);
  expect(within(sheet).queryByText('Nothing in the inbox', { exact: true })).toBeNull();
  expect(within(sheet).getByRole('button', { name: 'Done' })).toBeVisible();
  expect(within(sheet).queryByText('Everything has its place.', { exact: true })).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: reopened %s sheet without leftAsWritten names the new note', async (scope) => {
  const { run } = await open(scope, { ...empty(), created: [{ path: PATH, what: 'Made from 1 thing' }] });
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  const sheet = screen.getByRole('dialog', { name: runTitle(run) });
  expect(within(sheet).queryByRole('list', { name: 'Left as you wrote them' })).toBeNull();
  expect(within(sheet).getByText('1 new note made.', { exact: true })).toBeVisible();
});

it.each(['all', 'instructions'] as const)('request report: right panel Now for %s omits fallback detail with leftAsWritten', async (scope) => {
  const { run } = await open(scope, left(), [], true);
  const panel = screen.getByRole('tabpanel', { name: 'Activity' });
  const now = within(panel).getByRole('heading', { name: 'Now' }).closest('section');
  if (!now) throw new Error('Missing Now section');
  expect(within(now).getByText(runTitle(run), { exact: true })).toBeVisible();
  expect(within(now).queryByText('Everything has its place.', { exact: true })).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: right panel Now for %s without leftAsWritten names the new note', async (scope) => {
  const { run } = await open(scope, { ...empty(), created: [{ path: PATH, what: 'Made from 1 thing' }] }, [], true);
  const panel = screen.getByRole('tabpanel', { name: 'Activity' });
  const now = within(panel).getByRole('heading', { name: 'Now' }).closest('section');
  if (!now) throw new Error('Missing Now section');
  expect(within(now).getByText(runTitle(run), { exact: true })).toBeVisible();
  expect(within(now).getByText('1 new note made.', { exact: true })).toBeVisible();
});

it('request report: all with filings retains Home replay and status bar replay', async () => {
  const { run } = await open('all', { ...left(), filed: [{ name: 'Garden update.txt', title: 'Garden update', kind: 'other', to: 'Areas/Home' }] });
  const heading = screen.getByRole('heading', { name: '1 thing filed.', level: 2 });
  const card = heading.closest('section');
  if (!card) throw new Error('Missing report card');
  assertLeft(card);
  expect(within(card).getByText('Home got 1.', { exact: true })).toBeVisible();
  expect(within(card).queryByText(runTitle(run), { exact: true })).toBeNull();
  const detail = runDetail(run);
  if (detail) expect(within(card).queryByText(detail, { exact: true })).toBeNull();
  else expect(detail).toBe('');
  expect(within(card).getByRole('button', { name: 'Watch what Bower did' })).toBeVisible();
  expect(within(card).getByRole('button', { name: 'Got it' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /1 thing filed\. Watch what Bower did/ }));
  expect(useUi.getState().replayRunId).toBe(run.id);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: %s with no rows has no Home card and opens Nothing in the inbox', async (scope) => {
  const { run } = await open(scope, empty());
  const button = within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ });
  expect(screen.queryByRole('heading', { name: runTitle(run) })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  fireEvent.click(button);
  expect(screen.getByRole('dialog', { name: 'Nothing in the inbox' })).toBeVisible();
});

it.each([
  { created: [{ path: PATH, what: 'Made from 1 thing' }] },
  { updated: [{ path: PATH, what: 'One line added to its Timeline, as you asked.' }] },
  { setAside: [{ name: 'Garden update', why: 'Keep it for later.' }] },
  { questions: [{ id: 'question', text: 'Write it?', yes: 'Write it', no: 'Keep mine', askedAt: 0 }] },
])('request report: instructions report stays reachable for row %j', async (rows) => {
  const { run } = await open('instructions', { ...empty(), ...rows });
  expect(screen.getByRole('heading', { name: runTitle(run), level: 2 })).toBeVisible();
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  expect(screen.getByRole('dialog', { name: runTitle(run) })).toBeVisible();
});

it('request report: filing with replay keeps Home got 1 detail', async () => {
  await open('all', { ...empty(), filed: [{ name: 'Garden update.txt', title: 'Garden update', kind: 'other', to: 'Areas/Home' }] });
  const card = screen.getByRole('button', { name: 'Got it' }).closest('section');
  if (!card) throw new Error('Missing report card');
  expect(within(card).getByText('Home got 1.', { exact: true })).toBeVisible();
  expect(within(card).queryByText('Everything has its place.', { exact: true })).toBeNull();
});

it('request report: filing without replay uses runTitle and runDetail on Home', async () => {
  const { run } = await open('instructions', { ...empty(), filed: [{ name: 'Garden update.txt', title: 'Garden update', kind: 'other', to: 'Areas/Home' }] });
  const heading = screen.getByRole('heading', { name: 'Done. Bower read your changes.', level: 2 });
  const card = heading.closest('section');
  if (!card) throw new Error('Missing report card');
  expect(within(card).getByText(runDetail(run), { exact: true })).toBeVisible();
  expect(within(card).queryByText('Home got 1.', { exact: true })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: %s without replay omits fallback detail with leftAsWritten', async (scope) => {
  const { run } = await open(scope, left());
  const card = screen.getByRole('heading', { name: runTitle(run), level: 2 }).closest('section');
  if (!card) throw new Error('Missing report card');
  assertLeft(card);
  expect(within(card).queryByText('Everything has its place.', { exact: true })).toBeNull();
});

it.each(['all', 'instructions'] as const)('request report: %s without leftAsWritten names the new note', async (scope) => {
  const { run } = await open(scope, { ...empty(), created: [{ path: PATH, what: 'Made from 1 thing' }] });
  const card = screen.getByRole('heading', { name: runTitle(run), level: 2 }).closest('section');
  if (!card) throw new Error('Missing report card');
  expect(within(card).getByText('1 new note made.', { exact: true })).toBeVisible();
});

it('request report: leftAsWritten keeps a non-fallback detail on Home', async () => {
  const { run } = await open('instructions', { ...left(), yourChanges: 1 });
  const card = screen.getByRole('heading', { name: runTitle(run), level: 2 }).closest('section');
  if (!card) throw new Error('Missing report card');
  assertLeft(card);
  expect(within(card).getByText('1 change of yours read.', { exact: true })).toBeVisible();
});

it('request report: first press asks about a new pile; the status bar alone reopens the old report', async () => {
  const pile: Pile = { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: 3000,
    items: [{ id: 'f', name: 'f.pdf', kind: 'pdf', origin: 'From this computer' }] };
  const { run, markSeen } = await open('instructions', left(), [pile]);
  fireEvent.click(screen.getByRole('button', { name: 'Tidy up 1 thing' }));
  const ask = screen.getByRole('dialog');
  expect(ask).toHaveAccessibleName('Tidy up 1 thing?');
  expect(within(ask).queryByRole('list', { name: 'Left as you wrote them' })).toBeNull();
  expect(within(ask).getByRole('button', { name: 'Tidy up 1 thing' })).toBeVisible();
  fireEvent.click(within(ask).getByRole('button', { name: 'Not now' }));
  expect(markSeen).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: /waiting$/ }));
  const sheet = screen.getByRole('dialog', { name: runTitle(run) });
  assertLeft(sheet);
});
