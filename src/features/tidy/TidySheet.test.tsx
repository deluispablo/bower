import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Question, type RunState } from '@/data/types';
import type { QuestionAnswer } from '@/data/contracts/questions';
import { loadingSources } from '@/testing/loading-sources';
import { useUi } from '@/app/ui-store';
import { usePrefs } from '@/app/prefs';
import { Home } from '@/features/home/Home';
import { Dock } from '@/ui/Dock';
import { useToasts } from '@/ui/toast';
import { TidySheet } from './TidySheet';

const AT = 1_800_000_000_000;
const going: RunState = { id: 'questions-run', scope: 'all', phase: 'reading', requestedAt: AT, phaseAt: AT + 100,
  total: 1, seen: false };
const options = [{ id: 'home-folder', label: 'Areas / Home' }, { id: 'garden-folder', label: 'Projects / Garden' }];
const ask = (extra: Partial<Question> = {}): Question => ({ id: 'q-ask-paper', subject: 'paper',
  text: 'Where should these papers go?', yes: 'File them', no: 'Leave them', askedAt: AT, ...extra });
async function settle(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
function Place() { return <output data-testid="route">{useLocation().pathname}</output>; }

// Existing public ports only: storage/subscriptions drive both cards; no mock of Questions or answerQuestion.
async function fixture(qs: Question[], opts: { run?: RunState; withHome?: boolean; fails?: boolean; initialPath?: string; startGate?: Promise<void> } = {}) {
  const base = loadingSources();
  let open = [...qs];
  let current = opts.run ?? going;
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((cb) => cb());
  const answer = vi.fn(async (id: string, _value: QuestionAnswer) => {
    if (opts.fails) throw new BowerError('offline', 'That answer did not save. Try again.');
    open = open.filter((q) => q.id !== id); notify();
  });
  const start = vi.fn(async () => {
    await opts.startGate;
    return { ...current, ...(current.phase !== 'done' ? { waits: true as const } : {}) };
  });
  const methods: Record<string, unknown> = { questions: async () => open, tree: async () => [],
    piles: async () => [], pilesListed: async () => null, changes: async () => [], suggestions: async () => [],
    uploadNotice: async () => null, answer,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in methods ? methods[key] : Reflect.get(target, key) });
  const sources: Sources = { ...base, vault,
    session: { ...base.session, current: async () => ({ name: 'Alex', email: 'you@example.com' }) },
    runs: { ...base.runs, start, current: async () => current, markSeen: vi.fn(async () => undefined),
      subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); } } };
  render(<MemoryRouter initialEntries={[opts.initialPath ?? '/']}><DataProvider sources={sources}>
    <Routes><Route path="*" element={<><Place />{opts.withHome && <main id="main" tabIndex={-1}><Home /></main>}</>} /></Routes>
    <TidySheet /><Dock />
  </DataProvider></MemoryRouter>);
  await settle();
  // Positive control for every sheet red: the original run still renders its clock and title.
  const sheet = screen.getByRole('dialog');
  expect(sheet).toHaveAccessibleName(current.phase === 'done' ? /^Done\. 0 things filed[.,]/ : 'Reading 1 thing');
  expect(within(sheet).getByText(current.phase === 'done' ? /^Finished / : /^Started /)).toBeVisible();
  return { sheet, answer, start, finish: async () => {
    await act(async () => {
      current = { ...current, phase: 'done', phaseAt: AT + 5000, finishedAt: AT + 5000,
        report: { filed: [], created: [], updated: [{ path: 'Areas/Home/Papers.md', what: 'Papers received' }], setAside: [], questions: open } };
      notify();
    });
    await settle();
  } };
}

function sheetCard(sheet: HTMLElement, text = 'Where should these papers go?'): HTMLElement {
  const li = within(sheet).getByText(text, { exact: true }).closest('li');
  if (!li) throw new Error('Question card missing');
  return li;
}

