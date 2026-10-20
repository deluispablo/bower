import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type FolderState, type User } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { App } from './App';
import { bootDone, bootFail, bootHold, openedByCap } from './boot';
import { Home } from '@/features/home/Home';

// The wiring tests watch what App and Home ask of the start-up screen; the screen's own rules use the real module.
const release = vi.fn();
vi.mock('./boot', () => ({ bootStart: vi.fn(), bootDone: vi.fn(), bootFail: vi.fn(), bootHold: vi.fn(() => release), openedByCap: vi.fn(() => false), onCap: vi.fn(() => () => undefined) }));
vi.mock('./Shell', () => ({ Shell: () => <Outlet /> }));
vi.mock('@/features/files/FolderScreen', () => ({ FolderScreen: () => <h1>Files</h1> }));
vi.mock('@/features/onboarding/Welcome', () => ({ Welcome: () => <h1>Welcome</h1> }));

const ALEX: User = { name: 'Alex', email: 'you@example.com' };
const BOOT = '<div id="boot" role="status"><div class="bird posed land"></div><p data-boot-line></p></div><div id="root"></div>';

afterEach(() => {
  cleanup();
  // Back to each mock's own implementation: a test may route the screen to the real module or fire the cap.
  vi.resetAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

type Boot = typeof import('./boot');
/** A fresh start-up screen module: its clock starts now, with nothing held or asked. */
async function realBoot(): Promise<Boot> {
  vi.resetModules();
  const boot = await vi.importActual<Boot>('./boot');
  document.body.innerHTML = BOOT;
  return boot;
}
const cover = (): HTMLElement | null => document.getElementById('boot');
const app = (): HTMLElement | null => document.getElementById('root');

describe('the start-up screen (boot.ts)', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('AC2 held_until_ready: Home holds it past 3 s with the slow line; its release lets it go', async () => {
    const boot = await realBoot();
    boot.bootStart();
    const done = boot.bootHold();
    boot.bootDone();
    expect(app()?.style.visibility).toBe('hidden');
    vi.advanceTimersByTime(3500);
    expect(cover()?.querySelector('b')).toHaveTextContent('Still opening');
    vi.advanceTimersByTime(1500);
    expect(cover()).not.toBeNull();
    expect(cover()).not.toHaveClass('leaving');
    done();
    expect(app()?.style.visibility).toBe('');
    vi.advanceTimersByTime(500);
    expect(cover()).toBeNull();
  });

  it('AC2 cap_at_eight: a read that never lands holds it until about 8 s from the page start, no longer', async () => {
    // The script loads 1 s after the page starts: the cap still counts from the page start (R2-1).
    vi.advanceTimersByTime(1000);
    const boot = await realBoot();
    boot.bootStart();
    boot.bootHold();
    boot.bootDone();
    expect(boot.openedByCap()).toBe(false);
    vi.advanceTimersByTime(6500);
    expect(cover()).not.toHaveClass('leaving');
    vi.advanceTimersByTime(700);
    expect(boot.openedByCap()).toBe(true);
    expect(cover()).toHaveClass('leaving');
    expect(app()?.style.visibility).toBe('');
    vi.advanceTimersByTime(500);
    expect(cover()).toBeNull();
  });

  it('AC4 no_cap_without_the_app: with nothing asked (who is signed in is unknown) it never leaves', async () => {
    const boot = await realBoot();
    boot.bootStart();
    boot.bootHold();
    vi.advanceTimersByTime(20_000);
    expect(cover()).not.toBeNull();
    expect(cover()).not.toHaveClass('leaving');
  });

  it('AC4 obsolete_attempt: after a failure, an earlier hold or cap never dismisses the screen', async () => {
    const boot = await realBoot();
    boot.bootStart();
    const done = boot.bootHold();
    boot.bootDone();
    boot.bootFail('error', vi.fn());
    done();
    vi.advanceTimersByTime(20_000);
    expect(cover()?.querySelector('b')).toHaveTextContent('Bower could not open');
    expect(cover()).not.toHaveClass('leaving');
    boot.bootDone();
    vi.advanceTimersByTime(500);
    expect(cover()).toBeNull();
  });

  it('AC3 signed_out_no_minimum: a signed-out answer leaves at once, without Bower’s 2 s landing', async () => {
    const boot = await realBoot();
    boot.bootStart();
    boot.bootDone(true);
    vi.advanceTimersByTime(450);
    expect(cover()).toBeNull();
  });

  it('AC3 signed_in_keeps_the_landing: a signed-in answer still waits the 2 s minimum', async () => {
    const boot = await realBoot();
    boot.bootStart();
    boot.bootDone();
    vi.advanceTimersByTime(1500);
    expect(cover()).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(cover()).toBeNull();
  });

  it('AC5 sign_out_action: a session error offers Sign out, which calls it; Try again keeps focus', async () => {
    const boot = await realBoot();
    const signOut = vi.fn(async () => undefined);
    boot.bootFail('error', vi.fn(), signOut);
    const line = cover()?.querySelector('[data-boot-line]') as HTMLElement;
    expect(line).toHaveTextContent('Something went wrong while opening. Your notes are safe in your Drive. If it keeps happening, sign out and in again.');
    expect(within(line).getByRole('button', { name: 'Try again' })).toHaveFocus();
    within(line).getByRole('button', { name: 'Sign out' }).click();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('AC5 sign_out_fails: a failed sign-out says so once and offers it again', async () => {
    vi.useRealTimers();
    const boot = await realBoot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    boot.bootFail('error', vi.fn(), () => Promise.reject(new Error('made up')));
    const line = cover()?.querySelector('[data-boot-line]') as HTMLElement;
    const out = within(line).getByRole('button', { name: 'Sign out' });
    out.click();
    expect(out).toBeDisabled();
    await waitFor(() => expect(out).toBeEnabled());
    out.click();
    await waitFor(() => expect(out).toBeEnabled());
    expect(within(line).getAllByText('Bower could not sign you out. Try again.')).toHaveLength(1);
  });

  it('AC5 offline_unchanged: offline keeps its copy and offers no Sign out', async () => {
    const boot = await realBoot();
    boot.bootFail('offline', vi.fn());
    const line = cover()?.querySelector('[data-boot-line]') as HTMLElement;
    expect(line.textContent).toBe("You're offlineBower opens when you're back online.Try again");
    expect(within(line).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});

function openApp(path: string, user: Promise<User | null>, folder: FolderState = 'ready') {
  history.replaceState(null, '', path);
  const sources = loadingSources();
  sources.session.current = vi.fn(() => user);
  sources.session.folderState = vi.fn(async () => folder);
  sources.session.signOut = vi.fn(async () => undefined);
  render(<StrictMode><DataProvider sources={sources}><App /></DataProvider></StrictMode>);
  return sources;
}

describe('who dismisses the start-up screen (App)', () => {
  it('AC3 signed_out_dismisses_now: a signed-out answer asks the screen to leave at once', async () => {
    openApp('/sign-in', Promise.resolve(null));
    await screen.findByRole('button', { name: 'Continue with Google' });
    // bootDone runs in a passive effect (App.tsx), which may still be pending when the DOM shows: act flushes it.
    await act(async () => undefined);
    expect(bootDone).toHaveBeenLastCalledWith(true);
  });

  it.each([['/files/Projects', 'ready', 'Files'], ['/', 'missing', 'Welcome']] as const)('AC3 no_home_wait: %s (%s) does not wait for Home’s reads', async (path, folder, heading) => {
    openApp(path, Promise.resolve(ALEX), folder);
    await screen.findByRole('heading', { name: heading });
    await act(async () => undefined);
    expect(bootDone).toHaveBeenCalled();
    expect(bootHold).not.toHaveBeenCalled();
  });

  it('AC4 unresolved_session: while who is signed in is unknown, nothing asks the screen to leave or shows Home', async () => {
    openApp('/', new Promise(() => undefined));
    await act(async () => undefined);
    expect(bootDone).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('AC5 session_error_offers_sign_out: a session error passes the session’s own sign-out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sources = openApp('/', Promise.reject(new BowerError('unknown', 'Something went wrong.')));
    await waitFor(() => expect(bootFail).toHaveBeenCalled());
    const [kind, , signOut] = vi.mocked(bootFail).mock.lastCall ?? [];
    expect(kind).toBe('error');
    expect(signOut).toBeTypeOf('function');
    await signOut?.();
    expect(sources.session.signOut).toHaveBeenCalledOnce();
  });

  it('AC5 sign_out_lets_go: a sign-out that works takes the person from the error screen to sign-in', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The screen's fade is a timer: vi.waitFor advances the fake clock between its checks.
    vi.useFakeTimers();
    const boot = await realBoot();
    history.replaceState(null, '', '/sign-in');
    vi.mocked(bootFail).mockImplementation(boot.bootFail);
    vi.mocked(bootDone).mockImplementation(boot.bootDone);
    let signedOut = false;
    const told = new Set<() => void>();
    const sources = loadingSources();
    sources.session.current = vi.fn(async () => {
      if (signedOut) return null;
      throw new BowerError('unknown', 'Something went wrong.');
    });
    sources.session.subscribe = (fn: () => void) => {
      told.add(fn);
      return () => void told.delete(fn);
    };
    sources.session.signOut = vi.fn(async () => {
      signedOut = true;
      told.forEach((fn) => fn());
    });
    render(<StrictMode><DataProvider sources={sources}><App /></DataProvider></StrictMode>);
    (await vi.waitFor(() => screen.getByRole('button', { name: 'Sign out' }))).click();
    await vi.waitFor(() => expect(cover()).toBeNull());
    expect(await vi.waitFor(() => screen.getByRole('button', { name: 'Continue with Google' }))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('AC5 offline_no_sign_out: an offline session error offers no sign-out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openApp('/', Promise.reject(new BowerError('offline', 'You are offline.')));
    await waitFor(() => expect(bootFail).toHaveBeenCalled());
    const [kind, , signOut] = vi.mocked(bootFail).mock.lastCall ?? [];
    expect(kind).toBe('offline');
    expect(signOut).toBeUndefined();
  });
});

/** Home over sources whose reads answer at once, except the ones named, which wait (or fail) until told. */
function openHome(overrides: { piles?: () => Promise<unknown>; questions?: () => Promise<unknown> } = {}) {
  const base = loadingSources();
  const doors: Record<string, unknown> = {
    piles: overrides.piles ?? (async () => []),
    pilesListed: async () => [],
    questions: overrides.questions ?? (async () => []),
    firstTidy: async () => null,
    changes: async () => [],
    suggestions: async () => [],
    tree: async () => [],
    uploadNotice: async () => null,
    orphanSummary: async () => ({ count: 0, complete: true }),
  };
  const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
  const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => null }, session: { ...base.session, current: async () => ALEX } };
  render(<MemoryRouter><DataProvider sources={sources}><Home /></DataProvider></MemoryRouter>);
}

describe('Home holds the start-up screen from the reads it shows', () => {
  it('AC1 holds_until_its_reads: a question read on its way holds it; its answer lets go', async () => {
    let answer!: (v: unknown) => void;
    openHome({ questions: () => new Promise((r) => { answer = r; }) });
    await screen.findByText(/^Nothing waiting/);
    expect(bootHold).toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    await act(async () => { answer([]); });
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('AC4 read_error_lets_go: a failed inbox read lets go and says why, no endless placeholder', async () => {
    openHome({ piles: () => Promise.reject(new BowerError('offline', 'Bower could not read your inbox. Try again.')) });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findByRole('alert')).toHaveTextContent('Bower could not read your inbox. Try again.');
    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(screen.queryByRole('status', { name: 'Opening your inbox' })).toBeNull();
  });

  it('AC2 no_questions_placeholder_without_cap: without the cap (after folder creation) the questions read adds no shape and nothing moves', async () => {
    let answer!: (v: unknown) => void;
    openHome({ questions: () => new Promise((r) => { answer = r; }) });
    await screen.findByText(/^Nothing waiting/);
    expect(screen.queryByRole('status', { name: 'Opening your questions' })).toBeNull();
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    const above = (): Element[] => {
      const out: Element[] = [];
      for (let n = inbox.previousElementSibling; n; n = n.previousElementSibling) out.push(n);
      return out;
    };
    const before = above();
    await act(async () => { answer([]); });
    await waitFor(() => expect(release).toHaveBeenCalled());
    expect(inbox).toBeInTheDocument();
    expect(above()).toEqual(before);
  });

  it('AC2 placeholders: once the cap opened Home with reads on their way, it shows still shapes, never “Looking…”', () => {
    vi.mocked(openedByCap).mockReturnValue(true);
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Home /></DataProvider></MemoryRouter>);
    expect(screen.getByRole('status', { name: 'Opening your inbox' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Opening your questions' })).toBeInTheDocument();
    expect(screen.queryByText('Looking…')).toBeNull();
  });
});
