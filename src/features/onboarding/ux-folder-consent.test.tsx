/**
 * ux-folder-consent: Welcome asks before making the folder (reads never create), makes it once per press, says
 * plainly when that fails, and keeps its keyboard targets (docs: ux-folder-consent rulings 2, 3, 5, 6, 12).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type FolderState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { focusRouteHeading } from '@/ui/focus';
import { Welcome } from './Welcome';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const later = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

/** The app's route-focus rule, as App mounts it, for the views Welcome navigates to. */
function RouteFocus() {
  const { pathname } = useLocation();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    return focusRouteHeading();
  }, [pathname]);
  return <Outlet />;
}

interface Session {
  folderState: () => Promise<FolderState>;
  createFolder: () => Promise<{ found: boolean }>;
  signOut: () => Promise<void>;
}
function mount(session: Partial<Session>, path = '/welcome') {
  const base = loadingSources();
  const sources = { ...base, session: { ...base.session, ...session } } as unknown as Sources;
  const router = createMemoryRouter(
    [{
      element: <RouteFocus />,
      children: [
        { path: '/welcome', element: <><button>Elsewhere</button><Welcome /></> },
        { path: '/', element: <main><h1>Home stand-in</h1></main> },
        { path: '/sign-in', element: <main><h1>Sign in stand-in</h1></main> },
      ],
    }],
    { initialEntries: [path] },
  );
  render(<DataProvider sources={sources}><RouterProvider router={router} /></DataProvider>);
  return router;
}
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const h1 = (name: string) => screen.getByRole('heading', { level: 1, name });
const CREATE = 'Make my Bower folder';
const NOT_CREATED = 'Your Bower folder could not be made. Try again.';
const missing = () => 'missing' as const;
const ready = () => 'ready' as const;
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('ux-folder-consent: nothing is made before the press', () => {
  it('AC1 consent-no-creation: a missing folder shows the ask, and waiting or rerendering makes nothing', async () => {
    const createFolder = vi.fn().mockResolvedValue({ found: false });
    mount({ folderState: async () => missing(), createFolder });
    await settle();
    expect(createFolder, 'reading the folder never makes it').not.toHaveBeenCalled();
    expect(h1('Where Bower keeps things')).toBeInTheDocument();
    expect(screen.getByText(/Bower makes one new folder called Bower in My Drive/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CREATE })).toBeEnabled();
    await settle();
    expect(createFolder).not.toHaveBeenCalled();
    for (const r of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive']) expect(screen.queryByText(r)).toBeNull();
  });

  it('AC2 consent-once: a double press makes the folder once, shows Making it… disabled, then goes Home', async () => {
    const made = later<{ found: boolean }>();
    const createFolder = vi.fn(() => made.promise);
    const router = mount({ folderState: async () => missing(), createFolder });
    await settle();
    const button = screen.getByRole('button', { name: CREATE });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(createFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Making it…' })).toBeDisabled();
    expect(screen.queryByText('Inbox')).toBeNull();
    await act(async () => { made.resolve({ found: false }); });
    await settle();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Home stand-in' })).toBeInTheDocument();
  });

  it('AC3 consent-failure: a failed make says so with Try again, which makes it again once per press', async () => {
    const logged = quiet();
    const boom = new BowerError('offline', "You're offline.");
    const createFolder = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue({ found: false });
    const router = mount({ folderState: async () => missing(), createFolder });
    await settle();
    press(CREATE);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(NOT_CREATED);
    expect(logged).toHaveBeenCalledWith(boom);
    press('Try again');
    await settle();
    expect(createFolder).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('ux-folder-consent: reading the folder and creating it retry separately', () => {
  it('(a) lookup-retry: a failed lookup retries only folderState, and a missing answer shows the ask with no creation', async () => {
    quiet();
    const folderState = vi.fn().mockRejectedValueOnce(new BowerError('offline', "You're offline.")).mockResolvedValue('missing');
    const createFolder = vi.fn().mockResolvedValue({ found: false });
    mount({ folderState, createFolder });
    await settle();
    press('Try again');
    await settle();
    expect(folderState).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: CREATE })).toBeEnabled();
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('(b) lookup-offline-sentence: a lookup BowerError keeps its sentence', async () => {
    // guard: the offline sentence was already kept.
    quiet();
    mount({ folderState: () => Promise.reject(new BowerError('offline', "You're offline.")), createFolder: vi.fn() });
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent("You're offline.");
  });

  it('(b) lookup-unknown-sentence: an unknown lookup error says it could not be opened, logs it, and leaves sign-out open', async () => {
    const logged = quiet();
    const boom = new Error('SYNTHETIC_DETAIL');
    const createFolder = vi.fn();
    mount({ folderState: () => Promise.reject(boom), createFolder });
    await settle();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Your Bower folder could not be opened. Try again.');
    expect(alert).not.toHaveTextContent('SYNTHETIC_DETAIL');
    expect(logged).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('button', { name: 'Not now, sign out' })).toBeEnabled();
    expect(createFolder).not.toHaveBeenCalled();
  });
});

describe('ux-folder-consent: the way out of creation', () => {
  it('(c) created-goes-home: {found:false} goes Home by replacing the entry', async () => {
    const router = mount({ folderState: async () => missing(), createFolder: async () => ({ found: false }) });
    await settle();
    press(CREATE);
    await settle();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('(c) found-welcome-back: {found:true} says welcome back, and Open Bower goes Home by replacing the entry', async () => {
    const router = mount({ folderState: async () => missing(), createFolder: async () => ({ found: true }) });
    await settle();
    press(CREATE);
    await settle();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(h1('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Your Bower folder is still in My Drive, with everything in it.')).toBeInTheDocument();
    press('Open Bower');
    await settle();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('(d) ready-welcome-back: a ready folder at /welcome says welcome back and makes nothing', async () => {
    const createFolder = vi.fn();
    mount({ folderState: async () => ready(), createFolder });
    await settle();
    expect(h1('Welcome back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Bower' })).toBeEnabled();
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('(d) ready-legacy-step: a ready folder at /welcome?step=2 goes Home by replacing the entry', async () => {
    const router = mount({ folderState: async () => ready(), createFolder: vi.fn() }, '/welcome?step=2');
    await settle();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('(d) missing-legacy-step: a missing folder at /welcome?step=2 shows the ask and makes nothing', async () => {
    const createFolder = vi.fn();
    mount({ folderState: async () => missing(), createFolder }, '/welcome?step=2');
    await settle();
    expect(screen.getByRole('button', { name: CREATE })).toBeEnabled();
    expect(createFolder).not.toHaveBeenCalled();
  });
});

describe('ux-folder-consent: signing out instead', () => {
  it('(e) signout-once: a double press signs out once, replaces the route with sign-in and makes nothing', async () => {
    const out = later<undefined>();
    const signOut = vi.fn(() => out.promise);
    const createFolder = vi.fn();
    const router = mount({ folderState: async () => missing(), createFolder, signOut });
    await settle();
    const button = screen.getByRole('button', { name: 'Not now, sign out' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: CREATE })).toBeDisabled();
    await act(async () => { out.resolve(undefined); });
    await settle();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('(e) signout-disabled-while-looking: sign-out waits while the folder is being looked up', async () => {
    mount({ folderState: () => new Promise(() => undefined), signOut: vi.fn() });
    expect(screen.getByRole('button', { name: 'Not now, sign out' })).toBeDisabled();
  });

  it('(e) overlap-create-then-signout: while the folder is being made, sign-out is disabled and ignored', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mount({ folderState: async () => missing(), createFolder: () => new Promise(() => undefined), signOut });
    await settle();
    press(CREATE);
    const out = screen.getByRole('button', { name: 'Not now, sign out' });
    expect(out).toBeDisabled();
    fireEvent.click(out);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('(e) overlap-signout-then-create: while signing out, making the folder is disabled and ignored', async () => {
    const createFolder = vi.fn();
    mount({ folderState: async () => missing(), createFolder, signOut: () => new Promise(() => undefined) });
    await settle();
    press('Not now, sign out');
    const make = screen.getByRole('button', { name: CREATE });
    expect(make).toBeDisabled();
    fireEvent.click(make);
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('(e) signout-rejected: a failed sign-out says so, logs it, blocks the rest, and Try again retries only sign-out', async () => {
    const logged = quiet();
    const boom = new Error('SYNTHETIC_DETAIL');
    const signOut = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue(undefined);
    const createFolder = vi.fn();
    const router = mount({ folderState: async () => missing(), createFolder, signOut });
    await settle();
    press('Not now, sign out');
    await settle();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Bower could not sign you out. Try again.');
    expect(alert).not.toHaveTextContent('SYNTHETIC_DETAIL');
    expect(logged).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('button', { name: CREATE })).toBeDisabled();
    press('Try again');
    await settle();
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(createFolder).not.toHaveBeenCalled();
  });
});

describe('ux-folder-consent: the keyboard goes where the change happened', () => {
  const focusOn = (name: string): HTMLElement => {
    const el = screen.getByRole('button', { name });
    el.focus();
    return el;
  };

  it('(f) focus-none-on-load: opening the page and its lookup move no focus', async () => {
    // guard: nothing moved focus before either.
    mount({ folderState: async () => missing(), createFolder: vi.fn() });
    await settle();
    expect(document.body).toHaveFocus();
  });

  it('(f) focus-failure-retry: a failed make puts the keyboard on Try again, described by the sentence', async () => {
    quiet();
    mount({ folderState: async () => missing(), createFolder: () => Promise.reject(new Error('x')) });
    await settle();
    focusOn(CREATE);
    press(CREATE);
    await settle();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveFocus();
    expect(retry).toHaveAccessibleDescription(NOT_CREATED);
  });

  it('(f) focus-retry-pending: Try again, while the retry runs, puts the keyboard on the setup heading', async () => {
    quiet();
    const createFolder = vi.fn().mockRejectedValueOnce(new Error('x')).mockReturnValue(new Promise(() => undefined));
    mount({ folderState: async () => missing(), createFolder });
    await settle();
    press(CREATE);
    await settle();
    focusOn('Try again');
    press('Try again');
    await settle();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('(f) focus-lookup-retry-missing: a lookup retry that finds nothing puts the keyboard on the ask', async () => {
    quiet();
    const folderState = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('missing');
    mount({ folderState, createFolder: vi.fn() });
    await settle();
    focusOn('Try again');
    press('Try again');
    await settle();
    expect(screen.getByRole('button', { name: CREATE })).toHaveFocus();
  });

  it('(f) focus-lookup-retry-ready: a lookup retry that finds the folder puts the keyboard on Welcome back', async () => {
    quiet();
    const folderState = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ready');
    mount({ folderState, createFolder: vi.fn() });
    await settle();
    focusOn('Try again');
    press('Try again');
    await settle();
    expect(h1('Welcome back')).toHaveFocus();
  });

  it('(f) focus-found: a make that finds the old folder puts the keyboard on Welcome back', async () => {
    mount({ folderState: async () => missing(), createFolder: async () => ({ found: true }) });
    await settle();
    focusOn(CREATE);
    press(CREATE);
    await settle();
    expect(h1('Welcome back')).toHaveFocus();
  });

  // The route rule waits a few 50 ms ticks before it moves the keyboard to the new heading.
  const routed = () => act(async () => { await vi.advanceTimersByTimeAsync(400); });

  it('(f) focus-home-made: a made folder puts the keyboard on the Home heading', async () => {
    vi.useFakeTimers();
    mount({ folderState: async () => missing(), createFolder: async () => ({ found: false }) });
    await settle();
    focusOn(CREATE);
    press(CREATE);
    await settle();
    await routed();
    expect(h1('Home stand-in')).toHaveFocus();
  });

  it('(f) focus-home-open: Open Bower puts the keyboard on the Home heading', async () => {
    vi.useFakeTimers();
    mount({ folderState: async () => ready() });
    await settle();
    focusOn('Open Bower');
    press('Open Bower');
    await routed();
    expect(h1('Home stand-in')).toHaveFocus();
  });

  it('(f) focus-signed-out: a successful sign-out puts the keyboard on the sign-in heading', async () => {
    vi.useFakeTimers();
    mount({ folderState: async () => missing(), createFolder: vi.fn(), signOut: async () => undefined });
    await settle();
    focusOn('Not now, sign out');
    press('Not now, sign out');
    await settle();
    await routed();
    expect(h1('Sign in stand-in')).toHaveFocus();
  });

  it('(f) focus-kept-elsewhere: focus placed elsewhere during the make stays there when it fails', async () => {
    quiet();
    const made = later<{ found: boolean }>();
    mount({ folderState: async () => missing(), createFolder: () => made.promise });
    await settle();
    focusOn(CREATE);
    press(CREATE);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await act(async () => { made.reject(new Error('x')); });
    await settle();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });
});
