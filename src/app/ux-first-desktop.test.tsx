/** ux-first-desktop: the first desktop keeps the right panel collapsed until the first tidy-up is done or the person chooses. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BowerError } from '@/data/types';

vi.mock('@/features/files/Explorer', () => ({ Explorer: () => null }));
vi.mock('@/features/files/SearchPanel', () => ({ SearchPanel: () => null }));
vi.mock('@/features/files/BookmarksPanel', () => ({ BookmarksPanel: () => null }));
vi.mock('@/features/note/RightPanel', () => ({ RightPanel: () => <button>Linked note</button> }));
vi.mock('@/features/tidy/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('@/features/tidy/TidyButton', () => ({ TidyButton: () => null }));
vi.mock('@/ui/Dock', () => ({ Dock: () => null }));
vi.mock('@/ui/back', () => ({ useBackCloses: () => undefined }));

type Progress = { data: { added: boolean; started: boolean; reviewed: boolean } | null | undefined; error: BowerError | null; loading: boolean };
const progress = vi.hoisted(() => ({ current: { data: undefined, error: null, loading: true } as Progress }));
vi.mock('@/features/home/useFirstTidy', () => ({
  useFirstTidy: () => ({ ...progress.current, reload: () => undefined, settled: async () => undefined }),
}));

const unreviewed: Progress = { data: { added: true, started: false, reviewed: false }, error: null, loading: false };
const reviewed: Progress = { data: { added: true, started: true, reviewed: true }, error: null, loading: false };
const loading: Progress = { data: undefined, error: null, loading: true };
const KEY = 'bower:prefs';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;

let width = 1280;

beforeEach(() => {
  width = 1280;
  localStorage.clear();
  vi.resetModules();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 900, left: 0, top: 0, right: width, bottom: 900, x: 0, y: 0, toJSON: () => ({}) }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function boot(seed: string | null, first: Progress) {
  if (seed !== null) localStorage.setItem(KEY, seed);
  progress.current = first;
  const { usePrefs } = await import('./prefs');
  const { DesktopShell } = await import('./DesktopShell');
  const tree = () => <MemoryRouter><Routes><Route element={<DesktopShell />}><Route path="/" element={<h1>Home</h1>} /></Route></Routes></MemoryRouter>;
  const view = render(tree());
  const again = (next: Progress) => {
    progress.current = next;
    view.rerender(tree());
  };
  return { usePrefs, view, again };
}

const panel = () => screen.queryByRole('complementary', { name: 'Right panel' });

test('AC2 legacy_stored_prefs_win', async () => {
  width = 1440; // room for the 400 px panel, as below
  const { usePrefs } = await boot('{"rightOpen":true,"rightWidth":400}', unreviewed);
  expect(panel()).toBeInTheDocument();
  expect(usePrefs.getState().rightSettled).toBe(true);
});

test('AC2 first_use_collapses_without_writing', async () => {
  await boot(null, unreviewed);
  expect(panel()).toBeNull();
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('AC2 loading_holds_then_restores', async () => {
  // A 400 px right panel beside the 300 px side panel docks only above 1312 px (52 + 300 + 400 + 560).
  width = 1440;
  const { view, again } = await boot('{"theme":"dark","rightOpen":true,"rightWidth":400,"rightSettled":false}', loading);
  expect(panel()).toBeNull();
  again(reviewed);
  expect(panel()).toBeInTheDocument();
  const frame = view.container.querySelector<HTMLElement>('[style*="--rw"]');
  expect(frame?.style.getPropertyValue('--rw')).toBe('400px');
  expect(stored()).toMatchObject({ rightWidth: 400, rightOpen: true, rightSettled: true, theme: 'dark' });
});

test.each([
  ['null progress', { data: null, error: null, loading: false }],
  ['an error', { data: undefined, error: new BowerError('unknown', 'Could not read the first tidy-up.'), loading: false }],
] as const)('AC2 unknown_progress_follows_stored: %s', async (_name, first) => {
  const { usePrefs } = await boot(null, first);
  expect(panel()).toBeInTheDocument();
  expect(usePrefs.getState().rightSettled).toBe(false);
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('AC2 toggle_during_first_use_opens', async () => {
  const { usePrefs } = await boot('{"rightOpen":true,"rightSettled":false}', unreviewed);
  fireEvent.click(screen.getByRole('button', { name: 'Show the right panel' }));
  expect(panel()).toBeInTheDocument();
  expect(usePrefs.getState().rightOpen).toBe(true);
  expect(usePrefs.getState().rightSettled).toBe(true);
  expect(stored()).toMatchObject({ rightOpen: true });
});

test('AC2 hiding_is_a_choice', async () => {
  // Legacy prefs (no rightSettled) are settled and open.
  const { again } = await boot('{"rightOpen":true}', unreviewed);
  fireEvent.click(screen.getByRole('button', { name: 'Hide the right panel' }));
  act(() => again(reviewed));
  expect(panel()).toBeNull();
  expect(stored()).toMatchObject({ rightOpen: false, rightSettled: true });
});

test.each(['null', '5'])('AC2 stored_prefs_not_an_object: %s', async (seed) => {
  const { usePrefs } = await boot(seed, unreviewed);
  const state = usePrefs.getState();
  expect(state).toMatchObject({ theme: 'system', rightOpen: true, rightWidth: 320, leftOpen: true, leftWidth: 300, rightSettled: false });
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
});
