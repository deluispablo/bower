import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError, type Rule } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { BowerScreen } from './BowerScreen';

/**
 * qa2-F5: the toast speaks when the rules list agrees. `removeRule` and `undo` resolve at once and tell the
 * listeners (as drive-vault's `emit` does); the list's own re-read is held by the test.
 */
const REMOVED = 'Rule removed. Bower stops following it from the next tidy-up.';
const BACK = 'The rule is back.';
const WORDS = 'Bills go in Money, by month.';
const rule = (id: string, pending = false): Rule => ({ id, text: WORDS, since: Date.UTC(2026, 9, 3), ...(pending ? { pending: true } : {}) });

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let listeners: Array<() => void> = [];
let reads: Array<Deferred<Rule[]>> = [];
/** Whether the rule's words were on screen the moment each toast text was first published (F5-R3). */
let seen: Record<string, boolean> = {};
let stopWatching: () => void = () => undefined;
let removeRule: () => Promise<() => Promise<void>> = async () => async () => undefined;
const tell = (): void => listeners.slice().forEach((l) => l());

const sources = (initial: Rule[]) => {
  const base = loadingSources();
  let first = true;
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; };
      if (k === 'rules') return async () => {
        if (first) { first = false; return initial; }
        const d = deferred<Rule[]>();
        reads.push(d);
        return d.promise;
      };
      if (k === 'rulesProse') return undefined;
      if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      if (k === 'removeRule') return () => removeRule();
      return () => new Promise(() => undefined);
    },
  });
  return { ...base, vault: vault as typeof base.vault, runs: { ...base.runs, subscribe: () => () => undefined } };
};
const tree = (src: ReturnType<typeof sources>, show = true) => (
  <MemoryRouter><DataProvider sources={src}>{show && <BowerScreen />}</DataProvider></MemoryRouter>
);
const texts = (): string[] => useToasts.getState().list.map((t) => t.text);
const row = (): HTMLElement | null => screen.queryByText(new RegExp(WORDS))?.closest('li') ?? null;
const press = async (name: RegExp): Promise<void> => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
const pressUndo = async (): Promise<void> => {
  const t = useToasts.getState().list.find((x) => x.text === REMOVED);
  if (!t) throw new Error('no remove toast');
  await act(async () => { useToasts.getState().press(t.id); });
};
const release = async (i: number, rules: Rule[]): Promise<void> => { await act(async () => { reads[i]?.resolve(rules); }); await flush(); };
const start = async (initial: Rule[] = [rule('R1')]) => {
  const src = sources(initial);
  const view = render(tree(src));
  await flush();
  return { src, view };
};

