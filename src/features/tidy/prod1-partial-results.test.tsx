/**
 * prod1-partial-results: a finished tidy-up that left work unfinished shows each saved name and reason, and its own
 * counts, on Home, the run sheet and the replay; the replay never says the inbox is empty. Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefs } from '@/app/prefs';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { FiledItem, RunReport, RunState, TreeNode } from '@/data/types';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';
import { Replay } from './Replay';
import { StatusBar } from './StatusBar';
import { TidySheet } from './TidySheet';
import { runTitle } from './run-words';

const EMPTY_CLAIM = 'Empty. Everything has its place.';
const ARRIVED = 'All filed items reached their folders.';
const WAIT3 = '3 things wait for the next tidy-up.';
const FILED: FiledItem[] = [
  { name: 'Seed order.pdf', title: 'Seed order', kind: 'pdf', to: 'Areas/Garden' },
  { name: 'Shed plan.png', title: 'Shed plan', kind: 'image', to: 'Areas/Garden' },
  { name: 'Water bill.pdf', title: 'Water bill', kind: 'pdf', to: 'Areas/Money' },
  { name: 'Rent note.txt', title: 'Rent note', kind: 'other', to: 'Areas/Money' },
];
type Row = { name: string; why: string };
/** A dropped pile of three things (one saved row) and a request Bower could not do. */
const PILE: Row = { name: 'Trip photos', why: "Bower couldn't read these pictures, so they stay in your inbox." };
const REQUEST: Row = { name: 'Sort the garden receipts by month', why: 'Bower needs your yes before it does this.' };
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const partial = (extra: Partial<RunReport> = {}): RunReport => ({ ...empty(), filed: FILED, setAside: [PILE, REQUEST], ...extra });
const TREE: TreeNode[] = [{ name: 'Areas', path: 'Areas', type: 'folder', children: [
  { name: 'Seed order.pdf', path: 'Areas/Garden/Seed order.pdf', type: 'file', kind: 'pdf', modified: 1 } as TreeNode,
] } as TreeNode];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null });
});

async function open(report: RunReport, scope: RunState['scope'] = 'all') {
  const base = loadingSources();
  const saved = structuredClone(report);
  let run: RunState = { id: 'partial-run', scope, phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  const listeners = new Set<() => void>();
  const markSeen = vi.fn(async () => { run = { ...run, seen: true }; listeners.forEach((cb) => cb()); });
  const doors: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => TREE,
    changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (t, k) => typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => run, markSeen,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } } };
  useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null });
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main><StatusBar /><TidySheet /><Replay /></DataProvider></MemoryRouter>);
  });
  await act(async () => {});
  return { markSeen, saved, current: () => run };
}

const homeCard = (): HTMLElement => {
  const card = screen.getByRole('button', { name: 'Got it' }).closest('section');
  if (!card) throw new Error('Missing report card');
  return card;
};

const openSheet = (): HTMLElement => {
  fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('button'));
  return screen.getByRole('dialog');
};

/** Exactly these saved rows, in order, each its name then its reason as plain text. */
function assertSetAside(scope: HTMLElement, rows: Row[]) {
  const list = within(scope).getByRole('list', { name: 'Set aside' });
  const items = within(list).getAllByRole('listitem');
  expect(items).toHaveLength(rows.length);
  rows.forEach((row, i) => {
    const item = items[i];
    if (!item) throw new Error('Missing row');
    const name = within(item).getByText(row.name, { exact: true });
    expect(name.nextElementSibling).toHaveTextContent(row.why, { normalizeWhitespace: false });
    expect(name.nextElementSibling?.textContent).toBe(row.why);
    expect(within(item).queryByRole('link')).toBeNull();
    expect(item.querySelector('b, i, a, strong, em, code')).toBeNull();
  });
}

/** Four filed, two set aside, three waiting: each count apart, never five set aside. */
function assertCounts(scope: HTMLElement, filed = true) {
  if (filed) expect(scope).toHaveTextContent('4 things filed');
  expect(scope).toHaveTextContent('2 things set aside');
  expect(scope).toHaveTextContent(WAIT3);
  expect(scope).not.toHaveTextContent(/5 things set aside/);
  expect(scope).not.toHaveTextContent(/3 things set aside/);
}