describe('Q1b tidy questions', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(AT + 1000);
    useUi.setState({ tidyOpen: true, tidyReportRunId: null });
    for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
  });
  afterEach(() => {
    cleanup();
    for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
    useUi.setState({ tidyOpen: false }); vi.useRealTimers(); vi.restoreAllMocks();
  });

  it('Q1b A question during the run, sheet open', async () => {
    const { sheet } = await fixture([ask()]);
    const steps = sheet.querySelector('ol');
    if (!steps) throw new Error('Run steps missing');
    expect(within(steps).getByText('Writing your notes')).toBeVisible();
    const label = within(sheet).getByText('Bower has a question', { exact: true });
    const card = sheetCard(sheet);
    expect(label.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sheet).queryByRole('link', { name: /more questions? on Home/ })).toBeNull();
  });

  it('Q1b An answer during the run', async () => {
    const { sheet, answer, start } = await fixture([ask()]);
    const button = within(sheetCard(sheet)).getByRole('button', { name: 'File them' });
    button.focus(); fireEvent.click(button); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', true);
    expect(start).toHaveBeenCalledOnce();
    expect(within(sheet).queryByText('Where should these papers go?')).toBeNull();
    expect(within(sheet).getByText('Writing your notes')).toBeVisible();
    const message = 'You chose "File them". Bower will do this as soon as the current tidy-up ends.';
    // TL-P4-55: messages-wait-for-sheets owns this Dock behavior; assert the signed observable outcome.
    expect(screen.queryByText(message)).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Hide this' })); await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it('Q1b The run ends with a question unanswered', async () => {
    const f = await fixture([ask()]);
    await f.finish();
    expect(f.sheet).toHaveAccessibleName('Done. 0 things filed, 1 note updated.');
    expect(within(f.sheet).getByRole('status')).toHaveTextContent('1 note brought up to date and 1 new question for you.');
    const links = within(f.sheet).getByRole('list', { name: 'Brought up to date' });
    expect(within(links).getByRole('link', { name: 'Papers' })).toHaveAttribute('href', '/note/Areas/Home/Papers.md');
    const card = sheetCard(f.sheet);
    expect(card.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'File them' })).toBeVisible();
  });

  it('Q1b The last card in the sheet answered', async () => {
    const { sheet, answer } = await fixture([ask()]);
    const button = within(sheetCard(sheet)).getByRole('button', { name: 'Leave them' });
    button.focus(); fireEvent.click(button); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', false);
    expect(within(sheet).queryByText('Where should these papers go?')).toBeNull();
    const title = within(sheet).getByRole('heading', { name: 'Reading 1 thing' });
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveFocus();
  });

  it('Q1b An answer in the sheet', async () => {
    const { sheet, answer } = await fixture([ask()], { withHome: true });
    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    expect(main?.textContent).toContain('Where should these papers go?');
    const button = within(sheetCard(sheet)).getByRole('button', { name: 'File them' });
    button.focus(); fireEvent.click(button); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', true);
    expect(sheet.textContent).not.toContain('Where should these papers go?');
    expect(main?.textContent).not.toContain('Where should these papers go?');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Hide this' })); await settle();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Hello, Alex");
    expect(screen.queryByText('Where should these papers go?')).toBeNull();
  });

  it('Q1b Run window includes askedAt at the start and orders stored questions by askedAt', async () => {
    const { sheet } = await fixture([ask({ id: 'q-ask-later', subject: 'later', text: 'Later in this run', askedAt: AT + 10 }),
      ask({ id: 'q-ask-old', subject: 'old', text: 'Before this run', askedAt: AT - 1 }), ask()]);
    expect(within(sheet).getByText('Writing your notes')).toBeVisible();
    expect(within(sheet).getByText('Where should these papers go?', { exact: true })).toBeVisible();
    expect(within(sheet).queryByText('Before this run')).toBeNull();
    expect(within(sheet).queryByText('Later in this run')).toBeNull();
    expect(within(sheet).getByRole('link', { name: '1 more question on Home' })).toBeVisible();
  });

  it('Q1b N more questions on Home counts this run and closes while navigating Home', async () => {
    const { sheet } = await fixture([ask(), ask({ id: 'q-ask-second', subject: 'second', text: 'Second asking', askedAt: AT + 1 }),
      ask({ id: 'q-ask-third', subject: 'third', text: 'Third asking', askedAt: AT + 2 }),
      ask({ id: 'q-ask-old', subject: 'old', text: 'Old asking', askedAt: AT - 1 })], { initialPath: '/pile/paper' });
    expect(screen.getByTestId('route')).toHaveTextContent('/pile/paper');
    fireEvent.click(within(sheet).getByRole('link', { name: '2 more questions on Home' })); await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('route')).toHaveTextContent(/^\/$/);
  });

  it('Q1b Sheet answer focuses the next earliest question', async () => {
    const { sheet, answer } = await fixture([ask(), ask({ id: 'q-ask-later', subject: 'later', text: 'Later asking', askedAt: AT + 2, yes: 'File later' }),
      ask({ id: 'q-ask-next', subject: 'next', text: 'Next asking', askedAt: AT + 1, yes: 'File next' })]);
    const button = within(sheetCard(sheet)).getByRole('button', { name: 'Leave them' });
    button.focus(); fireEvent.click(button); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', false);
    expect(within(sheet).getByRole('button', { name: 'File next' })).toHaveFocus();
    expect(within(sheet).queryByText('Later asking')).toBeNull();
    expect(within(sheet).getByRole('link', { name: '1 more question on Home' })).toBeVisible();
  });

  it.each([false, true])('Q1b Answer settles Radix removal focus after the continuation (next=%s)', async (hasNext) => {
    let release = (): void => { throw new Error('Continuation gate missing'); };
    const startGate = new Promise<void>((resolve) => { release = resolve; });
    const qs = [ask(), ...(hasNext ? [ask({ id: 'q-ask-next', subject: 'next', text: 'Next asking',
      askedAt: AT + 1, yes: 'File next' })] : [])];
    const { sheet, answer, start } = await fixture(qs, { startGate });
    const button = within(sheetCard(sheet)).getByRole('button', { name: 'File them' });
    button.focus(); fireEvent.click(button); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', true);
    expect(start).toHaveBeenCalledOnce();
    expect(within(sheet).queryByText('Where should these papers go?')).toBeNull();
    // Radix's removal observer focuses the dialog while the answer continuation is still pending.
    expect(sheet).toHaveFocus();
    release(); await settle();
    const target = hasNext ? within(sheet).getByRole('button', { name: 'File next' }) :
      within(sheet).getByRole('heading', { name: 'Reading 1 thing' });
    expect(target).toHaveFocus();
    expect(within(sheet).getByText('Writing your notes')).toBeVisible();
  });

  it('Q1b Sheet save failure retains the card and draft', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sheet, answer, start } = await fixture([ask({ options })], { fails: true });
    fireEvent.click(within(sheetCard(sheet)).getByRole('button', { name: 'Something else…' })); await settle();
    const field = within(sheet).getByRole('textbox', { name: 'In your own words' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'Papers for Alex’s garden' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Tell Bower' })); await settle();
    expect(answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', { text: 'Papers for Alex’s garden' });
    expect(start).not.toHaveBeenCalled();
    expect(within(sheetCard(sheet)).getByRole('textbox', { name: 'In your own words' })).toHaveValue('Papers for Alex’s garden');
    expect(within(sheet).getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
  });

  it('Q1b Duplicate label ids across both cards', async () => {
    const q = ask({ options, shown: { lines: ['Papers arrived.'], md5: '0'.repeat(32) } });
    const { sheet } = await fixture([q, ask({ id: 'q-ask-second', subject: 'second', text: 'Other papers', options })], { withHome: true });
    const main = document.querySelector('main');
    if (!main) throw new Error('Home missing');
    expect(main.textContent).toContain('Papers arrived.');
    expect(within(sheetCard(sheet)).getByRole('list', { name: "Bower's update" })).toHaveTextContent('Papers arrived.');
    // Open both instances of the same asking, plus the other Home card, even while Home is aria-hidden.
    for (const b of within(main).getAllByRole('button', { name: 'Something else…', hidden: true })) fireEvent.click(b);
    fireEvent.click(within(sheetCard(sheet)).getByRole('button', { name: 'Something else…' })); await settle();
    const fields = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    expect(fields).toHaveLength(3);
    for (const field of fields) fireEvent.change(field, { target: { value: 'x'.repeat(1001) } });
    await settle();
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const field of fields) {
      expect(field.id).not.toBe('');
      const labels = [...document.querySelectorAll<HTMLLabelElement>('label')].filter((label) => label.htmlFor === field.id);
      expect(labels).toHaveLength(1);
      expect(labels[0]).toHaveTextContent('In your own words');
      const described = field.getAttribute('aria-describedby')?.split(' ') ?? [];
      expect(described.length).toBeGreaterThan(0);
      for (const id of described) expect(document.getElementById(id)).toHaveTextContent('Use 1,000 characters at most.');
    }
  });
});

