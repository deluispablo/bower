import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { COULD_NOT_OPEN_TEXT, NO_ANSWER_TEXT, OPEN_ELSEWHERE_TEXT, PAGE_ONLY_TEXT, type PlaceSource, type PlaceState } from '@/data/session';
import type { Session, Sources } from '@/data/sources';
import { BowerError, type FolderState, type User } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { App } from './App';
import { OpenElsewhere } from './OpenElsewhere';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});

const ALEX: User = { name: 'Alex', email: 'you@example.com' };

/** A place the test moves by hand: `state`, Use here and what exists only on this page. */
function placeOf(initial: PlaceState, useHere?: () => Promise<void>) {
  let state: PlaceState = initial;
  let only = false;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((l) => l());
  const calls: string[] = [];
  const place: PlaceSource = {
    state: () => state,
    start: vi.fn(async () => {
      calls.push('start');
      if (state === 'starting') state = initial === 'starting' ? 'active' : initial;
      return state;
    }),
    useHere: vi.fn(async () => {
      await useHere?.();
      state = 'active';
      emit();
    }),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    pageOnly: () => only,
  };
  return {
    place,
    calls,
    move(next: PlaceState): void {
      state = next;
      emit();
    },
    pageOnly(next: boolean): void {
      only = next;
      emit();
    },
  };
}

