/**
 * ux-results-polish: the report says its counts and keeps its lists behind "See the list"; the phone replay lists every
 * thing by its whole name under its folder; the replay closes with "Close"; a set-aside row reads as the Inbox names
 * its pile. Made-up data only.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { FiledItem, Pile, Question, RunReport, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { DESKTOP } from '@/ui/media';
import { Replay } from './Replay';
import { SetAsideRows } from './RunLinks';
import { TidySheet } from './TidySheet';
import { runDetail, runTitle } from './run-words';

const PARA = 'Projects have an end, Areas go on, Resources are for later, Archive is done.';
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const run = (report: RunReport, scope: RunState['scope'] = 'all', phase: RunState['phase'] = 'done'): RunState =>
  ({ id: 'polish-run', scope, phase, requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report });
const filed = (n: number, to = 'Areas/Money/Receipts/2026-09'): FiledItem[] =>
  Array.from({ length: n }, (_, i) => ({ name: `r${i}.pdf`, title: `Saltmere weekend, receipt number ${i + 1}, 12 Sep`, kind: 'pdf' as const, to }));
const QUESTION: Question = { id: 'q-polish', text: 'Keep one note for both?', yes: 'Yes, merge', no: 'No, keep both', askedAt: 1000 };
const ASIDE = { name: 'Garden list', why: 'Bower could not open this file.' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null });
});

/** Existing public ports only (as prod1-partial-results): a finished run, an inbox, and nothing else loading. */
async function mount(ui: React.ReactNode, current: RunState | null, piles: Pile[] = [], questions: Question[] = []): Promise<void> {
  const base = loadingSources();
  const doors: Record<string, unknown> = { piles: async () => piles, pilesListed: async () => null, tree: async () => [],
    changes: async () => [], questions: async () => questions, suggestions: async () => [], uploadNotice: async () => null };
  const vault = new Proxy(base.vault, { get: (t, k) => typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => current, markSeen: vi.fn(async () => undefined), subscribe: () => () => undefined } };
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={sources}>{ui}</DataProvider></MemoryRouter>);
  });
  await act(async () => {});
}

describe('AC1 words', () => {
  it('AC1 queued_line: a queued run says the plain line', () => {
    expect(runDetail(run(empty(), 'all', 'queued'))).toBe('Waiting to start. Usually under a minute.');
    expect(runDetail(run(empty(), 'instructions', 'queued'))).toBe('Waiting to start. Usually under a minute.');
  });

  it('AC1 heading_counts: a filing report heads with what it filed and the notes it updated', () => {
    const two = { ...empty(), filed: filed(15), updated: [{ path: 'Projects/Flat hunt/Flat hunt.md', what: 'A line' }, { path: 'Projects/Job hunt/Job hunt.md', what: 'A line' }, { path: 'Projects/Job hunt/Job hunt.md', what: 'Another line' }] };
    expect(runTitle(run(two))).toBe('Done. 15 things filed, 2 notes updated.');
    expect(runTitle(run({ ...empty(), filed: filed(1), updated: [{ path: 'Areas/Home/Papers.md', what: 'A line' }] }))).toBe('Done. 1 thing filed, 1 note updated.');
    expect(runTitle(run({ ...empty(), updated: [{ path: 'Areas/Home/Papers.md', what: 'A line' }] }))).toBe('Done. 0 things filed, 1 note updated.');
    // A note made in the run is new, never "updated" as well.
    expect(runTitle(run({ ...empty(), filed: filed(1), created: [{ path: 'Areas/Home/Papers.md', what: 'Made' }], updated: [{ path: 'Areas/Home/Papers.md', what: 'A line' }] }))).toBe('Done. 1 thing filed.');
  });

  it('AC1 truthful_unchanged (guard): instruction-only, empty and already-saved outcomes keep their words', () => {
    expect(runTitle(run({ ...empty(), updated: [{ path: 'Areas/Home/Papers.md', what: 'A line' }] }, 'instructions'))).toBe('Done. Bower read your changes.');
    expect(runTitle(run(empty()))).toBe('Done. 0 things filed.');
    expect(runTitle(run({ ...empty(), alreadySaved: [{ name: 'a.pdf', as: 'Areas/Money/a.pdf' }] }))).toBe('Done. 1 thing already saved.');
  });

  it('AC6 instructions_run_makes_no_inbox_claim: a read of your changes, writing, says only what it does', () => {
    expect(runDetail(run(empty(), 'instructions', 'writing'))).toBe('Doing what your changes call for.');
  });
});

