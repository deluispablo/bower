import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from './Home';

afterEach(cleanup);
describe('Home identity', () => {
  it('Home greets the person who signed in', async () => {
    const base = loadingSources();
    render(<MemoryRouter><DataProvider sources={{ ...base, session: { ...base.session, current: async () => ({ name: 'Sam', email: 'sam@example.com' }) } }}><Home /></DataProvider></MemoryRouter>);
    await waitFor(() => expect(screen.queryByRole('heading', { name: "G'day, Sam" })).not.toBeNull());
    expect(screen.getByRole('link', { name: 'Your account and settings' })).toHaveTextContent('S');
    expect(screen.queryByText(/G'day, Alex/)).toBeNull();
    cleanup();
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Home /></DataProvider></MemoryRouter>);
    expect(screen.queryByText(/Alex/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("G'day");
  });
});
