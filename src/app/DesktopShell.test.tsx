import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { createMemoryRouter, Link, MemoryRouter, Route, RouterProvider, Routes } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as shell from './DesktopShell';
import { usePrefs } from './prefs';

vi.mock('@/features/files/Explorer', () => ({ Explorer: () => <><button>Open a folder</button><Link to="/files/folder">Folder</Link></> }));
vi.mock('@/features/files/SearchPanel', () => ({ SearchPanel: () => null }));
vi.mock('@/features/files/BookmarksPanel', () => ({ BookmarksPanel: () => null }));
vi.mock('@/features/note/RightPanel', () => ({ RightPanel: () => <button>Linked note</button> }));
vi.mock('@/features/tidy/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('@/features/tidy/TidyButton', () => ({ TidyButton: () => null }));
vi.mock('@/ui/Dock', () => ({ Dock: () => null }));
vi.mock('@/ui/back', () => ({ useBackCloses: () => undefined }));
vi.mock('@/features/home/useFirstTidy', () => ({ useFirstTidy: () => ({ data: null, error: null, loading: false, reload: () => undefined, settled: async () => undefined }) }));

const defaults = { leftOpen: true, rightOpen: true, leftWidth: 300, rightWidth: 320 };
let resize: (width: number) => void;

beforeEach(() => {
  vi.useFakeTimers();
  usePrefs.setState(defaults);
  localStorage.clear();
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) {
      resize = (width) => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    observe() { resize(1280); }
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('docked keeps the page column at least 560 px', () => {
  const decide = Reflect.get(shell, 'docked') as ((width: number, prefs: typeof defaults) => { left: boolean; right: boolean }) | undefined;
  expect(decide, 'the desktop layout owns the docking rule').toBeTypeOf('function');
  if (!decide) throw new Error('Missing docking rule');
  for (const [width, left, right, page] of [
    [900, false, false, 848],
    [1024, true, false, 672],
    [1100, true, false, 748],
    [1280, true, true, 608],
    [1440, true, true, 768],
  ] as const) {
    const result = decide(width, defaults);
    expect(result, `${width} px`).toEqual({ left, right });
    const column = width - 52 - (result.left ? defaults.leftWidth : 0) - (result.right ? defaults.rightWidth : 0);
    expect(column).toBe(page);
    expect(column).toBeGreaterThanOrEqual(560);
  }
});

function layout(ready = true) {
  return <MemoryRouter><Routes><Route element={<shell.DesktopShell />}><Route path="/" element={<h1>Home</h1>} /><Route path="/files/folder" element={ready ? <h1>Folder</h1> : <p>Opening the folder</p>} /></Route></Routes></MemoryRouter>;
}

function show() {
  return render(layout());
}

test('dragging and keyboard resizing stop with a 560 px page column', () => {
  show();
  const left = screen.getByRole('separator', { name: 'Resize the side panel' });
  left.setPointerCapture = vi.fn();
  fireEvent.pointerDown(left, { clientX: 300, pointerId: 1 });
  fireEvent.pointerMove(left, { clientX: 900, pointerId: 1 });
  fireEvent.pointerUp(left, { pointerId: 1 });
  expect(usePrefs.getState().leftWidth).toBe(348);
  expect(left).toHaveAttribute('aria-valuemax', '348');
  fireEvent.keyDown(left, { key: 'ArrowRight' });
  expect(usePrefs.getState().leftWidth).toBe(348);
  expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument();
  act(() => usePrefs.setState(defaults));
  const right = screen.getByRole('separator', { name: 'Resize the right panel' });
  right.setPointerCapture = vi.fn();
  fireEvent.pointerDown(right, { clientX: 900, pointerId: 2 });
  fireEvent.pointerMove(right, { clientX: 0, pointerId: 2 });
  fireEvent.pointerUp(right, { pointerId: 2 });
  expect(usePrefs.getState().rightWidth).toBe(368);
  expect(right).toHaveAttribute('aria-valuemax', '368');
  fireEvent.keyDown(right, { key: 'ArrowLeft' });
  expect(usePrefs.getState().rightWidth).toBe(368);
});

test.each(['side', 'right'] as const)('%s resizer values stay integral after fractional dragging and clamping', (side) => {
  show();
  act(() => resize(1280.5));
  const resizer = screen.getByRole('separator', { name: `Resize the ${side} panel` });
  resizer.setPointerCapture = vi.fn();
  const direction = side === 'side' ? 1 : -1;
  const width = () => side === 'side' ? usePrefs.getState().leftWidth : usePrefs.getState().rightWidth;
  fireEvent.pointerDown(resizer, { clientX: 500, pointerId: 1 });
  fireEvent.pointerMove(resizer, { clientX: 500 + direction * 20.5, pointerId: 1 });
  expect(width()).toBe(side === 'side' ? 320.5 : 340.5);
  expect(Number.isInteger(Number(resizer.getAttribute('aria-valuenow')))).toBe(true);
  expect(resizer).toHaveAttribute('aria-valuenow', side === 'side' ? '321' : '341');
  fireEvent.pointerMove(resizer, { clientX: 500 + direction * 600.5, pointerId: 1 });
  fireEvent.pointerUp(resizer, { pointerId: 1 });
  expect(width()).toBe(side === 'side' ? 348.5 : 368.5);
  expect(Number.isInteger(Number(resizer.getAttribute('aria-valuenow')))).toBe(true);
  expect(resizer).toHaveAttribute('aria-valuenow', side === 'side' ? '349' : '369');
});

test('folding focused panels returns focus to their toggles without writing prefs', () => {
  show();
  screen.getByRole('button', { name: 'Linked note' }).focus();
  act(() => resize(1100));
  expect(screen.getByRole('button', { name: 'Show the right panel' })).toHaveFocus();
  screen.getByRole('button', { name: 'Open a folder' }).focus();
  act(() => resize(900));
  expect(screen.getByRole('button', { name: 'Show the side panel' })).toHaveFocus();
  expect(localStorage.getItem('bower:prefs')).toBeNull();
  act(() => resize(1440));
  expect(screen.getByRole('complementary', { name: 'Side panel' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument();
  expect(usePrefs.getState()).toMatchObject(defaults);
});

test('a folded panel focuses its close button and navigation dismisses it to the heading', () => {
  show();
  act(() => resize(900));
  const toggle = screen.getByRole('button', { name: 'Show the side panel' });
  toggle.focus();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Close the side panel' })).toHaveFocus();
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('link', { name: 'Folder' }));
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Folder' })).toHaveFocus();
  expect(localStorage.getItem('bower:prefs')).toBeNull();
});

test('overlay navigation waits for a loading page heading through the existing route focus rule', () => {
  const view = render(layout(false));
  act(() => resize(900));
  const toggle = screen.getByRole('button', { name: 'Show the side panel' });
  toggle.focus();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('link', { name: 'Folder' }));
  act(() => vi.advanceTimersByTime(50));
  view.rerender(layout(true));
  act(() => vi.advanceTimersByTime(600));
  expect(screen.getByRole('heading', { name: 'Folder' })).toHaveFocus();
});

test('docking an open edge sheet returns focus and never writes preferences', () => {
  show();
  for (const side of ['side', 'right'] as const) {
    act(() => resize(900));
    const toggle = screen.getByRole('button', { name: `Show the ${side} panel` });
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: `Close the ${side} panel` })).toHaveFocus();
    act(() => resize(1440));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Hide the ${side} panel` })).toHaveFocus();
    expect(localStorage.getItem('bower:prefs')).toBeNull();
  }
});

test.each([
  [900, false, false], [1024, true, false], [1100, true, false],
  [1280, true, true], [1440, true, true],
] as const)('the first shell page render docks at %i px without a fold-then-dock flip', (width, left, right) => {
  // A browser does not deliver its first ResizeObserver notification synchronously.
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) {
      resize = (nextWidth) => callback([{ contentRect: { width: nextWidth } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    observe() {}
    disconnect() {}
  });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height: 900, left: 0, top: 0, right: width, bottom: 900, x: 0, y: 0, toJSON: () => ({}),
  });
  const frames: { left: boolean; right: boolean }[] = [];
  try {
    render(<Profiler id="shell" onRender={() => {
      // An unmeasured frame may be empty, but the page must first mount with correct docking.
      if (!document.querySelector('#main')) return;
      frames.push({
        left: screen.queryByRole('complementary', { name: 'Side panel' }) !== null,
        right: screen.queryByRole('complementary', { name: 'Right panel' }) !== null,
      });
    }}>{layout()}</Profiler>);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames).toEqual(frames.map(() => ({ left, right })));
    const explorer = screen.queryByRole('button', { name: 'Open a folder' });
    act(() => resize(width));
    expect(screen.queryByRole('button', { name: 'Open a folder' })).toBe(explorer);
    expect(frames).toEqual(frames.map(() => ({ left, right })));
    expect(usePrefs.getState()).toMatchObject(defaults);
    expect(localStorage.getItem('bower:prefs')).toBeNull();
  } finally {
    rect.mockRestore();
  }
});

test('navigation dismisses the overlay permanently when Back returns to its opening route', async () => {
  const router = createMemoryRouter([{
    element: <shell.DesktopShell />,
    children: [{ path: '/', element: <h1>Home</h1> }, { path: '/files/folder', element: <h1>Folder</h1> }],
  }]);
  render(<RouterProvider router={router} />);
  act(() => resize(900));
  const toggle = screen.getByRole('button', { name: 'Show the side panel' });
  toggle.focus();
  fireEvent.click(toggle);
  expect(screen.getByRole('dialog', { name: 'Side panel' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Folder' }));
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Folder' })).toHaveFocus();
  await act(async () => { await router.navigate(-1); });
  act(() => vi.runOnlyPendingTimers());
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show the side panel' })).toHaveAttribute('aria-expanded', 'false');
});

test('the shell supplies Bower moves to the folded panel Sheet', () => {
  const moves = usePrefs.getState().birdMoves;
  try {
    usePrefs.setState({ birdMoves: false });
    show();
    act(() => resize(900));
    fireEvent.click(screen.getByRole('button', { name: 'Show the side panel' }));
    const dialog = screen.getByRole('dialog', { name: 'Side panel' });
    expect(dialog.style.animation).toBe('none');
    act(() => usePrefs.setState({ birdMoves: true }));
    expect(dialog.style.animation).toBe('');
  } finally {
    act(() => usePrefs.setState({ birdMoves: moves }));
  }
});