/** Starts the replay's timeline and plays it to its end. */
async function playToEnd(): Promise<HTMLElement> {
  const court = screen.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
  for (let i = 0; i < 120 && !within(court).queryByRole('heading', { name: '4 things filed', level: 2 }); i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  }
  expect(within(court).getByRole('heading', { name: '4 things filed', level: 2 })).toBeVisible();
  expect(within(court).getByRole('button', { name: 'Done' })).toBeVisible();
  return court;
}

function assertReplayEnd(court: HTMLElement) {
  expect(within(court).queryByText(EMPTY_CLAIM)).toBeNull();
  expect(court).not.toHaveTextContent(/Everything has its place/);
  expect(within(court).getByText(ARRIVED, { exact: true })).toBeVisible();
  expect(within(court).queryByRole('region', { name: 'Your inbox' })).toBeNull();
  expect(within(court).getByRole('region', { name: 'Filed from your inbox' })).toBeVisible();
  assertCounts(court);
  assertSetAside(court, [PILE, REQUEST]);
}

describe('AC1', () => {
  it('partial_report_keeps_dropped_pile_and_request_visible', async () => {
    await open(partial());
    const card = homeCard();
    assertSetAside(card, [PILE, REQUEST]);
    // Home keeps its destination summary, replay and Got it beside the unfinished detail.
    expect(within(card).getByText('Garden got 2 and Money got 2.', { exact: true })).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Watch what Bower did' })).toBeVisible();
    useUi.getState().setTidy(true, 'partial-run');
    await act(async () => {});
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAccessibleName('Done. 4 things filed.');
    assertSetAside(sheet, [PILE, REQUEST]);
  });
});

describe('AC2', () => {
  it('replay_does_not_claim_empty_inbox_when_work_waits', async () => {
    vi.useFakeTimers();
    usePrefs.setState({ birdMoves: true });
    const { markSeen } = await open(partial({ waiting: 3 }));
    fireEvent.click(within(homeCard()).getByRole('button', { name: 'Watch what Bower did' }));
    await act(async () => {});
    assertReplayEnd(await playToEnd());
    // Watching again from the existing entry point after it was seen says the same.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(markSeen).toHaveBeenCalledWith('partial-run');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Watch the last tidy-up' }));
    await act(async () => {});
    assertReplayEnd(await playToEnd());
  });

  it('the heap counts only filed items while it plays', async () => {
    vi.useFakeTimers();
    await open(partial());
    fireEvent.click(within(homeCard()).getByRole('button', { name: 'Watch what Bower did' }));
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Filed from your inbox, 4 left', level: 3 })).toBeVisible();
  });

  it('reduced motion: the finished replay never claims an empty inbox', async () => {
    vi.useFakeTimers();
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q.includes('reduce') }));
    await open(partial({ waiting: 3 }));
    fireEvent.click(within(homeCard()).getByRole('button', { name: 'Watch what Bower did' }));
    assertReplayEnd(await playToEnd());
  });
});

describe('AC3', () => {
  it('budget_waits_and_refusal_rows_are_not_double_counted', async () => {
    vi.useFakeTimers();
    await open(partial({ waiting: 3 }));
    const card = homeCard();
    assertCounts(card);
    assertSetAside(card, [PILE, REQUEST]);
    useUi.getState().setTidy(true, 'partial-run');
    await act(async () => {});
    const sheet = screen.getByRole('dialog');
    assertCounts(sheet);
    assertSetAside(sheet, [PILE, REQUEST]);
    act(() => { useUi.getState().setTidy(false); useUi.getState().startReplay('partial-run'); });
    const court = await playToEnd();
    assertCounts(court);
    assertSetAside(court, [PILE, REQUEST]);
  });
});

