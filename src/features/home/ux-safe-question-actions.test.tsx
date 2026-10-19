/**
 * ux-safe-question-actions: the yes/no answer that leaves notes as they are is filled (primary), the other outlined
 * (ghost), on Home and in the tidy sheet, through the one QuestionCard. Styling never changes what is sent or what runs
 * (rulings R3, R4, R6). Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DemoWorld } from '@/data/demo/world';
import { seedQuestions } from '@/data/demo/fixture';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Question, RunState } from '@/data/types';
import type { QuestionAnswer } from '@/data/contracts/questions';
import { TidySheet } from '@/features/tidy/TidySheet';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { Home } from './Home';

const AT = 1_800_000_000_000;
const DAY = 86_400_000;
const worlds: DemoWorld[] = [];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT + 1000); });
afterEach(() => {
  cleanup();
  worlds.splice(0).forEach((w) => w.dispose());
  for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
  useUi.setState({ tidyOpen: false, tidyReportRunId: null });
  vi.useRealTimers(); vi.restoreAllMocks();
});

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0); });

function cardOf(within_: HTMLElement | Document, text: RegExp): HTMLElement {
  const li = within(within_ as HTMLElement).getByText(text).closest('li');
  if (!li) throw new Error(`no card for ${String(text)}`);
  return li;
}
const filled = (card: HTMLElement) => [...card.querySelectorAll('button.primary')].map((b) => b.textContent);

function expectFill(card: HTMLElement, primary: string, ghost: string): void {
  expect(within(card).getByRole('button', { name: primary })).toHaveClass('primary');
  expect(within(card).getByRole('button', { name: ghost })).toHaveClass('ghost');
  expect(within(card).getByRole('button', { name: ghost })).not.toHaveClass('primary');
}

async function demoHome(): Promise<Sources> {
  const w = new DemoWorld({ scenario: 'default', scale: 'instant', latency: 0 });
  worlds.push(w);
  const sources = w.sources();
  render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>);
  await settle();
  return sources;
}

/** A short harness of its own over loadingSources: the questions, an answer that closes them, a run start. */
async function mount(qs: Question[], run: RunState | null = null, sheet = false) {
  const base = loadingSources();
  let open = [...qs];
  const listeners = new Set<() => void>();
  const answer = vi.fn(async (id: string, _value: QuestionAnswer) => {
    open = open.filter((q) => q.id !== id); listeners.forEach((cb) => cb());
  });
  const start = vi.fn(async () => ({ id: 'answer-run', scope: 'instructions', phase: 'queued', requestedAt: AT, phaseAt: AT, seen: false }) as RunState);
  const methods: Record<string, unknown> = { questions: async () => open, tree: async () => [], piles: async () => [],
    pilesListed: async () => null, changes: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    answer, subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); } };
  const vault = new Proxy(base.vault, { get: (t, k) => typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k) });
  const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => run, start, markSeen: async () => undefined } };
  if (sheet) useUi.setState({ tidyOpen: true, tidyReportRunId: null });
  render(<MemoryRouter><DataProvider sources={sources}>{sheet ? <TidySheet /> : <main id="main" tabIndex={-1}><Home /></main>}</DataProvider></MemoryRouter>);
  await settle();
  return { answer, start };
}

const reading: RunState = { id: 'reading-run', scope: 'all', phase: 'reading', requestedAt: AT, phaseAt: AT + 100, total: 1, seen: false };
const pair: Question = { id: 'q-pair-flat-a.flat-b', text: 'Flat A and Flat B look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: AT };

describe('ux-safe-question-actions: the answer that keeps notes is filled', () => {
  it('AC1 home_fixture_fill', async () => {
    await demoHome();
    expectFill(cardOf(document, /Keep one note for both\?/), 'No, keep both', 'Yes, merge');
    expectFill(cardOf(document, /paid twice/), 'Keep both', 'Keep one');
  });

  it('AC1 sheet_fixture_fill', async () => {
    await mount(seedQuestions(AT + 2 * DAY), reading, true);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Bower has a question', { exact: true })).toBeVisible();
    expectFill(cardOf(sheet, /Keep one note for both\?/), 'No, keep both', 'Yes, merge');
    cleanup();
    await mount(seedQuestions(AT + 2 * DAY).slice(1), reading, true);
    expectFill(cardOf(screen.getByRole('dialog'), /paid twice/), 'Keep both', 'Keep one');
  });

  it('AC2 fixture_values', async () => {
    const sources = await demoHome();
    const answer = vi.spyOn(sources.vault, 'answer');
    const start = vi.spyOn(sources.runs, 'start');
    const q1 = cardOf(document, /Keep one note for both\?/);
    expect(filled(q1)).toEqual(['No, keep both']);
    fireEvent.click(within(q1).getByRole('button', { name: 'No, keep both' }));
    await settle();
    expect(answer).toHaveBeenCalledWith('q1', false);
    const q2 = cardOf(document, /paid twice/);
    expect(filled(q2)).toEqual(['Keep both']);
    fireEvent.click(within(q2).getByRole('button', { name: 'Keep both' }));
    await settle();
    expect(answer).toHaveBeenCalledWith('q2', true);
    expect(start).not.toHaveBeenCalled();
  });

  it('AC2 pair_values', async () => {
    const first = await mount([pair]);
    const card = cardOf(document, /Keep one note\?/);
    expect(filled(card)).toEqual(['No, keep both']);
    fireEvent.click(within(card).getByRole('button', { name: 'No, keep both' }));
    await settle();
    expect(first.answer).toHaveBeenCalledWith(pair.id, false);
    expect(first.start).not.toHaveBeenCalled();
    cleanup();
    const second = await mount([pair]);
    const again = cardOf(document, /Keep one note\?/);
    expect(within(again).getByRole('button', { name: 'Yes, keep one' })).toHaveClass('ghost');
    fireEvent.click(within(again).getByRole('button', { name: 'Yes, keep one' }));
    await settle();
    expect(second.answer).toHaveBeenCalledWith(pair.id, true);
    expect(second.start).toHaveBeenCalledTimes(1);
    expect(second.start).toHaveBeenCalledWith('instructions', expect.objectContaining({ answer: true }));
  });

  it('AC2 choice_and_words_unchanged', async () => {
    const options = [{ id: 'home-folder', label: 'Areas / Home' }, { id: 'garden-folder', label: 'Projects / Garden' }];
    const choice = (id: string, subject: string, text: string): Question => ({ id, subject, text, yes: 'File them', no: 'Leave them', askedAt: AT, options });
    const { answer } = await mount([choice('q-ask-paper', 'paper', 'Where should these papers go?'), choice('q-ask-scan', 'scan', 'Where should this scan go?')]);
    const paper = cardOf(document, /these papers/);
    const scan = cardOf(document, /this scan/);
    expect(filled(paper)).toEqual([]);
    expect(filled(scan)).toEqual([]);
    fireEvent.click(within(paper).getByRole('button', { name: 'Areas / Home' }));
    await settle();
    expect(answer).toHaveBeenCalledWith('q-ask-paper', { option: 'home-folder' });
    fireEvent.click(within(scan).getByRole('button', { name: 'Something else…' }));
    await settle();
    fireEvent.change(within(scan).getByRole('textbox', { name: 'In your own words' }), { target: { value: 'Garden papers' } });
    fireEvent.click(within(scan).getByRole('button', { name: 'Tell Bower' }));
    await settle();
    expect(answer).toHaveBeenCalledWith('q-ask-scan', { text: 'Garden papers' });
  });
});
