/**
 * app-small-fixes (backlog triage 2026-10-20, group 2): an unknown Inbox count is not an empty Inbox (NN/g visibility of
 * system status: say only what is known); on Home the stopped card is not repeated by the phone chip, as qa6 already does
 * for the replay; the panel's dismiss of a stopped run reads "Got it", as Home's card (NN/g consistency and standards);
 * the Inbox folder's route is Home itself, not an address that redirects there. Made-up words only.
 */
import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { routeFor } from '@/app/paths';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { RunChip } from './RunChip';
import { TidyButton } from './TidyButton';
import { TidySheet } from './TidySheet';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, tidyReportRunId: null, replayRunId: null }); });

const stopped: RunState = { id: 'r1', scope: 'all', phase: 'failed', requestedAt: 1000, phaseAt: 2000, seen: false, failure: 'Drive did not answer.' };

/** The screen over sources whose Inbox read is `piles` (undefined: never answers) and whose last run is `run`. */
async function mount(ui: ReactNode, { piles, run, at = '/' }: { piles?: Pile[]; run?: RunState | null; at?: string }) {
  const base = loadingSources();
  const doors: Record<string, unknown> = piles ? { piles: async () => piles, pilesListed: async () => null } : {};
  const vault = new Proxy(base.vault, { get: (t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(t, k)) }) as Sources['vault'];
  const runs = run === undefined ? base.runs : { ...base.runs, current: async () => run, markSeen: vi.fn(async () => {}), subscribe: () => () => {} };
  await act(async () => { render(<MemoryRouter initialEntries={[at]}><DataProvider sources={{ ...base, vault, runs }}>{ui}</DataProvider></MemoryRouter>); });
}

describe('AC1 while the Inbox count is unknown', () => {
  it('AC1 the disabled top-bar Tidy up has no "Nothing waiting" hint', async () => {
    await mount(<TidyButton />, {});
    const button = screen.getByRole('button', { name: /^Tidy up/ });
    expect(button).toBeDisabled();
    expect(button.getAttribute('title'), 'AC1: no Nothing waiting hint while the count is unknown').toBeNull();
  });

  it('AC1 the tidy-up sheet is not named "Nothing in the inbox"', async () => {
    useUi.setState({ tidyOpen: true });
    await mount(<TidySheet />, { run: null });
    expect(screen.getByRole('dialog'), 'AC1: the sheet is not named Nothing in the inbox while the count is unknown').not.toHaveAccessibleName('Nothing in the inbox');
  });

  it('AC1 guard: an Inbox read that holds nothing keeps both', async () => {
    await mount(<><TidyButton /><TidySheet /></>, { piles: [], run: null });
    expect(screen.getByRole('button', { name: /^Tidy up/ })).toHaveAttribute('title', 'Nothing waiting in the inbox');
    act(() => useUi.setState({ tidyOpen: true }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Nothing in the inbox');
  });
});

describe('AC2 the phone chip of an unseen stop', () => {
  it('AC2 on Home, where the stopped card shows, there is no stopped chip', async () => {
    await mount(<RunChip />, { run: stopped, at: '/' });
    expect(screen.queryByRole('button', { name: /stopped/ }), 'AC2: no stopped chip on Home').toBeNull();
  });

  it('AC2 guard: elsewhere the chip stays', async () => {
    await mount(<RunChip />, { run: stopped, at: '/files' });
    expect(screen.getByRole('button', { name: 'The tidy-up stopped. See why' })).toBeVisible();
  });
});

describe('AC3 the activity panel', () => {
  it('AC3 the stopped run is dismissed with Got it, as on Home\'s card', async () => {
    await mount(<BowerPanel />, { piles: [], run: stopped });
    expect(screen.getByText('The last tidy-up stopped')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Got it' }), 'AC3: the panel says Got it').not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Put it away' }), 'AC3: not Put it away').toBeNull();
  });
});

describe('AC5 the Inbox folder opens Home', () => {
  it('AC5 the Inbox folder\'s route is Home itself, not an address that redirects there', () => {
    expect(routeFor({ path: 'Inbox', type: 'folder' }), 'AC5: the Inbox folder opens Home directly').toBe('/');
  });

  it('AC5 guard: every other folder and file keeps its address', () => {
    expect(routeFor({ path: 'Inbox/2026-10-20 Saltmere quiz', type: 'folder' })).toBe('/files/Inbox/2026-10-20%20Saltmere%20quiz');
    expect(routeFor({ path: 'Projects', type: 'folder' })).toBe('/files/Projects');
    expect(routeFor({ path: 'Inbox.md', type: 'file' })).toBe('/note/Inbox.md');
  });
});
