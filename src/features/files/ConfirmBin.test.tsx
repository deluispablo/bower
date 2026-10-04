import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { ConfirmBin } from './ConfirmBin';

afterEach(() => {
  cleanup();
  useUi.getState().setConfirmBin(null);
});

function show(trash: (path: string) => Promise<unknown>): void {
  const base = loadingSources();
  const sources = { ...base, vault: { ...base.vault, trash } } as Sources;
  render(
    <MemoryRouter>
      <DataProvider sources={sources}>
        <ConfirmBin />
      </DataProvider>
    </MemoryRouter>,
  );
}

describe('ConfirmBin', () => {
  it('ConfirmBin asks with the count of everything inside, and Keep it keeps it', () => {
    const trash = vi.fn(async () => undefined);
    show(trash);
    act(() => useUi.getState().setConfirmBin({ path: 'Projects/Flat hunt', count: 7, nested: true }));
    expect(screen.getByRole('dialog', { name: 'Put Flat hunt in the Bin?' })).toBeInTheDocument();
    expect(screen.getByText(/Everything inside goes with it: 7 things, counting what is in its folders\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(useUi.getState().confirmBin).toBeNull();
    expect(trash).not.toHaveBeenCalled();
  });

  it('ConfirmBin puts the folder in the Bin on yes', async () => {
    const trash = vi.fn(async () => undefined);
    show(trash);
    act(() => useUi.getState().setConfirmBin({ path: 'Projects/Flat hunt', count: 1 }));
    expect(screen.getByText(/The thing inside goes with it\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put it in the Bin' }));
    await vi.waitFor(() => expect(trash).toHaveBeenCalledWith('Projects/Flat hunt'));
  });
});
