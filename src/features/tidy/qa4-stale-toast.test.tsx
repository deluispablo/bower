/**
 * qa4-stale-toast (qa-4 Claude F4): a "Tidy up now" message is withdrawn once nothing waits in the inbox, as it already
 * is once a tidy-up starts (`useRunWatcher`, `dismissAction`). It is decided on the inbox read after the message
 * showed, never on an older read.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile } from '@/data/types';
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
  const listeners = new Set<() => void>();
  const base = loadingSources();
  const methods: Record<string, unknown> = {
    piles: async () => { reads.piles++; return inbox; },
    subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
  };
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k)) });
  const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => null, subscribe: () => () => undefined } };
  render(<DataProvider sources={sources}><Watcher /></DataProvider>);
  return {
    reads,
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
});
