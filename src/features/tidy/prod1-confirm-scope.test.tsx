/**
 * prod1-confirm-scope (qa-prod-1 F10): a tidy-up started from the confirmation sheet also considers pending requests
 * and rules (`startRun(runs, 'all')`). The sheet names inbox piles, their things, pending requests and pending rules
 * separately, follows the readers' updates while open, and never shows a count it does not know: loading and failed
 * reads say so per category, with that reader's retry, while Start stays available.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile, type Request, type Rule, type RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { TidySheet } from './TidySheet';

const AT = 1_800_000_000_000;
const item = (id: string, name: string, kind: 'pdf' | 'image' | 'link' = 'pdf') => ({ id, name, kind, origin: 'From this device' });
// Five piles with 2, 2, 1, 1 and 1 things: 7 things, one of them a note only.
const PILES: Pile[] = [
  { id: 'p-1', text: '', createdAt: AT, items: [item('i-1', 'lease.pdf'), item('i-2', 'deposit.pdf')] },
  { id: 'p-2', text: 'Garden receipts', createdAt: AT, items: [item('i-3', 'seeds.jpg', 'image'), item('i-4', 'hose.jpg', 'image')] },
  { id: 'p-3', text: 'Call the plumber on Monday', createdAt: AT, items: [] },
  { id: 'p-4', text: '', createdAt: AT, items: [item('i-5', 'Allotment rota.url', 'link')] },
  { id: 'p-5', text: 'Boiler manual', createdAt: AT, items: [item('i-6', 'boiler.pdf')] },
];
const request = (id: string, done?: string): Request => ({ id, text: `Request ${id}`, at: AT, ...(done ? { done } : {}) });
const rule = (id: string, pending?: boolean): Rule => ({ id, text: `Rule ${id}`, since: AT, ...(pending === undefined ? {} : { pending }) });
// Two pending requests and one done; one pending rule and two established ones (pending omitted, pending false).
const REQUESTS = [request('r-1'), request('r-2'), request('r-3', 'Moved the lease to Home.')];
const RULES = [rule('u-1', true), rule('u-2'), rule('u-3', false)];
const REQUESTS_FAILED = 'Your requests could not be read.';
const RULES_FAILED = 'Your rules could not be read.';

type Read<T> = T | BowerError | 'never';
const answer = <T,>(read: Read<T>): Promise<T> => (read === 'never' ? new Promise<T>(() => undefined)
  : read instanceof BowerError ? Promise.reject(read) : Promise.resolve(read));

async function settle(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

/** The confirmation sheet over the given reads; `state` changes what the next read answers, `emit` is a source update. */
async function mount(initial: { piles?: Pile[]; requests: Read<Request[]>; rules: Read<Rule[]> }) {
  const state = { piles: PILES as Read<Pile[]>, ...initial };
  const listeners = new Set<() => void>();
  const base = loadingSources();
  const start = vi.fn(() => new Promise<RunState>(() => undefined));
  const methods: Record<string, unknown> = {
    piles: () => answer(state.piles), requests: () => answer(state.requests), rules: () => answer(state.rules),
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k)) });
  const sources: Sources = { ...base, vault, runs: { ...base.runs, start, current: async () => null, subscribe: () => () => undefined } };
  render(<MemoryRouter><DataProvider sources={sources}><TidySheet /></DataProvider></MemoryRouter>);
  await settle();
  const sheet = (): HTMLElement => screen.getByRole('dialog');
  const summary = (): HTMLElement => within(sheet()).getByRole('list', { name: 'Requests and pending rules' });
  /** A summary row by its category label. */
  const row = (label: 'Requests' | 'Pending rules'): HTMLElement => {
    const li = within(summary()).getByText(label, { exact: true }).closest('li');
    if (!li) throw new Error(`Missing ${label} row`);
    return li;
  };
  /** A category's failed read: its alert and retry, named by the category. */
  const failure = (label: 'Requests' | 'Pending rules'): HTMLElement | null => within(sheet()).queryByRole('group', { name: label });
  const emit = async (): Promise<void> => { act(() => { listeners.forEach((cb) => cb()); }); await settle(); };
  return { state, start, sheet, summary, row, failure, emit };
}