// design-tidy-report: the running sheet's button says what it does, and a line says how the end will be told,
// truthfully for this device: in the app, plus a notification only when the person turned them on and the browser allows.
describe('design-tidy-report: hiding the running sheet', () => {
  const OFF = 'Bower tells you here when it ends.';
  const ON = 'Bower tells you here when it ends, or with a notification if you are in another app.';
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(AT + 1000);
    useUi.setState({ tidyOpen: true, tidyReportRunId: null });
  });
  afterEach(() => {
    cleanup();
    usePrefs.setState({ notifyRuns: false });
    useUi.setState({ tidyOpen: false }); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  });

  it('AC2 progress-hide-this: "Hide this", with the line saying the end shows here', async () => {
    const { sheet } = await fixture([]);
    expect(within(sheet).queryByRole('button', { name: 'Hide this' }), 'a button "Hide this"').not.toBeNull();
    expect(within(sheet).queryByRole('button', { name: /Tell me when it ends/ })).toBeNull();
    expect(within(sheet).queryByText(OFF, { exact: true })).not.toBeNull();
    expect(within(sheet).queryByText(ON, { exact: true })).toBeNull();
  });

  it('AC2 progress-hide-notified: with notifications on and allowed, the line adds the notification', async () => {
    usePrefs.setState({ notifyRuns: true });
    vi.stubGlobal('Notification', { permission: 'granted' });
    const { sheet } = await fixture([]);
    expect(within(sheet).queryByText(ON, { exact: true })).not.toBeNull();
    cleanup();
    // Turned on in Bower but blocked in the browser: no notification can come, so none is promised.
    vi.stubGlobal('Notification', { permission: 'denied' });
    const again = await fixture([]);
    expect(within(again.sheet).queryByText(OFF, { exact: true })).not.toBeNull();
  });

  it('R7 progress-hide-done: a finished run shows no hide line', async () => {
    const done: RunState = { ...going, phase: 'done', phaseAt: AT + 500, finishedAt: AT + 500,
      report: { filed: [], created: [], updated: [{ path: 'Areas/Home/Papers.md', what: 'Papers received' }], setAside: [], questions: [] } };
    useUi.setState({ tidyReportRunId: done.id });
    const { sheet } = await fixture([], { run: done });
    expect(within(sheet).queryByText(OFF, { exact: true })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Done' })).toBeVisible();
  });
});
