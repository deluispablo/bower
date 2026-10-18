import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { Home } from './Home';

type Summary = { count: number; complete: boolean };

const unknown = "Bower couldn't check that everything you added arrived.";
const atLeast2 = "At least 2 piles didn't finish arriving. Add them again if you still need them.";
const waiting = '1 thing waiting. Tidy up when you have added everything.';
const pile: Pile = { id: 'RETRY_PILE', text: 'Papers from Alex', createdAt: 1, items: [{ id: 'RETRY_MEMBER', name: 'scan.pdf', kind: 'pdf', origin: 'From this computer' }] };

afterEach(() => {
  cleanup();
  for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
  vi.restoreAllMocks();
});

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** The `show()` Proxy of Home.test.tsx, with `refresh` and `subscribe` doors. */
function show(answers: Array<() => Promise<Summary>>, refresh: () => Promise<void> = async () => undefined) {
  const base = loadingSources();
  let n = 0;
  const orphanSummary = vi.fn(() => (answers[Math.min(n++, answers.length - 1)] as () => Promise<Summary>)());
  const refreshDoor = vi.fn(refresh);
  const doors: Record<string, unknown> = {
    orphanSummary, refresh: refreshDoor, subscribe: () => () => undefined,
    piles: async () => [pile], pilesListed: async () => [pile], uploadNotice: async () => null,
    questions: async () => [], changes: async () => [], suggestions: async () => [],
  };
  const vault = new Proxy({}, { get: (_t, k) => typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k) }) as Sources['vault'];
  render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Home /></DataProvider></MemoryRouter>);
  return { orphanSummary, refresh: refreshDoor };
}

const inbox = () => screen.getByRole('region', { name: 'Inbox' });
const checkAgain = () => within(inbox()).queryByRole('button', { name: 'Check again' });

/** The button is visible, enabled, and a sibling of the sentence, never inside it. */
function offered(sentence: string) {
  const line = screen.getByText(sentence, { exact: true });
  const button = checkAgain();
  expect(button).not.toBeNull();
  expect(button).toBeVisible();
  expect(button).toBeEnabled();
  expect(line.contains(button)).toBe(false);
  expect(line.querySelector('a, button')).toBeNull();
  return button as HTMLElement;
}

describe('arrival_notice_exposes_retry_and_clears_on_proof', () => {
  it('(i) an unknown check offers Check again', async () => {
    show([async () => ({ count: 0, complete: false })]);
    await settle();
    offered(unknown);
  });

  it('(ii) a partial count offers Check again', async () => {
    show([async () => ({ count: 2, complete: false })]);
    await settle();
    offered(atLeast2);
  });

  it('(iii) a failed check says it is unknown and offers Check again', async () => {
    show([async () => { throw new BowerError('offline', 'You are offline.'); }]);
    await settle();
    offered(unknown);
  });

  it.each([{ count: 0, complete: true }, { count: 2, complete: true }])('(iv) a complete answer has no Check again (%o)', async (value) => {
    show([async () => value]);
    await settle();
    expect(screen.getByText(waiting)).toBeVisible();
    expect(checkAgain()).toBeNull();
  });

  it('(v) a confirmed zero clears the notice; the sentence holds while checking', async () => {
    const refreshing = held<undefined>();
    const answer = held<Summary>();
    const { orphanSummary, refresh } = show([async () => ({ count: 0, complete: false }), () => answer.promise], () => refreshing.promise);
    await settle();
    expect(screen.getByText(waiting)).toBeVisible();
    fireEvent.click(offered(unknown));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(checkAgain()).toBeDisabled();
    expect(screen.getByText(unknown)).toBeVisible();
    await act(async () => { refreshing.resolve(undefined); });
    expect(orphanSummary).toHaveBeenCalledTimes(2);
    expect(checkAgain()).toBeDisabled();
    expect(screen.getByText(unknown)).toBeVisible();
    await act(async () => { answer.resolve({ count: 0, complete: true }); });
    await settle();
    expect(screen.queryByText(unknown)).toBeNull();
    expect(within(inbox()).queryByText(/finish arriving|couldn't check that/)).toBeNull();
    expect(checkAgain()).toBeNull();
    expect(screen.getByText(waiting)).toBeVisible();
  });

  it('(vi) a refused refresh keeps the sentence, reports once and enables the button again', async () => {
    const refreshing = held<undefined>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    show([async () => ({ count: 0, complete: false })], () => refreshing.promise);
    await settle();
    fireEvent.click(offered(unknown));
    await settle();
    expect(checkAgain()).toBeDisabled();
    const failure = new BowerError('offline', 'You are offline.');
    await act(async () => { refreshing.reject(failure); });
    await settle();
    expect(screen.getByText(unknown)).toBeVisible();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(failure);
    expect(checkAgain()).toBeEnabled();
  });

  it('(vii) a check that is still unknown keeps the honest sentence throughout', async () => {
    const refreshing = held<undefined>();
    const answer = held<Summary>();
    show([async () => ({ count: 0, complete: false }), () => answer.promise], () => refreshing.promise);
    await settle();
    fireEvent.click(offered(unknown));
    expect(screen.getByText(unknown)).toBeVisible();
    await settle();
    expect(screen.getByText(unknown)).toBeVisible();
    await act(async () => { refreshing.resolve(undefined); });
    expect(screen.getByText(unknown)).toBeVisible();
    await act(async () => { answer.resolve({ count: 0, complete: false }); });
    expect(screen.getByText(unknown)).toBeVisible();
    await settle();
    expect(screen.getByText(unknown)).toBeVisible();
    offered(unknown);
  });
});
