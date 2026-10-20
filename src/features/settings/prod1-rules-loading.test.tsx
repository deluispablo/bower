import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Settings } from './Settings';

/** prod1-rules-loading (rulings R7): the Rules row tells a read still going and a failed read apart from a count. */
const COUNT = /^\d+ rules?$/;
const settle = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const show = (rules: () => Promise<unknown>, rulesProse: () => Promise<string>) => {
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules') return rules;
      if (k === 'rulesProse') return rulesProse;
      return () => new Promise(() => undefined);
    },
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault }}>
        <Settings />
      </DataProvider>
    </MemoryRouter>,
  );
};

describe('prod1-rules-loading: Settings', () => {
  it('AC5 pending_rules_are_loading_on_settings', async () => {
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Settings /></DataProvider></MemoryRouter>);
    await settle();
    // ux-loading-polish: a named still shape where the count will be, never "Looking…".
    expect(screen.getByRole('status', { name: 'Opening your rules' })).toBeInTheDocument();
    expect(screen.queryByText(COUNT)).toBeNull();
  });

  it('AC6 failed_rules_offer_retry_then_show_confirmed_count', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    show(async () => {
      calls += 1;
      if (calls === 1) throw new BowerError('unknown', 'Your rules did not load.');
      return [{ id: 'r1', text: 'Keep receipts.', since: Date.UTC(2026, 9, 3, 12) }];
    }, async () => '');
    await settle();
    const alert = screen.queryByRole('alert');
    expect(alert, 'an alert with the read error').not.toBeNull();
    expect(alert).toHaveTextContent('Your rules did not load.');
    expect(screen.queryByText(COUNT)).toBeNull();
    expect(screen.queryByText('Looking…')).toBeNull();
    if (!alert) return;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.getByText('1 rule')).toBeInTheDocument();
  });

  it('AC6 prose_rules_show_no_count', async () => {
    show(async () => [], async () => 'Alex keeps paper letters for a year.');
    await settle();
    expect(screen.queryByText('0 rules')).toBeNull();
    expect(screen.queryByText('Looking…')).toBeNull();
  });
});
