/**
 * qa4-stale-toast (qa-4 Claude F4): a "Tidy up now" message is withdrawn once nothing waits in the inbox, as it already
 * is once a tidy-up starts (`useRunWatcher`, `dismissAction`). It is decided on the inbox read after the message
 * showed, never on an older read.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { toast, useToasts } from '@/ui/toast';
import { useRunWatcher } from './useRunWatcher';

const AT = 1_800_000_000_000;
const pile: Pile = { id: 'p-1', text: '', createdAt: AT, items: [{ id: 'i-1', name: 'lease.pdf', kind: 'pdf', origin: 'From this device' }] };

function Watcher() {
  useRunWatcher();
  return null;
}

async function settle(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

/** The watcher over an inbox the test changes; `notify` is the vault telling its screens. */
function mount(start: Pile[]) {
  let inbox = start;
  const reads = { piles: 0 };
  // `later` makes the next reads wait: each is answered by hand, with what the inbox held when it began.
  const ctl: { later: boolean; fail: boolean; pending: Array<() => void> } = { later: false, fail: false, pending: [] };
  const listeners = new Set<() => void>();
  const base = loadingSources();
  const methods: Record<string, unknown> = {
    piles: async () => {
      reads.piles++;
      const seen = inbox;
      if (ctl.fail) throw new BowerError('unknown', 'Could not read.');
      if (ctl.later) await new Promise<void>((r) => ctl.pending.push(r));
      return seen;
    },
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k)) });
  const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => null, subscribe: () => () => undefined } };
  render(<DataProvider sources={sources}><Watcher /></DataProvider>);
  return {
    reads,
    ctl,
    answer: (i: number) => act(async () => { ctl.pending[i]?.(); await vi.advanceTimersByTimeAsync(0); }),
    set: (next: Pile[]) => { inbox = next; },
    notify: () => act(async () => { listeners.forEach((cb) => cb()); await vi.advanceTimersByTimeAsync(0); }),
  };
}

const offered = (): string[] => useToasts.getState().list.filter((t) => t.action?.label === 'Tidy up now').map((t) => t.text);

beforeEach(() => {
  vi.useFakeTimers();
  for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('qa4-stale-toast: a message about a thing that is gone goes', () => {
  it('AC1 withdrawn-when-empty: the pile is removed, nothing waits: "Tidy up now" goes, other messages stay', async () => {
    const m = mount([pile]);
    await settle();
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    // Positive control: with the thing still waiting, the message stays.
    expect(offered()).toEqual(['1 thing in the inbox']);
    m.set([]);
    toast('Pile removed');
    await m.notify();
    expect(offered()).toEqual([]);
    expect(useToasts.getState().list.map((t) => t.text)).toEqual(['Pile removed']);
  });

  it('R3 fresh-read: shown while the last read inbox was empty, the message stays when the inbox now has the thing', async () => {
    const m = mount([]);
    await settle();
    // The save landed (the vault has the pile) but no screen read the inbox again yet.
    m.set([pile]);
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    await settle();
    expect(offered()).toEqual(['1 thing in the inbox']);
  });

  it('R4 no-read-without-offer: with no "Tidy up now" message, the watcher reads no inbox', async () => {
    const m = mount([pile]);
    await settle();
    await m.notify();
    expect(m.reads.piles).toBe(0);
  });

  it('R3 fresh-read: a message shown after an empty read waits for its own read, then goes', async () => {
    const m = mount([]);
    await settle();
    m.set([pile]);
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(m.reads.piles).toBe(1);
    expect(offered()).toEqual(['1 thing in the inbox']);
    m.set([]);
    await m.notify();
    expect(m.reads.piles).toBe(2);
    expect(offered()).toEqual([]);
  });

  it('R3 races: an older empty answer neither overrides a newer populated one nor dismisses a later offer', async () => {
    const m = mount([]);
    await settle();
    m.ctl.later = true;
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(m.reads.piles).toBe(1); // read 0: empty, still on its way
    m.set([pile]);
    await m.notify(); // read 1: populated
    await m.answer(1);
    await m.answer(0);
    expect(offered()).toEqual(['1 thing in the inbox']);
    // A later offer is not dismissed by an answer to a read that began before it.
    m.set([]);
    await m.notify(); // read 2: empty, on its way
    act(() => useToasts.getState().dismissAction('Tidy up now'));
    m.set([pile]);
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle(); // read 3: populated
    await m.answer(3);
    await m.answer(2);
    expect(offered()).toEqual(['1 thing in the inbox']);
  });

  it('R3 races: an empty answer that resolved before a newer offer showed, but is handled after, does not dismiss it', async () => {
    const m = mount([]);
    await settle();
    m.ctl.later = true;
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(m.reads.piles).toBe(1); // read 0: empty, still on its way
    m.ctl.later = false;
    // The read resolves, then the new offer shows in the same tick, before the read's handler runs.
    await act(async () => {
      m.ctl.pending[0]?.();
      await Promise.resolve(); // the read's handler is queued, not yet run; React has not cleaned up the old message
      m.set([pile]);
      useToasts.getState().dismissAction('Tidy up now');
      toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(offered()).toEqual(['1 thing in the inbox']);
  });

  it('R2 waitingIn: a list holding only an empty pile counts as nothing; a note-only pile counts as one', async () => {
    const empty: Pile = { id: 'p-2', text: '  ', createdAt: AT, items: [] };
    const note: Pile = { id: 'p-3', text: 'call the landlord', createdAt: AT, items: [] };
    const m = mount([pile]);
    await settle();
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    m.set([note]);
    await m.notify();
    expect(offered()).toEqual(['1 thing in the inbox']);
    m.set([empty]);
    await m.notify();
    expect(offered()).toEqual([]);
  });

  it('R4 reads: one read when it shows, one per vault change while shown, none after it is gone', async () => {
    const m = mount([pile]);
    await settle();
    expect(m.reads.piles).toBe(0);
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(m.reads.piles).toBe(1);
    await m.notify();
    expect(m.reads.piles).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); }); // it expires
    expect(offered()).toEqual([]);
    await m.notify();
    expect(m.reads.piles).toBe(2);
    const id = toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(m.reads.piles).toBe(3);
    act(() => useToasts.getState().dismiss(id));
    await m.notify();
    expect(m.reads.piles).toBe(3);
  });

  it('R5 failed-read: a failed read keeps the offer and is reported; a later empty read withdraws it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = mount([pile]);
    await settle();
    m.ctl.fail = true;
    toast('1 thing in the inbox', { label: 'Tidy up now', run: () => undefined });
    await settle();
    expect(offered()).toEqual(['1 thing in the inbox']);
    expect(err).toHaveBeenCalled();
    m.ctl.fail = false;
    m.set([]);
    await m.notify();
    expect(offered()).toEqual([]);
    err.mockRestore();
  });
});
