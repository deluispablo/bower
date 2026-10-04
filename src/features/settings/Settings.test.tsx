import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { loadingSources } from '@/testing/loading-sources';
import { Settings } from './Settings';

describe('Settings', () => {
  it('shows who is signed in, not a name written in the code', async () => {
    const base = loadingSources();
    const sources = { ...base, session: { ...base.session, current: async () => ({ name: 'Sam', email: 'sam@example.com' }) } } as Sources;
    render(
      <MemoryRouter>
        <DataProvider sources={sources}>
          <Settings />
        </DataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Alex')).toBeNull();
  });
});