/** A signed-in (or not) person whose folder answers `folder`; every call is written down in `calls`. */
function sessionOf(calls: string[], who: User | null, folder: FolderState = 'missing') {
  let user = who;
  const listeners = new Set<() => void>();
  const base = loadingSources().session;
  const session: Session = {
    ...base,
    current: vi.fn(async () => {
      calls.push('current');
      return user;
    }),
    signIn: vi.fn(async () => {
      user = ALEX;
      listeners.forEach((l) => l());
      return ALEX;
    }),
    signOut: vi.fn(async () => {
      user = null;
      listeners.forEach((l) => l());
    }),
    folderState: vi.fn(async () => {
      calls.push('folderState');
      return folder;
    }),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return session;
}

function app(sources: Partial<Sources>, demo = false) {
  const base = loadingSources();
  render(
    <DataProvider sources={{ ...base, ...sources }}>
      <App {...(demo ? { demo: { scenario: 'default', scale: 'instant', source: 'demo' } } : {})} />
    </DataProvider>,
  );
}

const heading = (): HTMLElement | null => screen.queryByRole('heading', { level: 1, name: OPEN_ELSEWHERE_TEXT });

describe('Bower is open in another window', () => {
  it('the block screen shows one Bower waiting, the heading and Use here, focused', async () => {
    const { place } = placeOf('elsewhere');
    const { container } = render(<OpenElsewhere place={place} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(OPEN_ELSEWHERE_TEXT);
    const button = screen.getByRole('button', { name: 'Use here' });
    await waitFor(() => expect(button).toHaveFocus());
    const birds = container.querySelectorAll('[data-bird]');
    expect(birds).toHaveLength(1);
    expect(birds[0]).toHaveAttribute('data-pose', 'wait');
    expect(screen.queryByText(PAGE_ONLY_TEXT)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Use here is disabled while it works, then moves the session here', async () => {
    let release = (): void => undefined;
    const { place } = placeOf('elsewhere', () => new Promise<void>((resolve) => (release = resolve)));
    render(<OpenElsewhere place={place} />);
    const button = screen.getByRole('button', { name: 'Use here' });
    fireEvent.click(button);
    expect(place.useHere).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(place.useHere).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(place.state()).toBe('active');
  });

  it('a failed Use here says its sentence in an alert and can be tried again', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failures: unknown[] = [new BowerError('offline', NO_ANSWER_TEXT), new Error('a broken reply')];
    const { place } = placeOf('elsewhere', async () => {
      throw failures.shift();
    });
    render(<OpenElsewhere place={place} />);
    const button = screen.getByRole('button', { name: 'Use here' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(NO_ANSWER_TEXT);
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveFocus();
    fireEvent.click(button);
    // Anything that is not one of Bower's sentences is said as the refusal it most likely was.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(COULD_NOT_OPEN_TEXT));
    expect(quiet).toHaveBeenCalled();
  });

  it('says when things added here are only on this page, while they are', async () => {
    const p = placeOf('elsewhere');
    render(<OpenElsewhere place={p.place} />);
    expect(screen.queryByText(PAGE_ONLY_TEXT)).toBeNull();
    act(() => p.pageOnly(true));
    expect(screen.getByText(PAGE_ONLY_TEXT)).toBeInTheDocument();
    act(() => p.pageOnly(false));
    expect(screen.queryByText(PAGE_ONLY_TEXT)).toBeNull();
  });

  it('signed in elsewhere: the place starts after sign-in, before the folder step, and only the block screen shows', async () => {
    const p = placeOf('elsewhere');
    const session = sessionOf(p.calls, ALEX);
    app({ session, place: p.place });
    expect(await screen.findByRole('heading', { level: 1, name: OPEN_ELSEWHERE_TEXT })).toBeInTheDocument();
    expect(p.calls).toEqual(['current', 'start']);
    expect(session.folderState).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll('[data-bird]')).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use here' })).toHaveFocus());
  });

  it('Use here shows the app without a reload; losing the place again shows the screen', async () => {
    const p = placeOf('elsewhere');
    const session = sessionOf(p.calls, ALEX);
    app({ session, place: p.place });
    const button = await screen.findByRole('button', { name: 'Use here' });
    fireEvent.click(button);
    await waitFor(() => expect(heading()).toBeNull());
    await waitFor(() => expect(session.folderState).toHaveBeenCalled());
    expect(p.calls.indexOf('folderState')).toBeGreaterThan(p.calls.indexOf('start'));
    act(() => p.move('elsewhere'));
    expect(await screen.findByRole('heading', { level: 1, name: OPEN_ELSEWHERE_TEXT })).toBeInTheDocument();
  });

  it('signed out, nothing starts until someone signs in; a later sign-in starts the place again', async () => {
    Object.assign(navigator, { standalone: true });
    const p = placeOf('starting');
    const session = sessionOf(p.calls, null);
    app({ session, place: p.place });
    await waitFor(() => expect(location.pathname).toBe('/sign-in'));
    expect(p.place.start).not.toHaveBeenCalled();
    await act(async () => {
      await session.signIn();
    });
    await waitFor(() => expect(p.place.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(session.folderState).toHaveBeenCalled());
    expect(p.calls.indexOf('start')).toBeLessThan(p.calls.indexOf('folderState'));
    await act(async () => {
      await session.signOut();
    });
    act(() => p.move('starting'));
    await waitFor(() => expect(location.pathname).toBe('/sign-in'));
    const before = vi.mocked(p.place.start).mock.calls.length;
    await act(async () => {
      await session.signIn();
    });
    await waitFor(() => expect(vi.mocked(p.place.start).mock.calls.length).toBeGreaterThan(before));
  });

  it('the demo panel stays while this page is blocked', async () => {
    // React holds a revealed lazy chunk back for up to 300 ms (Suspense throttling): fake time moves it, no real wait.
    await import('@/data/demo/DemoPanel');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const p = placeOf('elsewhere');
      app({ session: sessionOf(p.calls, ALEX), place: p.place }, true);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(screen.getByRole('heading', { level: 1, name: OPEN_ELSEWHERE_TEXT })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Demo situations' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a source without a place opens as before', async () => {
    const calls: string[] = [];
    const session = sessionOf(calls, ALEX);
    app({ session });
    await waitFor(() => expect(session.folderState).toHaveBeenCalled());
    expect(heading()).toBeNull();
  });

  it('Use here is described by the heading, and by the page-only line while it shows', () => {
    const p = placeOf('elsewhere');
    render(<OpenElsewhere place={p.place} />);
    const button = screen.getByRole('button', { name: 'Use here' });
    expect(button).toHaveAccessibleDescription(OPEN_ELSEWHERE_TEXT);
    act(() => p.pageOnly(true));
    expect(button).toHaveAccessibleDescription(`${OPEN_ELSEWHERE_TEXT} ${PAGE_ONLY_TEXT}`);
    act(() => p.pageOnly(false));
    expect(button).toHaveAccessibleDescription(OPEN_ELSEWHERE_TEXT);
  });

  it('another place taking over shows the screen at once, even when asking again fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = placeOf('active');
    const session = sessionOf(p.calls, ALEX);
    app({ session, place: p.place });
    await waitFor(() => expect(session.folderState).toHaveBeenCalled());
    expect(heading()).toBeNull();
    vi.mocked(session.current).mockRejectedValue(new BowerError('offline', "You're offline."));
    act(() => p.move('elsewhere'));
    expect(heading()).toBeInTheDocument();
  });

  it('the app shows again only once Use here has finished, without asking for the folder again', async () => {
    let finish = (): void => undefined;
    const p = placeOf('active');
    // A ready folder opens Home, which never asks for the folder itself.
    const session = sessionOf(p.calls, ALEX, 'ready');
    // The place is active first (its event), and Use here finishes later, once the data was read again.
    vi.mocked(p.place.useHere).mockImplementation(async () => {
      p.move('active');
      await new Promise<void>((resolve) => (finish = resolve));
    });
    app({ session, place: p.place });
    await waitFor(() => expect(session.folderState).toHaveBeenCalledTimes(1));
    act(() => p.move('elsewhere'));
    fireEvent.click(screen.getByRole('button', { name: 'Use here' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(p.place.state()).toBe('active');
    expect(heading()).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(heading()).toBeNull());
    expect(session.folderState).toHaveBeenCalledTimes(1);
  });

  it('blocked from the start, Use here reads the folder once before the app shows', async () => {
    const p = placeOf('elsewhere');
    const session = sessionOf(p.calls, ALEX);
    app({ session, place: p.place });
    fireEvent.click(await screen.findByRole('button', { name: 'Use here' }));
    await waitFor(() => expect(heading()).toBeNull());
    expect(session.folderState).toHaveBeenCalledTimes(1);
  });

  it('a place left starting by signing out is not started again', async () => {
    const p = placeOf('active');
    const session = sessionOf(p.calls, ALEX);
    app({ session, place: p.place });
    await waitFor(() => expect(session.folderState).toHaveBeenCalled());
    expect(p.place.start).toHaveBeenCalled();
    const before = vi.mocked(p.place.start).mock.calls.length;
    // Signing out lets the place go first: that alone never starts it again.
    act(() => p.move('starting'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(p.place.start).toHaveBeenCalledTimes(before);
  });

  it('signed out while Use here works (the lease call says sign in again), the sign-in screen shows', async () => {
    Object.assign(navigator, { standalone: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = placeOf('elsewhere');
    const session = sessionOf(p.calls, ALEX);
    // The lease call is refused as the session ended: the person is signed out, and Use here fails with it.
    vi.mocked(p.place.useHere).mockImplementation(async () => {
      await session.signOut();
      throw new BowerError('auth', 'Sign in again to keep going.');
    });
    app({ session, place: p.place });
    fireEvent.click(await screen.findByRole('button', { name: 'Use here' }));
    await waitFor(() => expect(location.pathname).toBe('/sign-in'));
    expect(heading()).toBeNull();
  });
});