describe('unfinished work without anything filed (R-zero)', () => {
  it.each([
    ['all', {}],
    ['all', { nothingReady: true as const }],
    ['instructions', {}],
    ['instructions', { nothingReady: true as const }],
  ] as const)('%s %j set aside only shows every row and its count on Home and the sheet', async (scope, extra) => {
    await open({ ...empty(), ...extra, setAside: [PILE, REQUEST] }, scope);
    const card = homeCard();
    expect(card).toHaveTextContent('2 things set aside');
    expect(card).not.toHaveTextContent('Nothing in the inbox was ready yet');
    assertSetAside(card, [PILE, REQUEST]);
    expect(within(card).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
    const sheet = openSheet();
    expect(sheet).toHaveTextContent('2 things set aside');
    expect(sheet).not.toHaveTextContent('Nothing in the inbox was ready yet');
    assertSetAside(sheet, [PILE, REQUEST]);
  });

  it.each(['all', 'instructions'] as const)('%s waiting only has a Home card and opens from the status bar', async (scope) => {
    const { current } = await open({ ...empty(), waiting: 3 }, scope);
    const card = homeCard();
    expect(within(card).getByRole('heading', { name: runTitle(current()), level: 2 })).toBeVisible();
    expect(card).toHaveTextContent(WAIT3);
    expect(within(card).queryByRole('list', { name: 'Set aside' })).toBeNull();
    const sheet = openSheet();
    expect(sheet).toHaveAccessibleName(runTitle(current()));
    expect(sheet).toHaveTextContent(WAIT3);
    expect(within(sheet).queryByRole('list', { name: 'Set aside' })).toBeNull();
  });

  it('a genuinely empty nothing-ready report keeps its sentence', async () => {
    await open({ ...empty(), nothingReady: true });
    useUi.getState().setTidy(true, 'partial-run');
    await act(async () => {});
    expect(screen.getByRole('dialog')).toHaveTextContent('Nothing in the inbox was ready yet, so it stays as it is.');
  });
});

describe('every saved row, literally (R-duplicates, R-literal)', () => {
  const twins: Row[] = [
    { name: 'Garden list', why: 'Bower could not open this file.' },
    { name: 'Garden list', why: 'Bower needs your yes before it does this.' },
  ];

  it('two rows with the same name stay two on Home, the sheet and the replay', async () => {
    vi.useFakeTimers();
    await open(partial({ setAside: twins }));
    const card = homeCard();
    assertSetAside(card, twins);
    expect(card).toHaveTextContent('2 things set aside');
    useUi.getState().setTidy(true, 'partial-run');
    await act(async () => {});
    const sheet = screen.getByRole('dialog');
    assertSetAside(sheet, twins);
    expect(sheet).toHaveTextContent('2 things set aside');
    act(() => { useUi.getState().setTidy(false); useUi.getState().startReplay('partial-run'); });
    const court = await playToEnd();
    assertSetAside(court, twins);
    expect(court).toHaveTextContent('2 things set aside');
  });

  it('quotes, markup-like words, a cut label and a fallback file label show as written', async () => {
    const odd: Row[] = [
      { name: 'Ask "Alex" about <b>the shed</b>', why: 'Bower read <i>this</i> as "two" requests & [[stopped]].' },
      { name: 'Sort every receipt from the allotment and the…', why: 'Bower needs your yes before it does this.' },
      { name: 'change-2.json', why: 'Bower could not read this change.' },
    ];
    await open({ ...empty(), setAside: odd });
    assertSetAside(homeCard(), odd);
    assertSetAside(openSheet(), odd);
  });
});

describe('acknowledging (R-acknowledgment)', () => {
  it('Got it hides the result and keeps its saved rows and waiting work', async () => {
    const { markSeen, saved, current } = await open(partial({ waiting: 3 }));
    fireEvent.click(within(homeCard()).getByRole('button', { name: 'Got it' }));
    await act(async () => {});
    expect(markSeen).toHaveBeenCalledWith('partial-run');
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(current().report).toEqual(saved);
  });

  it('the sheet’s Done marks a set-aside-only report seen and keeps its rows', async () => {
    const { markSeen, saved, current } = await open({ ...empty(), setAside: [PILE, REQUEST] });
    fireEvent.click(within(openSheet()).getByRole('button', { name: 'Done' }));
    await act(async () => {});
    expect(markSeen).toHaveBeenCalledWith('partial-run');
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(current().report).toEqual(saved);
  });
});
