/** audit-ui-guards AC2 (audit 2026-10-16, finding 7): a failed folder step on Welcome says so on screen and can be retried. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Welcome } from './Welcome';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const mount = (session: Record<string, unknown>) => {
  const base = loadingSources();
  const sources = { ...base, session: { ...base.session, ...session } } as unknown as Sources;
  const router = createMemoryRouter(
    [{ path: '/welcome', element: <Welcome /> }, { path: '/', element: <main><h1>Home stand-in</h1></main> }],
    { initialEntries: ['/welcome'] },
  );
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
};

it('AC2 audit-ui-guards-welcome-retry: making the folder fails, the screen says so with Try again, and Try again makes it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const createFolder = vi.fn()
    .mockRejectedValueOnce(new BowerError('offline', "You're offline."))
    .mockResolvedValue({ found: false });
  mount({ folderState: async () => 'missing', createFolder });
  await settle();
  expect(createFolder, 'reading the folder never makes it').not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Make my Bower folder' }));
  await settle();
  expect(createFolder, 'positive control: the folder step ran and failed').toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert')).toHaveTextContent('Your Bower folder could not be made. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await settle();
  expect(screen.getByRole('heading', { level: 1, name: 'Home stand-in' })).toBeInTheDocument();
  expect(createFolder).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('AC2 audit-ui-guards-welcome-state-retry: reading the folder fails, Try again reads it again and a ready folder needs no new one', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const folderState = vi.fn()
    .mockRejectedValueOnce(new BowerError('offline', "You're offline."))
    .mockResolvedValue('ready');
  const createFolder = vi.fn().mockResolvedValue({ found: false });
  mount({ folderState, createFolder });
  await settle();
  expect(screen.getByRole('alert')).toHaveTextContent("You're offline.");
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await settle();
  expect(folderState).toHaveBeenCalledTimes(2);
  expect(createFolder).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('AC2 audit-ui-guards-welcome-plain-error: an unknown failure shows the fallback sentence and logs the details', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const boom = new Error('SYNTHETIC_DETAIL');
  mount({ folderState: async () => 'missing', createFolder: vi.fn().mockRejectedValue(boom) });
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Make my Bower folder' }));
  await settle();
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Your Bower folder could not be made. Try again.');
  expect(alert).not.toHaveTextContent('SYNTHETIC_DETAIL');
  expect(logged).toHaveBeenCalledWith(boom);
});