beforeEach(() => {
  vi.useFakeTimers();
  useUi.setState({ tidyOpen: true, tidyReportRunId: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useUi.setState({ tidyOpen: false });
});

const START = 'Tidy up 7 things';
/** The sheet's visible title (the dialog's own title is hidden for screen readers to read once). */
const visibleTitle = (sheet: HTMLElement): string | null | undefined => sheet.querySelector('p[aria-hidden="true"]')?.textContent;

describe('confirmation_names_piles_requests_and_rules', () => {
  it('five piles, seven things, two pending requests and one pending rule, each named as itself', async () => {
    const m = await mount({ requests: REQUESTS, rules: RULES });
    const sheet = m.sheet();
    // Requests and rules never raise the number of things.
    expect(sheet).toHaveAccessibleName('Tidy up 7 things?');
    expect(visibleTitle(sheet)).toBe('Tidy up 7 things?');
    expect(within(sheet).getByRole('button', { name: START })).toBeVisible();
    expect(within(sheet).getByText('In the inbox: 5 piles, 7 things', { exact: true })).toBeVisible();
    const piles = within(sheet).getByRole('list', { name: 'In the inbox' });
    expect(within(piles).getAllByRole('listitem')).toHaveLength(5);
    // Per-pile counts are things, never bare numbers or piles; a note-only pile is one thing.
    expect(within(piles).getAllByText('2 things', { exact: true })).toHaveLength(2);
    expect(within(piles).getAllByText('1 thing', { exact: true })).toHaveLength(3);
    expect(within(piles).getByText('Call the plumber on Monday').closest('li')).toHaveTextContent('1 thing');
    // Pending only: the done request and the established rules (pending omitted or false) are not counted.
    expect(within(m.row('Requests')).getByText('2 requests', { exact: true })).toBeVisible();
    expect(within(m.row('Pending rules')).getByText('1 pending rule', { exact: true })).toBeVisible();
    expect(within(sheet).getByText('Bower will consider these requests and pending rules too. Some work may wait for another tidy-up.', { exact: true })).toBeVisible();
    // Eight items are never called five piles or eight things.
    expect(within(sheet).queryByText(/\b8 things\b|\b5 things\b|\b8 piles\b|\b3 requests\b|\b3 pending rules\b/)).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: START }));
    expect(m.start).toHaveBeenCalledWith('all', expect.anything());
  });

  it('counts follow request and rule updates while the sheet stays open, without a reload', async () => {
    const m = await mount({ requests: REQUESTS, rules: RULES });
    const counts = (): [string, string] => [m.row('Requests').textContent ?? '', m.row('Pending rules').textContent ?? ''];
    expect(counts()).toEqual(['Requests2 requests', 'Pending rules1 pending rule']);
    m.state.requests = [...REQUESTS, request('r-4')];
    await m.emit();
    expect(within(m.row('Requests')).getByText('3 requests', { exact: true })).toBeVisible();
    m.state.requests = [request('r-2'), request('r-3', 'Done.'), request('r-4')];
    await m.emit();
    expect(within(m.row('Requests')).getByText('2 requests', { exact: true })).toBeVisible();
    m.state.requests = [request('r-2', 'Done.'), request('r-3', 'Done.'), request('r-4')];
    await m.emit();
    expect(within(m.row('Requests')).getByText('1 request', { exact: true })).toBeVisible();
    m.state.rules = [...RULES, rule('u-4', true)];
    await m.emit();
    expect(within(m.row('Pending rules')).getByText('2 pending rules', { exact: true })).toBeVisible();
    m.state.rules = [rule('u-2'), rule('u-3', false), rule('u-4', true)];
    await m.emit();
    expect(within(m.row('Pending rules')).getByText('1 pending rule', { exact: true })).toBeVisible();
    m.state.rules = [rule('u-2'), rule('u-3', false), rule('u-4', false)];
    await m.emit();
    expect(within(m.row('Pending rules')).getByText('0 pending rules', { exact: true })).toBeVisible();
    // The same sheet, still asking about the same things.
    expect(m.sheet()).toHaveAccessibleName('Tidy up 7 things?');
    expect(within(m.sheet()).getByRole('button', { name: START })).toBeVisible();
  });

  it('an empty inbox says so, still shows pending requests and rules, and offers only Close', async () => {
    const m = await mount({ piles: [], requests: REQUESTS, rules: RULES });
    const sheet = m.sheet();
    expect(sheet).toHaveAccessibleName('Nothing in the inbox');
    expect(visibleTitle(sheet)).toBe('Nothing in the inbox');
    expect(within(sheet).getByText('Add something to the inbox to start a tidy-up here.', { exact: true })).toBeVisible();
    expect(within(m.row('Requests')).getByText('2 requests', { exact: true })).toBeVisible();
    expect(within(m.row('Pending rules')).getByText('1 pending rule', { exact: true })).toBeVisible();
    expect(within(sheet).queryByText('Nothing to tidy')).toBeNull();
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
    expect(m.start).not.toHaveBeenCalled();
  });
});

