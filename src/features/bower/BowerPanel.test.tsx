import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
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
  });
});
