/**
 * ux-home-priorities: Home puts decisions first (run card, checklist, questions, Inbox), shows the two newest piles
 * with one disclosure button, and the desktop footer is a button only while a run or its report needs it (rulings
 * R3, R7, R8, R2-4, R4-2). Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { SET_ASIDE_TEXT } from '@/data/pile-readiness';
import type { Pile, Question, RunReport, RunState, TreeNode } from '@/data/types';
import { StatusBar } from '@/features/tidy/StatusBar';
import { runTitle } from '@/features/tidy/run-words';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

const thing = (id: string, extra: Partial<Pile['items'][number]> = {}): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer', ...extra });
/** Newest first, as every source gives them (R4-2). */
const piles = (n: number): Pile[] => Array.from({ length: n }, (_, i) => ({
  id: `p${n - i}`, path: `Inbox/Pile ${n - i}`, text: `Pile ${n - i}`, createdAt: 10_000 - i * 100, items: [thing(`t${n - i}`)],
}));
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const run = (extra: Partial<RunState>): RunState => ({ id: 'r1', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 2000, seen: false, ...extra });

function mount(opts: { piles?: Pile[]; run?: RunState | null; doors?: Record<string, unknown>; footer?: boolean }) {
  const base = loadingSources();
  let current = opts.piles ?? [];
  const listeners = new Set<() => void>();
  const doors: Record<string, unknown> = {
    piles: async () => current, pilesListed: async () => null, tree: async () => [], changes: async () => [],
    questions: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    ...opts.doors,
  };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in doors ? doors[key] : Reflect.get(target, key) }) as Sources['vault'];
  const sources = { ...base, vault, runs: { ...base.runs, current: async () => opts.run ?? null } };
  const view = render(<MemoryRouter><DataProvider sources={sources}>
    {opts.footer ? <StatusBar /> : <main id="main" tabIndex={-1}><Home /></main>}
  </DataProvider></MemoryRouter>);
  const set = (next: Pile[]) => { current = next; listeners.forEach((cb) => cb()); };
  return { view, set };
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const follows = (a: Node, b: Node) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
const inbox = () => screen.getByRole('region', { name: 'Inbox' });
const pileLinks = () => within(inbox()).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/pile/'));
const hrefs = () => pileLinks().map((a) => a.getAttribute('href'));
const more = () => within(inbox()).getByRole('button', { name: /^and \d+ more$|^Show fewer$/ });

describe('ux-home-priorities AC1: decisions first', () => {
  it('AC1 side_order: the Inbox, then the change journal, search, Recent and Suggestions', async () => {
    const question: Question = { id: 'q1', text: 'Is this the car insurance?', yes: 'Yes', no: 'No', askedAt: 500 };
    const tree: TreeNode[] = [{ path: 'Areas', name: 'Areas', type: 'folder', modified: 1, created: 1, children: [
      { path: 'Areas/Car', name: 'Car', type: 'folder', modified: 1, created: 1, children: [
        { path: 'Areas/Car/Policy.md', name: 'Policy.md', type: 'file', modified: 2, created: 1 }] }] }];
    mount({ piles: piles(1), doors: {
      questions: async () => [question], tree: async () => tree,
      changes: async () => [{ id: 'c1', at: 1, kind: 'rename', what: 'Renamed Policy draft to Policy' }],
      firstTidy: async () => ({ added: true, started: true, reviewed: true }),
      suggestions: async () => [{ id: 's1', title: 'Keep car papers together', why: 'They arrive often.' }],
    } });
    await settle();
    const order = [
      inbox(),
      screen.getByRole('region', { name: 'Since the last tidy-up' }),
      screen.getByRole('button', { name: /Search your notes and files/ }),
      screen.getByRole('region', { name: 'Recent' }),
      screen.getByRole('region', { name: 'Bower suggests' }),
    ];
    for (let i = 1; i < order.length; i++) follows(order[i - 1] as Node, order[i] as Node);
  });

  it('AC1 run_card_first: a running tidy-up comes before the checklist', async () => {
    const reading = run({ phase: 'reading' });
    mount({ run: reading, doors: { firstTidy: async () => ({ added: true, started: true, reviewed: false }) } });
    await settle();
    follows(screen.getByText(runTitle(reading)), screen.getByRole('region', { name: 'Your first tidy-up' }));
  });

  it('AC1 stopped_after_inbox (guard): the stopped card stays after the Inbox', async () => {
    mount({ piles: piles(1), run: run({ phase: 'failed', seen: false, failure: 'Drive did not answer.' }) });
    await settle();
    follows(inbox(), screen.getByRole('heading', { name: 'The tidy-up stopped', level: 2 }));
  });
});

