import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(cleanup);

describe('a request that waits', () => {
  it('a request sent again after a wait goes as the same request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: Array<[string, unknown]> = [];
    let full = true;
    const never = (): Promise<never> => new Promise(() => undefined);
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        if (k === 'addRequest') return async (text: string, intent?: unknown) => {
          sent.push([text, intent]);
          if (full) throw new BowerError('unknown', 'Your Google Drive is full. Bower kept this and will send it later.');
          return { id: 'R1', text, at: 0 };
        };
        return never;
      },
    });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
          <BowerScreen />
        </DataProvider>
      </MemoryRouter>,
    );
    const box = screen.getByRole('textbox', { name: 'Your request' });
    fireEvent.change(box, { target: { value: 'Put my id papers together' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    // The words stay in the composer (P4-37e minor); sent again, they are the same request, never a second one.
    await waitFor(() => expect(box).toHaveValue('Put my id papers together'));
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]?.[1]).toEqual(expect.any(String));
    expect(sent[1]?.[1]).toBe(sent[0]?.[1]);
    // Other words are another request.
    fireEvent.change(box, { target: { value: 'Compare the flats' } });
    full = false;
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2]?.[1]).not.toBe(sent[0]?.[1]);
    await waitFor(() => expect(box).toHaveValue(''));
  });
});
