/**
 * qa6-a11y (qa-6 Claude F3, F6; designer 5): the setup screen is plain keyboard use (WCAG 2.4.3): its two actions are
 * buttons in reading order, Back after leaving it does not bring it again (each way out replaces its history entry),
 * and its heading is the one thing the page names itself by.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { FolderState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Welcome } from './Welcome';

afterEach(cleanup);

/** Welcome from `path` after a Home entry, with a folder in `state` and a stand-in Home. */
function setup(path: string, state: FolderState) {
  const base = loadingSources();
  const session = { ...base.session, folderState: async () => state, createFolder: async () => ({ found: false }) };
  const sources = { ...base, session } as unknown as Sources;
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <Welcome /> },
      { path: '/', element: <p>Home stand-in</p> },
    ],
    { initialEntries: ['/', path], initialIndex: 1 },
  );
  render(
    <DataProvider sources={sources}>
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe('qa6-a11y: the setup screen is keyboard use, one step', () => {
  it('AC2 qa6-a11y-order: the folder button comes before sign-out in reading order', async () => {
    setup('/welcome', 'missing');
    await settle();
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Make my Bower folder', 'Not now, sign out']);
  });

  it('AC3 qa6-a11y-no-back: Back after making the folder does not show setup again', async () => {
    const router = setup('/welcome', 'missing');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Make my Bower folder' }));
    await settle();
    expect(screen.getByText('Home stand-in')).toBeInTheDocument();
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).not.toBe('/welcome');
    expect(screen.queryByRole('heading', { level: 1, name: 'Where Bower keeps things' })).toBeNull();
  });
});
