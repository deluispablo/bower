/** audit-ui-guards AC2 (audit 2026-10-16, finding 7): a failed folder step on Welcome says so on screen and can be retried. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Welcome } from './Welcome';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('AC2 audit-ui-guards-welcome-retry: making the folder fails, the screen says so with Try again, and Try again makes it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const base = loadingSources();
  const createFolder = vi.fn()
    .mockRejectedValueOnce(new BowerError('offline', "You're offline."))
    .mockResolvedValue({ found: false });
  const sources = { ...base, session: { ...base.session, folderState: async () => 'missing', createFolder } } as unknown as Sources;
  render(<MemoryRouter initialEntries={['/welcome']}><DataProvider sources={sources}><Welcome /></DataProvider></MemoryRouter>);
  // Let the folder reads settle (promises only, no clock).
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
  await settle();
  expect(createFolder, 'positive control: the folder step ran and failed').toHaveBeenCalledTimes(1);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent("You're offline.");
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await settle();
  expect(screen.getByRole('heading', { level: 1, name: 'Your folder is ready' })).toBeInTheDocument();
  expect(createFolder).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
