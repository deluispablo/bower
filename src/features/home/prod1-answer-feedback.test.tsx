import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError, type Question } from '@/data/types';
import type { QuestionAnswer } from '@/data/contracts/questions';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Toasts, useToasts } from '@/ui/toast';
import { answeredNow } from './answer-words';
import { Home } from './Home';

const PENDING = 'Saving your answer…';
const TEXT = 'Where should these papers go?';
const question: Question = { id: 'q-ask-paper', subject: 'paper', text: TEXT, yes: 'File them', no: 'Leave them', askedAt: 1_800_000_000_000 };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  useUi.setState({ tidyOpen: false });
});
afterEach(() => {
  cleanup();
  useToasts.setState({ list: [] });
  vi.restoreAllMocks();
});

function later() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await act(async () => undefined); };
const texts = (): string[] => useToasts.getState().list.map((t) => t.text);
const status = (): HTMLElement => within(screen.getByTestId('toasts')).getByRole('status');
const card = (): HTMLElement => {
  const li = screen.getByText(TEXT, { exact: true }).closest('li');
  if (!li) throw new Error('Question card missing');
  return li;
};

async function home(write: Promise<void>) {
  const base = loadingSources();
  let open = [question];
  const listeners = new Set<() => void>();
  const answer = vi.fn(async (id: string, _value: QuestionAnswer) => {
    await write;
    open = open.filter((q) => q.id !== id);
    listeners.forEach((cb) => cb());
  });
  const start = vi.fn(async () => ({ id: 'answer-run', scope: 'all' as const, phase: 'queued' as const, requestedAt: 0, phaseAt: 0, seen: false }));
  const methods: Record<string, unknown> = {
    questions: async () => open, piles: async () => [], pilesListed: async () => null,
    tree: async () => [], changes: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    answer, subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in methods ? methods[key] : Reflect.get(target, key) });
  render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null, start } }}>
    <main id="main" tabIndex={-1}><Home /></main><div data-testid="toasts"><Toasts /></div>
  </DataProvider></MemoryRouter>);
  await flush();
  // Positive control: the question is on Home through the real data hooks.
  expect(screen.getByText(TEXT, { exact: true })).toBeVisible();
  return { answer };
}

it('held_answer_announces_saving', async () => {
  const write = later();
  const f = await home(write.promise);

  fireEvent.click(within(card()).getByRole('button', { name: 'File them' }));
  // Announced in the same task as the press, before Drive answers.
  expect(status()).toHaveTextContent(PENDING);
  await flush();
  fireEvent.click(within(card()).getByRole('button', { name: 'File them' }));
  await flush();
  expect(f.answer).toHaveBeenCalledOnce();
  expect(texts()).toEqual([PENDING]);

  await act(async () => write.resolve());
  await vi.waitFor(() => expect(texts()).toEqual([answeredNow('File them')]));
  expect(status()).not.toHaveTextContent(PENDING);
});

it('answer_failure_restores_actions', async () => {
  const write = later();
  await home(write.promise);

  fireEvent.click(within(card()).getByRole('button', { name: 'File them' }));
  expect(status()).toHaveTextContent(PENDING);
  const failure = new BowerError('offline', 'Bower could not reach Drive. Try again.');
  await act(async () => write.reject(failure));
  await vi.waitFor(() => expect(texts()).toEqual([failure.message]));
  expect(logged).toHaveBeenCalledWith(failure);
  expect(status()).not.toHaveTextContent(PENDING);
  // The question stays, and its answers can be pressed again.
  expect(within(card()).getByRole('button', { name: 'File them' })).toBeEnabled();
  expect(within(card()).getByRole('button', { name: 'Leave them' })).toBeEnabled();
});
