import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

describe('the palette', () => {
  it('says when search fails, instead of looking forever', async () => {
    const base = loadingSources();
    const vault = new Proxy(base.vault, {
      get: (t, k) => (k === 'search' ? () => Promise.reject(new BowerError('offline', "You're offline.")) : Reflect.get(t, k)),
    });
    useUi.setState({ paletteOpen: true });
    render(
      <MemoryRouter>
        <DataProvider sources={{ ...base, vault } as Sources}>
          <Palette />
        </DataProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Tally');
    expect(await screen.findByText(/Search did not answer/)).toBeInTheDocument();
  });
});
