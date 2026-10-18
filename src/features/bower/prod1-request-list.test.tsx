import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Request } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { BowerScreen } from './BowerScreen';

/**
 * prod1-request-list: "What you asked" is one list named by its heading, one item per request holding its own words,
 * its answer and its controls (R2, R4, R5).
 */
const A = 'Put my visa papers together';
const B = 'Sort the garden photos';
const waiting = (id: string, text: string): Request => ({ id, text, at: Date.UTC(2026, 9, 3) });
const answered = (id: string, text: string): Request => ({ id, text, at: Date.UTC(2026, 9, 2), done: 'Filed it.' });

let list: Request[] = [];
let listeners: Array<() => void> = [];
const tell = (): void => listeners.slice().forEach((l) => l());
const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const start = async (initial: Request[]): Promise<void> => {
  list = initial;
  const base = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; };
      if (k === 'requests') return async () => list;
      if (k === 'rules') return async () => [];
      if (k === 'rulesProse') return undefined;
      if (k === 'questions') return async () => [];
      if (k === 'failedChanges') return async () => [];
      if (k === 'removeRequest') return async (id: string) => {
        const before = list;
        list = list.filter((r) => r.id !== id);
        tell();
        return async () => { list = before; tell(); };
      };
      return () => new Promise(() => undefined);
    },
  });
  const runs = { ...base.runs, current: async () => null, subscribe: () => () => undefined };
  render(<MemoryRouter><DataProvider sources={{ ...base, vault: vault as typeof base.vault, runs }}><BowerScreen /></DataProvider></MemoryRouter>);
  await flush();
  await flush();
};
const asked = (): HTMLElement => screen.getByRole('list', { name: 'What you asked' });
const items = (): HTMLElement[] => within(asked()).getAllByRole('listitem');
const itemOf = (words: string): HTMLElement => {
  const found = items().find((li) => within(li).queryByText(words));
  if (!found) throw new Error(`no item for ${words}`);
  return found;
};

beforeEach(() => { listeners = []; useToasts.setState({ list: [] }); });
afterEach(cleanup);

describe('prod1-request-list', () => {
  it('request_history_exposes_one_list_item_per_request', async () => {
    await start([waiting('R1', A), answered('D1', B)]);
    expect(items()).toHaveLength(2);
    expect(within(itemOf(A)).getByText('Waiting for the next tidy-up.')).toBeInTheDocument();
    expect(within(itemOf(A)).queryByText('Filed it.')).toBeNull();
    expect(within(itemOf(B)).getByText('Filed it.')).toBeInTheDocument();
    expect(within(itemOf(B)).queryByText('Waiting for the next tidy-up.')).toBeNull();
  });

  it('request_history_exposes_one_list_item_per_request: no requests, no list', async () => {
    await start([]);
    expect(screen.queryByRole('list', { name: 'What you asked' })).toBeNull();
  });

  it('request_controls_keep_names_and_focus', async () => {
    await start([waiting('R1', A), waiting('R2', B)]);
    expect(within(itemOf(A)).getByRole('button', { name: `Remove the request: ${A}` })).toBeInTheDocument();
    const removeB = within(itemOf(B)).getByRole('button', { name: `Remove the request: ${B}` });
    removeB.focus();
    await act(async () => { fireEvent.click(removeB); });
    await flush();
    expect(items()).toHaveLength(1);
    expect(within(itemOf(A)).getByRole('button', { name: `Remove the request: ${A}` })).toBeInTheDocument();
    expect(screen.queryByText(B)).toBeNull();
    expect(document.activeElement?.id === 'main' || document.activeElement === document.body).toBe(true);
    const t = useToasts.getState().list.find((x) => x.text === 'Request removed. Bower will not do it.');
    if (!t) throw new Error('no remove toast');
    await act(async () => { useToasts.getState().press(t.id); });
    await flush();
    expect(items()).toHaveLength(2);
    expect(within(itemOf(B)).getByRole('button', { name: `Remove the request: ${B}` })).toBeInTheDocument();
    expect(within(itemOf(B)).queryByRole('button', { name: `Remove the request: ${A}` })).toBeNull();
  });
});
