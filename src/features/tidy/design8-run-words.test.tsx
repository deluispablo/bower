/**
 * design8-run-words (designer, post-qa-7, demo on main f40585c0): the words of a finished run and of Bower's Now card
 * say what happened. P1-1: a request that changed nothing is reported "Everything has its place." beside "Bower didn't
 * change anything for this request." P3-9: with an empty inbox the resting line still asks for a tidy-up. P3-10: a
 * month folder is named as on Drive ("Receipts 2026-09") inside a sentence. P3-6: the right panel offers "Tell Bower
 * something" on the Tell Bower screen itself. Made-up words only.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import type { Sources } from '@/data/sources';
import { BowerError, type FiledItem, type RunReport, type RunState } from '@/data/types';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { landedSummary, runDetail, runTitle } from './run-words';

const NOTHING_CHANGED = "Bower didn't change anything this time.";
const CHORE = 'Put my visa papers together';
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const done = (scope: RunState['scope'], report: RunReport): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false, report });
const filed = (to: string, n: number): FiledItem[] =>
  Array.from({ length: n }, (_, i) => ({ name: `${to}-${i}.pdf`, title: `${to} ${i}`, kind: 'pdf', to }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function panel(sources: Sources, at = '/'): Promise<HTMLElement> {
  await act(async () => {
    render(<MemoryRouter initialEntries={[at]}><DataProvider sources={sources}><BowerPanel /></DataProvider></MemoryRouter>);
  });
  const now = (await screen.findByRole('heading', { name: 'Now' })).closest('section');
  if (!now) throw new Error('Missing Now section');
  return now;
}

describe('AC1 a run that changed nothing says so', () => {
  it('AC1 design8-run-words-nothing-changed: a read of your changes with nothing to report says Bower changed nothing', () => {
    expect(runDetail(done('instructions', empty()))).toBe(NOTHING_CHANGED);
  });

  it('AC1 design8-run-words-rows-unchanged: a run with something to say keeps its words (positive control)', () => {
    expect(runDetail(done('instructions', { ...empty(), yourChanges: 1 }))).toBe('1 change of yours read.');
    expect(runDetail(done('instructions', { ...empty(), created: [{ path: 'Areas/Home/Allotment diary.md', what: 'Made from 1 thing' }] }))).toBe('Everything has its place.');
    expect(runDetail(done('all', empty()))).toBe('Everything has its place.');
    expect(runDetail(done('instructions', { ...empty(), leftAsWritten: [{ name: 'Areas/Home/Allotment diary.md', fileId: 'a', why: "Bower didn't add the line." }] }))).toBe('');
  });

  it('AC1 design8-run-words-demo-now: after a request the demo did nothing for, the Now card says Bower changed nothing', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const sources = w.sources();
    await sources.vault.addRequest(CHORE);
    await sources.runs.start('instructions', { allowWeb: false });
    await vi.runAllTimersAsync();
    const run = await sources.runs.current();
    if (run?.phase !== 'done') throw new Error('the run did not finish');
    vi.useRealTimers();
    const now = await panel(sources);
    // Positive control: the finished run's card is there, with its title.
    expect(within(now).getByText(runTitle(run), { exact: true })).toBeVisible();
    expect(within(now).queryByText('Everything has its place.', { exact: true })).toBeNull();
    expect(within(now).getByText(NOTHING_CHANGED, { exact: true })).toBeVisible();
  });
});

describe('AC2 resting with an empty inbox', () => {
  it('AC2 design8-run-words-resting-empty: with nothing in the inbox the Now card says nothing is waiting', async () => {
    const now = await panel(new DemoWorld({ scenario: 'empty', scale: 'instant', latency: 0 }).sources());
    expect(await within(now).findByText(/^Resting\./)).toBeVisible();
    expect(within(now).getByText('Resting. Nothing waiting in the inbox.', { exact: true })).toBeVisible();
  });

  it('AC2 design8-run-words-resting-waiting: with things waiting it keeps its line (positive control)', async () => {
    const now = await panel(new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 }).sources());
    expect(await within(now).findByText('Resting. Tidy up when the inbox has what you want filed.', { exact: true })).toBeVisible();
  });

  it('AC2 design8-run-words-resting-failed-refresh: after a failed refresh the card keeps its old line, then says nothing waits once the inbox reads again', async () => {
    const real = new DemoWorld({ scenario: 'empty', scale: 'instant', latency: 0 }).sources();
    let fail = false;
    const heard = new Set<() => void>();
    const sources: Sources = {
      ...real,
      vault: {
        ...real.vault,
        piles: () => (fail ? Promise.reject(new BowerError('offline', 'Your inbox could not be read. Try again.')) : real.vault.piles()),
        subscribe: (cb) => {
          heard.add(cb);
          const off = real.vault.subscribe(cb);
          return () => { heard.delete(cb); off(); };
        },
      },
    };
    const refresh = async (): Promise<void> => { await act(async () => { heard.forEach((cb) => cb()); }); };
    const now = await panel(sources);
    expect(await within(now).findByText('Resting. Nothing waiting in the inbox.', { exact: true })).toBeVisible();
    fail = true;
    await refresh();
    expect(await within(now).findByText('Resting. Tidy up when the inbox has what you want filed.', { exact: true })).toBeVisible();
    expect(within(now).queryByText('Resting. Nothing waiting in the inbox.', { exact: true })).toBeNull();
    fail = false;
    await refresh();
    expect(await within(now).findByText('Resting. Nothing waiting in the inbox.', { exact: true })).toBeVisible();
  });
});

describe('AC3 a month folder in words', () => {
  it('AC3 design8-run-words-month: a month folder reads as a month and its parent, in lower case after it', () => {
    const others = ['Projects/Flat hunt', 'Areas/Money', 'Areas/Health', 'Areas/Home', 'Resources/Recipes'].flatMap((to) => filed(to, 1));
    const report = { ...empty(), filed: [...filed('Resources/Receipts/2026-09', 9), ...filed('Projects/Applications', 2), ...others] };
    expect(landedSummary(done('all', report))).toBe('September 2026 receipts got 9, Applications got 2 and 5 other folders got the rest.');
  });

  it('AC3 design8-run-words-year: a year folder reads as the year and its parent', () => {
    expect(landedSummary(done('all', { ...empty(), filed: filed('Resources/Receipts/2026', 1) }))).toBe('2026 receipts got 1.');
  });

  it('AC3 design8-run-words-plain: other folders keep their names (positive control)', () => {
    expect(landedSummary(done('all', { ...empty(), filed: [...filed('Projects/Flat hunt', 2), ...filed('Areas/Money', 1)] }))).toBe('Flat hunt got 2 and Money got 1.');
  });

  it('AC3 design8-run-words-boundaries: only a real month under a parent reads in words; anything else keeps its name as before', () => {
    const one = (to: string): string => landedSummary(done('all', { ...empty(), filed: filed(to, 1) }));
    expect(one('Resources/Receipts/2026-01')).toBe('January 2026 receipts got 1.');
    expect(one('Resources/Receipts/2026-12')).toBe('December 2026 receipts got 1.');
    expect(one('Resources/Receipts/2026-13')).toBe('Receipts 2026-13 got 1.');
    expect(one('Resources/Receipts/2026-00')).toBe('Receipts 2026-00 got 1.');
    expect(one('2026-09')).toBe('2026-09 got 1.');
    expect(one('2026')).toBe('2026 got 1.');
  });

  it('AC3 design8-run-words-acronym: a parent in capitals keeps its case; a normal parent still lower-cases', () => {
    const one = (to: string): string => landedSummary(done('all', { ...empty(), filed: filed(to, 1) }));
    expect(one('Resources/NHS/2026-09')).toBe('September 2026 NHS got 1.');
    expect(one('Resources/Receipts/2026-09')).toBe('September 2026 receipts got 1.');
  });
});

describe('AC4 no Tell Bower offer on its own screen', () => {
  it('AC4 design8-run-words-tell-bower-here: on the Tell Bower screen the panel does not offer it', async () => {
    const now = await panel(new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 }).sources(), '/bower');
    // Positive control: the panel itself is there.
    expect(now).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Tell Bower something' })).toBeNull();
  });

  it('AC4 design8-run-words-tell-bower-elsewhere: anywhere else the panel offers it (positive control)', async () => {
    await panel(new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 }).sources(), '/files');
    expect(screen.getByRole('button', { name: 'Tell Bower something' })).toBeVisible();
  });
});