describe('ux-home-priorities AC2: the two newest piles', () => {
  it('AC2 two_piles_no_disclosure: two piles, no disclosure', async () => {
    mount({ piles: piles(2) });
    await settle();
    expect(pileLinks()).toHaveLength(2);
    expect(within(inbox()).queryByRole('button', { name: /^and \d+ more$/ })).toBeNull();
    expect(within(inbox()).queryByRole('button', { name: 'Show fewer' })).toBeNull();
  });

  it('AC2 three_piles_one_more: the two newest and "and 1 more"', async () => {
    mount({ piles: piles(3) });
    await settle();
    expect(hrefs()).toEqual(['/pile/p3', '/pile/p2']);
    const button = within(inbox()).getByRole('button', { name: 'and 1 more' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC2 expand_shows_all_and_warnings: expanded, every pile and its warnings', async () => {
    const list = piles(4);
    list[3] = { ...(list[3] as Pile), question: 'waiting' };
    list[2] = { ...(list[2] as Pile), setAside: 'changed', items: [thing('t2', { changed: true })] };
    mount({ piles: list });
    await settle();
    expect(screen.queryByText('Waiting for your answer')).toBeNull();
    expect(screen.queryByText(SET_ASIDE_TEXT.changed)).toBeNull();
    const button = more();
    button.focus();
    fireEvent.click(button);
    expect(pileLinks()).toHaveLength(4);
    expect(screen.getByText('Waiting for your answer')).toBeVisible();
    expect(screen.getByText(SET_ASIDE_TEXT.changed)).toBeVisible();
    expect(button).toHaveTextContent('Show fewer');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveFocus();
  });

  it('AC2 show_fewer_keeps_focus: Show fewer goes back to two and keeps focus', async () => {
    mount({ piles: piles(4) });
    await settle();
    const button = more();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Show fewer');
    button.focus();
    fireEvent.click(button);
    expect(pileLinks()).toHaveLength(2);
    expect(button).toHaveTextContent('and 2 more');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('AC2 removal_reveals_next: removing the newest shows the next one', async () => {
    const list = piles(4);
    const { set } = mount({ piles: list });
    await settle();
    expect(hrefs()).toEqual(['/pile/p4', '/pile/p3']);
    await act(async () => { set(list.slice(1)); for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(hrefs()).toEqual(['/pile/p3', '/pile/p2']);
    expect(more()).toHaveTextContent('and 1 more');
  });
});

describe('ux-home-priorities AC3: the footer is a button only for a run', () => {
  it('AC3 footer_plain_text: with no run, the footer says what waits as plain text', async () => {
    mount({ footer: true, piles: piles(2) });
    await settle();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryByRole('button')).toBeNull();
    expect(footer).toHaveTextContent('2 things waiting');
    cleanup();
    mount({ footer: true, piles: piles(1) });
    await settle();
    expect(within(screen.getByRole('contentinfo')).queryByRole('button')).toBeNull();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('1 thing waiting');
  });

  it.each([
    ['running', run({ phase: 'reading' })],
    ['stopped', run({ phase: 'failed', seen: false, failure: 'Drive did not answer.' })],
    ['replay', run({ finishedAt: 2000, report: { ...empty(), filed: [{ name: 'Policy.pdf', title: 'Policy', kind: 'pdf', to: 'Areas/Car' }] } })],
    ['report', run({ scope: 'instructions', finishedAt: 2000, report: { ...empty(), leftAsWritten: [{ name: 'Areas/Car/Policy.md', fileId: 'policy', why: 'Nothing new about it.' }] } })],
  ] as const)('AC3 footer_button_states (guard): %s keeps one footer button', async (_name, r) => {
    mount({ footer: true, piles: piles(2), run: r });
    await settle();
    expect(within(screen.getByRole('contentinfo')).getAllByRole('button')).toHaveLength(1);
  });
});