describe('unresolved_journal_read_never_claims_no_other_work', () => {
  it.each([
    { reading: 'Requests', loading: 'Checking requests…', other: 'Pending rules', count: '1 pending rule', requests: 'never', rules: RULES },
    { reading: 'Pending rules', loading: 'Checking pending rules…', other: 'Requests', count: '2 requests', requests: REQUESTS, rules: 'never' },
  ] as const)('$reading loading while the other resolves: says it is checking, never a count, and Start stays', async (c) => {
    const m = await mount({ requests: c.requests === 'never' ? 'never' : [...c.requests], rules: c.rules === 'never' ? 'never' : [...c.rules] });
    expect(within(m.row(c.reading)).getByText(c.loading, { exact: true })).toBeVisible();
    expect(m.row(c.reading)).not.toHaveTextContent(/\d/);
    expect(within(m.row(c.other)).getByText(c.count, { exact: true })).toBeVisible();
    const start = within(m.sheet()).getByRole('button', { name: START });
    expect(start).not.toHaveAttribute('aria-disabled');
    fireEvent.click(start);
    expect(m.start).toHaveBeenCalledOnce();
  });

  it.each([
    { failing: 'Requests', failed: 'Requests could not be checked', message: REQUESTS_FAILED, other: 'Pending rules', count: '1 pending rule' },
    { failing: 'Pending rules', failed: 'Pending rules could not be checked', message: RULES_FAILED, other: 'Requests', count: '2 requests' },
  ] as const)('$failing failing alone: names the category with its retry; the other stays usable', async (c) => {
    const m = await mount(c.failing === 'Requests'
      ? { requests: new BowerError('unknown', REQUESTS_FAILED), rules: RULES }
      : { requests: REQUESTS, rules: new BowerError('unknown', RULES_FAILED) });
    expect(within(m.row(c.failing)).getByText(c.failed, { exact: true })).toBeVisible();
    expect(m.row(c.failing)).not.toHaveTextContent(/\d/);
    const group = m.failure(c.failing);
    expect(group).not.toBeNull();
    if (!group) return;
    expect(within(group).getByRole('alert')).toHaveTextContent(c.message);
    expect(within(group).getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(m.failure(c.other)).toBeNull();
    expect(within(m.row(c.other)).getByText(c.count, { exact: true })).toBeVisible();
    expect(within(m.sheet()).getByRole('button', { name: START })).not.toHaveAttribute('aria-disabled');
  });

  it.each([
    { label: 'Requests', before: 'empty', shown: '0 requests', failed: 'Requests could not be checked', after: '1 request' },
    { label: 'Requests', before: 'populated', shown: '2 requests', failed: 'Requests could not be checked', after: '1 request' },
    { label: 'Pending rules', before: 'empty', shown: '0 pending rules', failed: 'Pending rules could not be checked', after: '1 pending rule' },
    { label: 'Pending rules', before: 'populated', shown: '1 pending rule', failed: 'Pending rules could not be checked', after: '1 pending rule' },
  ] as const)('$label refresh failing after a $before read: the old count is not shown as current; retry brings the current one back', async (c) => {
    const requests = c.label === 'Requests';
    const m = await mount({ requests: requests && c.before === 'empty' ? [] : REQUESTS, rules: !requests && c.before === 'empty' ? [] : RULES });
    expect(within(m.row(c.label)).getByText(c.shown, { exact: true })).toBeVisible();
    const error = new BowerError('unknown', requests ? REQUESTS_FAILED : RULES_FAILED);
    if (requests) m.state.requests = error; else m.state.rules = error;
    await m.emit();
    expect(within(m.row(c.label)).queryByText(c.shown, { exact: true })).toBeNull();
    expect(m.row(c.label)).not.toHaveTextContent(/\d/);
    expect(within(m.row(c.label)).getByText(c.failed, { exact: true })).toBeVisible();
    const group = m.failure(c.label);
    expect(group).not.toBeNull();
    if (!group) return;
    if (requests) m.state.requests = [request('r-9'), request('r-8', 'Done.')]; else m.state.rules = [rule('u-9', true), rule('u-8', false)];
    fireEvent.click(within(group).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(m.failure(c.label)).toBeNull();
    expect(within(m.sheet()).queryByRole('alert')).toBeNull();
    expect(within(m.row(c.label)).getByText(c.after, { exact: true })).toBeVisible();
  });

  it('an empty inbox with unresolved reads says so per category and starts nothing', async () => {
    const m = await mount({ piles: [], requests: 'never', rules: new BowerError('unknown', RULES_FAILED) });
    const sheet = m.sheet();
    expect(sheet).toHaveAccessibleName('Nothing in the inbox');
    expect(within(sheet).getByText('Add something to the inbox to start a tidy-up here.', { exact: true })).toBeVisible();
    expect(within(m.row('Requests')).getByText('Checking requests…', { exact: true })).toBeVisible();
    expect(within(m.row('Pending rules')).getByText('Pending rules could not be checked', { exact: true })).toBeVisible();
    expect(m.failure('Pending rules')).not.toBeNull();
    expect(within(sheet).queryByRole('button', { name: /tidy up/i })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeVisible();
    expect(m.start).not.toHaveBeenCalled();
  });
});
