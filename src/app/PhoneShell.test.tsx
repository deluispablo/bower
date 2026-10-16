/**
 * phone-drawer-focus-trap (WAI-ARIA APG, modal dialog): while the phone drawer is open the keyboard stays inside it,
 * Escape closes it, and closing gives focus back to what held it when the drawer opened. The drawer is the shared
 * Sheet (an edge panel at the left), as the desktop's folded side panel already is.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PhoneShell } from './PhoneShell';
import { useUi } from './ui-store';
import s from './shell.module.css';

vi.mock('@/features/files/Explorer', () => ({ Explorer: () => <><button type="button">Open a folder</button><Link to="/files/folder">Folder</Link></> }));
vi.mock('@/features/tidy/RunChip', () => ({ RunChip: () => null }));
vi.mock('@/ui/Dock', () => ({ Dock: () => null }));
vi.mock('@/ui/back', () => ({ useBackCloses: () => undefined }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', MouseEvent);
  useUi.setState({ drawerOpen: false });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function show() {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<PhoneShell />}>
          <Route path="/" element={<h1>Home</h1>} />
          <Route path="/files/folder" element={<h1>Folder</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** The tab bar's Files link holds the keyboard when the drawer opens. */
function openFromFilesTab(): HTMLElement {
  const files = screen.getByRole('link', { name: 'Files' });
  files.focus();
  act(() => useUi.getState().setDrawer(true));
  return files;
}

/** Long enough for the closing layer and the route focus rule (50 ms steps) to settle. */
const settle = (): void => {
  act(() => {
    vi.advanceTimersByTime(600);
  });
};

test('AC1 drawer-takes-focus: opening the drawer puts the keyboard on its Close button', () => {
  show();
  openFromFilesTab();
  const drawer = screen.getByRole('dialog', { name: 'Your folders' });
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  expect(drawer).toContainElement(document.activeElement as HTMLElement);
});

test('AC2 drawer-tab-loops: Tab and Shift+Tab wrap inside the drawer, and focus sent outside comes back', () => {
  show();
  const files = openFromFilesTab();
  const close = screen.getByRole('button', { name: 'Close' });
  const folder = screen.getByRole('link', { name: 'Folder' });
  folder.focus();
  fireEvent.keyDown(folder, { key: 'Tab' });
  expect(close, 'Tab on the last control goes to the first').toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(folder, 'Shift+Tab on the first control goes to the last').toHaveFocus();
  act(() => files.focus());
  expect(screen.getByRole('dialog', { name: 'Your folders' }), 'focus outside the open drawer returns to it').toContainElement(document.activeElement as HTMLElement);
});

test('AC3 drawer-escape-returns: Escape closes the drawer and focus goes back to what opened it', () => {
  show();
  const files = openFromFilesTab();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(useUi.getState().drawerOpen).toBe(false);
  expect(files).toHaveFocus();
});

test('AC3 drawer-close-returns: the Close button gives focus back to what opened the drawer', () => {
  show();
  const files = openFromFilesTab();
  // A tap or a key press on Close leaves the keyboard on it, as the browser does.
  const close = screen.getByRole('button', { name: 'Close' });
  close.focus();
  fireEvent.click(close);
  settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(files).toHaveFocus();
});

test('R3 drawer-no-opener: opened with nothing focused (a swipe), closing puts the keyboard on the page heading', () => {
  show();
  act(() => useUi.getState().setDrawer(true));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Home' })).toHaveFocus();
});

test('AC4 drawer-navigation-heading: a link in the drawer closes it and the keyboard goes to the new page heading', () => {
  show();
  openFromFilesTab();
  fireEvent.click(screen.getByRole('link', { name: 'Folder' }));
  settle();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Folder' })).toHaveFocus();
});

test('R6 drawer-swipe-opens: a swipe from the left edge still opens the drawer (guard)', () => {
  show();
  const edge = s.edge ? document.querySelector<HTMLElement>(`.${s.edge}`) : null;
  if (!edge) throw new Error('Missing the left edge');
  fireEvent.pointerDown(edge, { clientX: 2 });
  fireEvent.pointerMove(edge, { clientX: 60 });
  expect(screen.getByRole('dialog', { name: 'Your folders' })).toBeInTheDocument();
});
