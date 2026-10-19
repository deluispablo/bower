import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Home } from '@/features/home/Home';
import { BowerScreen } from '@/features/bower/BowerScreen';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { StatusBar } from '@/features/tidy/StatusBar';
import { RunChip } from '@/features/tidy/RunChip';
import { TidySheet } from '@/features/tidy/TidySheet';
import { useUi } from '@/app/ui-store';

const MESSAGE = 'Bower could not read its latest update. Try again.';
afterEach(() => {
  cleanup();
  useUi.getState().setTidy(false);
  vi.restoreAllMocks();
});

describe('runner data errors', () => {
  it('unreadable runner data is explained on screen', async () => {
    const cases = [
      { component: Home, source: 'vault', read: 'questions', good: [] },
      { component: Home, source: 'vault', read: 'suggestions', good: [] },
      { component: Home, source: 'vault', read: 'changes', good: [] },
      { component: Home, source: 'runs', read: 'current', good: null },
      { component: BowerScreen, source: 'vault', read: 'rules', good: [] },
      { component: BowerScreen, source: 'vault', read: 'requests', good: [] },
      { component: BowerScreen, source: 'runs', read: 'current', good: null },
      // On Home the panel leaves the questions and their error to Home, so this case reads them on a note.
      { component: BowerPanel, source: 'vault', read: 'questions', good: [], path: '/note/Projects/Flat.md' },
      { component: BowerPanel, source: 'vault', read: 'rules', good: [] },
      { component: BowerPanel, source: 'vault', read: 'requests', good: [] },
      { component: BowerPanel, source: 'runs', read: 'current', good: null },
      { component: StatusBar, source: 'runs', read: 'current', good: null },
      { component: RunChip, source: 'runs', read: 'current', good: null },
      { component: TidySheet, source: 'runs', read: 'current', good: null },
    ] as const;
    for (const c of cases) {
      const base = loadingSources();
      const read = vi.fn().mockRejectedValueOnce(new BowerError('unknown', MESSAGE)).mockResolvedValue(c.good);
      const sources: Sources = {
        ...base,
        vault: new Proxy(base.vault, { get: (target, key) => c.source === 'vault' && key === c.read ? read : c.component === Home && key === 'firstTidy' ? async () => null : Reflect.get(target, key) }),
        runs: new Proxy(base.runs, { get: (target, key) => c.source === 'runs' && key === c.read ? read : Reflect.get(target, key) }),
      };
      if (c.component === TidySheet) useUi.getState().setTidy(true);
      const Component = c.component;
      render(<MemoryRouter initialEntries={['path' in c ? c.path : '/']}><DataProvider sources={sources}><main id="main" tabIndex={-1}><Component /></main></DataProvider></MemoryRouter>);
      await waitFor(() => expect(screen.queryByRole('alert'), `${c.component.name}: ${c.read}`).not.toBeNull());
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
      const retry = screen.getByRole('button', { name: 'Try again' });
      retry.focus();
      const before = read.mock.calls.length;
      fireEvent.click(retry);
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      expect(read).toHaveBeenCalledTimes(before + 1);
      await waitFor(() => expect(document.activeElement).not.toBe(document.body));
      cleanup();
      useUi.getState().setTidy(false);
    }
  });
});
