import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from './BowerPanel';

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
