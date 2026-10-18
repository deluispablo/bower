import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { requestQuestionId } from '@/data/contracts/questions';
import { BowerError, type Question, type Request, type RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { BowerScreen } from './BowerScreen';

/**
 * qa-live-claude-F3 (plan-F3-remove-r2.md, F3R-7..F3R-9, F3R-12): a waiting request has Remove, with Undo. The
 * reads are held by the test, as in qa2-F5; `removeRequest` and `undo` resolve at once and tell the listeners.
 */
const REMOVED = 'Request removed. Bower will not do it.';
const BACK = 'The request is back.';
const WORDS = 'Put my visa papers together';
const OTHER = 'Sort the garden photos';
const waiting = (id: string, text = WORDS): Request => ({ id, text, at: Date.UTC(2026, 9, 3) });
const finished = (id: string, text = OTHER): Request => ({ id, text, at: Date.UTC(2026, 9, 2), done: 'Filed it.' });
const question = (id: string): Question => ({ id, text: 'Which year?', yes: 'This one', no: 'Another', askedAt: 1 });
const idle = null;
const going: RunState = { id: 'run-1', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 1, seen: false };

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let listeners: Array<() => void> = [];
let runListeners: Array<() => void> = [];
let reads: Array<Deferred<Request[]>> = [];
let removeRequest: (id: string) => Promise<() => Promise<void>> = async () => async () => undefined;
let questionsRead: () => Promise<Question[]> = async () => [];
let runRead: () => Promise<RunState | null> = async () => idle;
const tell = (): void => listeners.slice().forEach((l) => l());

const sources = (initial: Request[]) => {
  const base = loadingSources();
  let first = true;
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; };
      if (k === 'requests') return async () => {
        if (first) { first = false; return initial; }
        const d = deferred<Request[]>();
        reads.push(d);
        return d.promise;
      };
      if (k === 'rules') return async () => [];
      if (k === 'rulesProse') return undefined;
      if (k === 'questions') return () => questionsRead();
      if (k === 'failedChanges') return async () => [];
      if (k === 'removeRequest') return (id: string) => removeRequest(id);
      return () => new Promise(() => undefined);
    },
  });
  const runs = { ...base.runs, current: () => runRead(), subscribe: (cb: () => void) => { runListeners.push(cb); return () => { runListeners = runListeners.filter((l) => l !== cb); }; } };
  return { ...base, vault: vault as typeof base.vault, runs };
};
const tree = (src: ReturnType<typeof sources>, show = true) => (
  <MemoryRouter><DataProvider sources={src}>{show && <BowerScreen />}</DataProvider></MemoryRouter>
);
const texts = (): string[] => useToasts.getState().list.map((t) => t.text);
const row = (words = WORDS): HTMLElement | null => screen.queryByText(words)?.closest('div') ?? null;
const removeButton = (words: string) => screen.queryByRole('button', { name: `Remove the request: ${words}` });
const press = async (words = WORDS): Promise<void> => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Remove the request: ${words}` })); }); };
const pressUndo = async (): Promise<void> => {
  const t = useToasts.getState().list.find((x) => x.text === REMOVED);
  if (!t) throw new Error('no remove toast');
  await act(async () => { useToasts.getState().press(t.id); });
};
const release = async (i: number, list: Request[]): Promise<void> => { await act(async () => { reads[i]?.resolve(list); }); await flush(); };
const start = async (initial: Request[] = [waiting('R1'), finished('D1')]) => {
  const src = sources(initial);
  const view = render(tree(src));
  await flush();
  return { src, view };
};

beforeEach(() => {
  listeners = [];
  runListeners = [];
  reads = [];
  useToasts.setState({ list: [] });
  removeRequest = async () => { tell(); return async () => { tell(); }; };
  questionsRead = async () => [];
  runRead = async () => idle;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('F3 remove: a waiting request has Remove, with Undo', () => {
  it('F3-12 remove-waiting: Remove on the waiting request only; the toasts wait for the list', async () => {
    const calls = vi.fn(async (id: string) => { void id; tell(); return async () => { tell(); }; });
    removeRequest = calls;
    await start();
    expect(removeButton(OTHER), 'none on the done one').toBeNull();
    await press();
    await flush();
    expect(calls).toHaveBeenCalledWith('R1');
    expect(removeButton(WORDS)).toHaveTextContent('Removing…');
    expect(row()).toHaveAttribute('aria-busy', 'true');
    expect(texts()).not.toContain(REMOVED);
    await release(0, [finished('D1')]);
    expect(screen.queryByText(WORDS)).toBeNull();
    expect(texts()).toContain(REMOVED);
    await pressUndo();
    await flush();
    expect(texts()).not.toContain(BACK);
    await release(1, [waiting('R1'), finished('D1')]);
    expect(screen.queryByText(WORDS)).not.toBeNull();
    expect(texts()).toContain(BACK);
  });

  it('F3-13 remove-twice: a second press while busy calls removeRequest once', async () => {
    const calls = vi.fn(async (id: string) => { void id; tell(); return async () => undefined; });
    removeRequest = calls;
    await start();
    await press();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Remove the request: ${WORDS}` })); });
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('F3-14 remove-failed: the error toast, the row as it was, Remove works again', async () => {
    removeRequest = async () => { throw new Error('boom'); };
    await start();
    await press();
    await flush();
    expect(row()).not.toHaveAttribute('aria-busy');
    expect(removeButton(WORDS)).toHaveTextContent(/^Remove$/);
    expect(texts()).toContain('That did not work. Try again.');
    removeRequest = async () => { tell(); return async () => undefined; };
    await press();
    expect(removeButton(WORDS)).toHaveTextContent('Removing…');
  });

  it('F3-15 remove-not-while-running: no Remove while a tidy-up is going', async () => {
    runRead = async () => going;
    await start();
    expect(screen.queryByText(WORDS)).not.toBeNull();
    expect(removeButton(WORDS)).toBeNull();
  });

  it('F3-16 remove-open-question: a request with an open question has no Remove, another has', async () => {
    questionsRead = async () => [question(requestQuestionId('R1'))];
    await start([waiting('R1'), waiting('R2', OTHER)]);
    expect(removeButton(WORDS)).toBeNull();
    expect(removeButton(OTHER)).not.toBeNull();
  });

  it('F3-17 remove-waits-for-reads: no Remove until the run and the questions are read without error', async () => {
    const q = deferred<Question[]>();
    const r = deferred<RunState | null>();
    questionsRead = () => q.promise;
    runRead = () => r.promise;
    await start();
    expect(removeButton(WORDS), 'both reads held').toBeNull();
    await act(async () => { q.resolve([]); });
    await flush();
    expect(removeButton(WORDS), 'the run read still held').toBeNull();
    await act(async () => { r.resolve(idle); });
    await flush();
    expect(removeButton(WORDS)).not.toBeNull();
    // A failed refresh after a good read: the old answer is kept by the loader, but it is not confirmed absence.
    questionsRead = async () => { throw new BowerError('unknown', 'Bower could not read your questions.'); };
    await act(async () => { tell(); });
    await flush();
    expect(removeButton(WORDS), 'the questions read failed').toBeNull();
    questionsRead = async () => [];
    await act(async () => { tell(); });
    await flush();
    expect(removeButton(WORDS), 'the questions read is good again').not.toBeNull();
    runRead = async () => { throw new BowerError('unknown', 'Bower could not read the tidy-up.'); };
    await act(async () => { runListeners.slice().forEach((l) => l()); });
    await flush();
    expect(removeButton(WORDS), 'the run read failed').toBeNull();
  });
});