describe('AC2 the report folds its lists', () => {
  it('AC2 see_the_list: made and updated notes sit in a closed native disclosure; what needs you stays outside it', async () => {
    const report: RunReport = { ...empty(), filed: filed(2), created: [{ path: 'Areas/Garden/Seed order.md', what: 'Made from 1 thing' }],
      updated: [{ path: 'Areas/Home/Papers.md', what: 'A line' }], setAside: [ASIDE], questions: [QUESTION], waiting: 2 };
    useUi.setState({ tidyOpen: true, tidyReportRunId: 'polish-run' });
    await mount(<TidySheet />, { ...run(report), requestedAt: 900 }, [], [QUESTION]);
    const sheet = screen.getByRole('dialog');
    const summary = within(sheet).getByText('See the list', { exact: true });
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.parentElement;
    expect(details?.tagName).toBe('DETAILS');
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(within(sheet).getByRole('list', { name: 'New notes' }));
    expect(details).toContainElement(within(sheet).getByRole('list', { name: 'Brought up to date' }));
    expect(within(sheet).getAllByRole('link').every((a) => details?.contains(a))).toBe(true);
    // Outside the disclosure: the question, what was set aside, and what waits.
    expect(details).not.toContainElement(within(sheet).getByRole('list', { name: 'Set aside' }));
    expect(details).not.toContainElement(within(sheet).getByText(QUESTION.text));
    expect(details).not.toContainElement(within(sheet).getByRole('status'));
    expect(within(sheet).getByRole('status')).toHaveTextContent('2 things wait for the next tidy-up.');
    expect(sheet).toHaveAccessibleName('Done. 2 things filed, 1 note updated.');
  });

  it('AC2 no_list_no_disclosure (guard): a report with no made or updated notes has no "See the list"', async () => {
    useUi.setState({ tidyOpen: true, tidyReportRunId: 'polish-run' });
    await mount(<TidySheet />, run({ ...empty(), filed: filed(1), setAside: [ASIDE] }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByText('See the list')).toBeNull();
    expect(within(sheet).getByRole('list', { name: 'Set aside' })).toBeVisible();
  });
});

describe('AC3-AC5 the replay', () => {
  const ITEMS = [...filed(6), { name: 'Dentist.pdf', title: 'Dentist, 14 Oct', kind: 'pdf' as const, to: 'Areas/Health' }];

  it('AC3 phone_rows_whole: on a phone there is no heap, and every thing is under its folder by its whole name at once', async () => {
    vi.useFakeTimers();
    useUi.setState({ replayRunId: 'polish-run' });
    await mount(<Replay />, run({ ...empty(), filed: ITEMS }));
    const court = screen.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    expect(within(court).queryByRole('region', { name: 'Filed from your inbox' })).toBeNull();
    const folders = within(court).getByRole('region', { name: 'Your folders' });
    for (const it of ITEMS) expect(within(folders).getByText(it.title, { exact: true })).toBeInTheDocument();
    const receipts = within(folders).getByText('Receipts 2026-09', { exact: false }).closest('div');
    expect(receipts?.querySelectorAll('[data-kind]')).toHaveLength(6);
  });

  it('AC4 desktop_heap (guard): the desktop keeps its heap and its shelves fill as Bower carries', async () => {
    vi.useFakeTimers();
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q === DESKTOP }));
    useUi.setState({ replayRunId: 'polish-run' });
    await mount(<Replay />, run({ ...empty(), filed: ITEMS }));
    const court = screen.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    expect(within(court).getByRole('heading', { name: 'Filed from your inbox, 7 left', level: 3 })).toBeVisible();
  });

  it('AC5 close_and_folders_once: the replay closes with "Close" while it plays and after, and says what the four folders are for once', async () => {
    vi.useFakeTimers();
    useUi.setState({ replayRunId: 'polish-run' });
    await mount(<Replay />, run({ ...empty(), filed: ITEMS }));
    const court = screen.getByRole('dialog', { name: 'What Bower did in the tidy-up' });
    expect(within(court).getByRole('button', { name: 'Close' })).toBeVisible();
    expect(within(court).getAllByText(PARA, { exact: true })).toHaveLength(1);
    for (let i = 0; i < 120 && !within(court).queryByRole('heading', { name: '7 things filed', level: 2 }); i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    expect(within(court).getByRole('heading', { name: '7 things filed', level: 2 })).toBeVisible();
    expect(within(court).getByRole('button', { name: 'Close' })).toBeVisible();
    expect(within(court).queryByRole('button', { name: /^(Skip|Done)$/ })).toBeNull();
    expect(within(court).getAllByText(PARA, { exact: true })).toHaveLength(1);
  });
});

describe('F5 set-aside names (qa-prod-8)', () => {
  it('F5 aside_names_as_inbox: a row named by a waiting pile folder or lone file reads as the Inbox names it; other rows as written', async () => {
    const words: Pile = { id: 'p1', path: 'Inbox/2026-10-19 Ferrowick Choir autumn subscription, 24…', text: 'Ferrowick Choir autumn subscription, 24 pounds, due 21 November', createdAt: 3000, items: [] };
    const lone: Pile = { id: 'p2', path: 'Inbox/Alex allotment plan.md', text: '', createdAt: 2000, items: [{ id: 'f', name: 'Alex allotment plan.md', kind: 'note', origin: 'From this computer' }] };
    const rows = [
      { name: '2026-10-19 Ferrowick Choir autumn subscription, 24…', why: "Bower couldn't tidy this up yet. Try again." },
      { name: 'Alex allotment plan.md', why: "Bower couldn't tidy this up yet. Try again." },
      { name: 'Sort the garden receipts by month', why: 'Bower needs your yes before it does this.' },
    ];
    await mount(<SetAsideRows rows={rows} />, null, [words, lone]);
    const items = within(screen.getByRole('list', { name: 'Set aside' })).getAllByRole('listitem');
    expect(items.map((li) => li.firstElementChild?.textContent)).toEqual([
      'Ferrowick Choir autumn subscription, 24 pounds, due 21 November',
      'Alex allotment plan',
      'Sort the garden receipts by month',
    ]);
  });
});
