import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { StatusBar } from './StatusBar';

describe('the footer while loading', () => {
  it('says it is loading, never "Nothing waiting"', async () => {
    render(
      <MemoryRouter>
        <DataProvider sources={loadingSources()}>
          <StatusBar />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Looking at the inbox/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waiting/)).toBeNull();
    expect(screen.queryByText(/^0 things$/)).toBeNull();
    expect(screen.queryByText(/Synced with your Drive/)).toBeNull();
  });
});