beforeEach(() => {
  listeners = [];
  reads = [];
  seen = {};
  useToasts.setState({ list: [] });
  removeRule = async () => { tell(); return async () => { tell(); }; };
  stopWatching = useToasts.subscribe((st) => {
    for (const t of st.list) if (!(t.text in seen)) seen[t.text] = screen.queryByText(new RegExp(WORDS)) !== null;
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { stopWatching(); cleanup(); vi.restoreAllMocks(); });

describe('qa2-F5: the rule toasts wait for the list', () => {
  it('AC1 F5 remove: the row says Removing… until the list drops it, then the toast', async () => {
    await start();
    await press(/Remove the rule/);
    await flush();
    expect(row(), 'still listed while the read is held').not.toBeNull();
    expect(row()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /Remove the rule/ })).toHaveTextContent('Removing…');
    expect(texts()).not.toContain(REMOVED);
    await release(0, []);
    expect(row()).toBeNull();
    expect(texts()).toContain(REMOVED);
    expect(seen[REMOVED], 'the row was already gone when the toast was published').toBe(false);
  });

  it('AC1 F5 remove: two overlapping refreshes, no toast until the replacement lands', async () => {
    await start();
    await press(/Remove the rule/);
    await act(async () => { tell(); }); // a second refresh replaces the first
    await flush();
    expect(reads).toHaveLength(2);
    await release(0, [rule('R1')]); // the superseded answer
    expect(texts()).not.toContain(REMOVED);
    expect(row()).toHaveAttribute('aria-busy', 'true');
    await release(1, []);
    expect(row()).toBeNull();
    expect(texts()).toContain(REMOVED);
    expect(seen[REMOVED]).toBe(false);
  });

  it('AC1 F5 remove: a second press on the busy row does nothing', async () => {
    const calls = vi.fn(async () => { tell(); return async () => undefined; });
    removeRule = calls;
    await start();
    await press(/Remove the rule/);
    await press(/Remove the rule/);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('AC2 F5 undo: The rule is back. only once the list shows the rule', async () => {
    await start();
    await press(/Remove the rule/);
    await release(0, []);
    await pressUndo();
    await flush();
    expect(texts()).not.toContain(BACK);
    expect(row()).toBeNull();
    await release(1, [rule('R1')]);
    expect(row()).not.toBeNull();
    expect(texts()).toContain(BACK);
    expect(seen[BACK], 'the row was already shown when the toast was published').toBe(true);
  });

  it('AC2 F5 undo: two overlapping refreshes, the confirmation waits for the replacement', async () => {
    await start();
    await press(/Remove the rule/);
    await release(0, []);
    await pressUndo();
    await act(async () => { tell(); });
    await flush();
    await release(1, []); // superseded
    expect(texts()).not.toContain(BACK);
    await release(2, [rule('R1')]);
    expect(texts()).toContain(BACK);
    expect(seen[BACK]).toBe(true);
  });

  it('AC2 F5 undo (F5-R9): a pending rule restored under a new id is matched by its words', async () => {
    await start([rule('P1', true)]);
    await press(/Remove the rule/);
    await release(0, []);
    await pressUndo();
    await flush();
    expect(texts()).not.toContain(BACK);
    await release(1, [rule('P2', true)]);
    expect(texts()).toContain(BACK);
    expect(seen[BACK]).toBe(true);
  });

  it('AC3 F5 remove failed: the row is back as it was, with the error toast', async () => {
    removeRule = async () => { throw new BowerError('unknown', 'Bower could not remove that.'); };
    await start();
    await press(/Remove the rule/);
    await flush();
    const r = row();
    expect(r).not.toBeNull();
    expect(r).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: /Remove the rule/ })).toHaveTextContent(/^Remove$/);
    expect(texts()).toContain('Bower could not remove that.');
  });

  it('AC3 F5 (F5-R2): a failed re-read after a successful remove still gives the toast, and no aria-busy', async () => {
    await start();
    await press(/Remove the rule/);
    await act(async () => { reads[0]?.reject(new BowerError('unknown', 'Bower could not read your rules.')); });
    await flush();
    expect(texts()).toContain(REMOVED);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('F5-R7: a successful Undo followed by a rejected rules read still says it is back, and the wait ends', async () => {
    await start();
    await press(/Remove the rule/);
    await release(0, []);
    await pressUndo();
    await act(async () => { reads[1]?.reject(new BowerError('unknown', 'Bower could not read your rules.')); });
    await flush();
    expect(texts()).toContain(BACK);
    expect(texts()).not.toContain(REMOVED);
  });

  it('AC4 F5-R4: leaving Bower during a removal still gives the toast once removeRule resolves', async () => {
    const held = deferred<() => Promise<void>>();
    removeRule = () => held.promise;
    const { src, view } = await start();
    await press(/Remove the rule/);
    view.rerender(tree(src, false));
    await flush();
    await act(async () => { tell(); held.resolve(async () => { tell(); }); });
    await flush();
    expect(texts().filter((t) => t === REMOVED)).toHaveLength(1);
  });

  it('AC4 F5-R4: Undo after leaving gives The rule is back. once undo resolves', async () => {
    const { src, view } = await start();
    await press(/Remove the rule/);
    await release(0, []);
    view.rerender(tree(src, false));
    await flush();
    await pressUndo();
    await flush();
    expect(texts().filter((t) => t === BACK)).toHaveLength(1);
  });

  it('F5-R8: leave, return, resolve gives the toast once and no error', async () => {
    const held = deferred<() => Promise<void>>();
    removeRule = () => held.promise;
    const { src, view } = await start();
    await press(/Remove the rule/);
    view.rerender(tree(src, false));
    view.rerender(tree(src, true)); // the new list makes its own read
    await flush();
    await act(async () => { tell(); held.resolve(async () => undefined); });
    await flush();
    expect(texts().filter((t) => t === REMOVED)).toHaveLength(1);
    expect(texts()).toHaveLength(1);
    expect(console.error).not.toHaveBeenCalled();
  });
});
