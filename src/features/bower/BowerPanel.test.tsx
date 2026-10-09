import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';
import { RightPanel } from '@/features/note/RightPanel';
import { useUi } from '@/app/ui-store';

describe('the side panel while loading', () => {
  it('names the rules without claiming there are none', async () => {
    render(
      <MemoryRouter>
        <DataProvider sources={loadingSources()}>
          <BowerPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByText(/^0 rules$/)).toBeNull();
    expect(screen.queryByText(/^Resting/)).toBeNull();
  });
});

describe('the side panel shows what failed', () => {
  it('the side panel shows a change Bower could not note until it is put away', async () => {
    const off = (): (() => void) => () => undefined;
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    let failed = [{ id: 'L1', what: 'New rule: "receipts go in money"', sentence: "Bower couldn't keep that rule." }];
    const putAway = vi.fn(async (id: string) => {
      failed = failed.filter((f) => f.id !== id);
      listeners.forEach((l) => l());
    });
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed;
        if (k === 'putAwayFailed') return putAway;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: off } }}>
          <BowerPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    // expected: a missing card is the assertion below, not a query error.
    expect(await screen.findAllByText("Bower couldn't keep that rule.").catch(() => [])).toHaveLength(1);
    expect(screen.getByText('New rule: "receipts go in money"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put it away' }));
    await waitFor(() => expect(screen.queryByText("Bower couldn't keep that rule.")).toBeNull());
    expect(putAway).toHaveBeenCalledWith('L1');
  });
});

describe('what failed is found once on a note', () => {
  it('the right panel turns to Bower once when a change could not be noted', async () => {
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    let failed: Array<{ id: string; what: string; sentence: string }> = [];
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    useUi.getState().setRightTab('links');
    render(
      <MemoryRouter initialEntries={['/note/Projects/Flat.md']}>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <RightPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    // On a note the panel opens on its links; nothing has failed yet.
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
    // A line is refused in the background: the panel turns to Bower, where it shows.
    failed = [{ id: 'L1', what: 'Moved Cooking to Archive', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    listeners.forEach((l) => l());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Bower' })).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByText("Your change was made, but Bower couldn't make a note of it.")).toBeInTheDocument();
    // Once: the person goes back to the links, and the panel stays there.
    fireEvent.click(screen.getByRole('tab', { name: 'Linked notes' }));
    listeners.forEach((l) => l());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('what failed is found once, and focus stays with the person', () => {
  beforeEach(cleanup);
  afterEach(cleanup);
  const note = { path: 'Projects/Flat.md', title: 'Flat', summary: '', properties: [], tags: [], currentState: [], body: '# Rent\n\nSee [[Money]].', timeline: [], links: ['Areas/Money.md'], backlinks: [], byBower: false };
  const panel = (failed: () => Array<{ id: string; what: string; sentence: string; seen?: true }>, seen: (id: string) => void) => {
    const never = (): Promise<never> => new Promise(() => undefined);
    const listeners = new Set<() => void>();
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
        if (k === 'failedChanges') return async () => failed();
        if (k === 'markFailedSeen') return async (id: string) => { seen(id); listeners.forEach((l) => l()); };
        if (k === 'note') return async () => note;
        if (k === 'rules' || k === 'requests' || k === 'questions') return async () => [];
        return never;
      },
    });
    useUi.getState().setRightTab('links');
    render(
      <MemoryRouter initialEntries={['/note/Projects/Flat.md']}>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <RightPanel />
        </DataProvider>
      </MemoryRouter>,
    );
    return { changed: () => listeners.forEach((l) => l()) };
  };

  it('the right panel turns to Bower once per failure and marks it seen, so a reload does not turn it again', async () => {
    let failed: Array<{ id: string; what: string; sentence: string; seen?: true }> = [];
    const seen: string[] = [];
    const { changed } = panel(() => failed, (id) => {
      seen.push(id);
      failed = failed.map((f) => (f.id === id ? { ...f, seen: true } : f));
    });
    failed = [{ id: 'L2', what: 'Moved Cooking to Archive', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    changed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Bower' })).toHaveAttribute('aria-selected', 'true'));
    // Turned once, then marked seen where what failed is kept, so the next page load knows.
    await waitFor(() => expect(seen).toEqual(['L2']));
    // A failure already turned to on an earlier load (seen) does not turn the panel again.
    fireEvent.click(screen.getByRole('tab', { name: 'Linked notes' }));
    failed = [...failed, { id: 'L3', what: 'Renamed Soup', sentence: "Your change was made, but Bower couldn't make a note of it.", seen: true }];
    changed();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('tab', { name: 'Linked notes' })).toHaveAttribute('aria-selected', 'true');
    expect(seen).toEqual(['L2']);
  });

  it('a turn to Bower moves focus from the panel that closes to the Bower tab, never to the page', async () => {
    let failed: Array<{ id: string; what: string; sentence: string; seen?: true }> = [];
    const { changed } = panel(() => failed, () => undefined);
    // The person is on a link in the links panel when a line fails in the background.
    const link = (await screen.findAllByRole('link', { name: /Money/ })).at(-1) as HTMLElement;
    link.focus();
    expect(document.activeElement).toBe(link);
    failed = [{ id: 'L4', what: 'Moved Taxes to Money', sentence: "Your change was made, but Bower couldn't make a note of it." }];
    changed();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Bower' })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Bower' })));
    expect(document.activeElement).not.toBe(document.body);
  });
});
