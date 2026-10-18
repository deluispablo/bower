import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Outlet } from 'react-router';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { forgetThisPerson } from '@/data/device';
import type { FolderState, User } from '@/data/types';
import type { PlaceSource } from '@/data/session';
import { App } from './App';

vi.mock('./Shell', () => ({ Shell: () => <Outlet /> }));
vi.mock('@/features/home/Home', () => ({ Home: () => <h1>Home</h1> }));
vi.mock('@/features/files/FolderScreen', () => ({ FolderScreen: () => <h1>Files</h1> }));
vi.mock('@/features/onboarding/Welcome', () => ({ Welcome: () => <h1>Welcome</h1> }));

const KEY = 'bower:sign-in-from';
const ALEX: User = { name: 'Alex', email: 'you@example.com' };
const paths = ['/files/Projects', '/files/Projects/Flat%20hunt?view=list&tag=a%2Bb'] as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

function open(path: string, user: User | null = null, folder: FolderState = 'ready', place?: PlaceSource) {
  history.replaceState(null, '', path);
  const sources = loadingSources();
  const listeners = new Set<() => void>();
  sources.session.current = vi.fn(async () => user);
  sources.session.folderState = vi.fn(async () => folder);
  sources.session.subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
  if (place) sources.place = place;
  render(<StrictMode><DataProvider sources={sources}><App /></DataProvider></StrictMode>);
  return {
    sources,
    async signIn() { user = ALEX; await act(async () => listeners.forEach((cb) => cb())); },
  };
}

it.each([false, true])('browser root replaces the document and clears return (signals missing %s)', async (missing) => {
  if (missing) vi.stubGlobal('matchMedia', undefined);
  const replace = vi.fn();
  vi.stubGlobal('location', { ...window.location, replace });
  sessionStorage.setItem(KEY, paths[0]);
  open('/');
  await act(async () => undefined);
  expect(replace).toHaveBeenCalledWith('/landing/');
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

it.each(['media', 'ios'])('standalone root replaces the route using the %s signal', async (signal) => {
  if (signal === 'ios') Object.assign(navigator, { standalone: true });
  else {
    const media = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...media(query), matches: query === '(display-mode: standalone)' }));
  }
  const before = history.length;
  open('/');
  await screen.findByRole('button', { name: 'Continue with Google' });
  expect(window.location.pathname).toBe('/sign-in');
  expect(history.length).toBe(before);
});

it.each([false, true])('signed in root remains Home (standalone %s)', async (standalone) => {
  Object.assign(navigator, { standalone });
  open('/', ALEX);
  await screen.findByRole('heading', { name: 'Home' });
  expect(window.location.pathname).toBe('/');
});

it.each(paths)('deep-link return preserves %s and consumes it once', async (path) => {
  const before = history.length;
  const app = open(`${path}#discard`);
  await screen.findByRole('button', { name: 'Continue with Google' });
  expect(window.location.pathname + window.location.search).toBe(`/sign-in?from=${encodeURIComponent(path)}`);
  expect(history.length).toBe(before);
  expect(sessionStorage.getItem(KEY)).toBe(path);
  await app.signIn();
  await screen.findByRole('heading', { name: 'Files' });
  expect(window.location.pathname + window.location.search).toBe(path);
  expect(window.location.hash).toBe('');
  expect(sessionStorage.getItem(KEY)).toBeNull();
  cleanup();
  open('/', ALEX);
  await screen.findByRole('heading', { name: 'Home' });
});

it.each(['/', '/sign-in'])('callback at %s consumes stored return under Strict Mode', async (path) => {
  sessionStorage.setItem(KEY, paths[1]);
  open(path, ALEX);
  await act(async () => undefined);
  expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe(paths[1]);
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('an explicit return wins, omits its fragment, and survives callback failure and retry', async () => {
  sessionStorage.setItem(KEY, '/files/Old');
  open(`/sign-in?from=${encodeURIComponent(paths[1] + '#discard')}`);
  await screen.findByRole('button', { name: 'Continue with Google' });
  expect(sessionStorage.getItem(KEY)).toBe(paths[1]);
  cleanup();
  const app = open('/sign-in?signin=failed');
  await screen.findByRole('alert');
  expect(sessionStorage.getItem(KEY)).toBe(paths[1]);
  await app.signIn();
  await screen.findByRole('heading', { name: 'Files' });
  expect(window.location.pathname + window.location.search).toBe(paths[1]);
});

for (const value of ['', 'https://example.com', '//example.com', '/\\example.com', '/\texample.com', '/\nexample.com', '/a b', '/a\x7f']) {
  it.each(['query', 'storage'])(`rejects unsafe ${JSON.stringify(value)} from %s`, async (where) => {
    sessionStorage.setItem(KEY, where === 'storage' ? value : paths[0]);
    open(where === 'query' ? `/sign-in?from=${encodeURIComponent(value)}` : '/', ALEX);
    await screen.findByRole('heading', { name: 'Home' });
    expect(window.location.pathname).toBe('/');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
}

// R-self-return: a signed-out-only page is no destination, so a signed-in visitor lands on Home.
for (const value of ['/sign-in', '/sign-in?from=%2Ffiles%2FProjects', '/landing/']) {
  it.each(['query', 'storage at /sign-in', 'storage at /'])(`treats ${value} from %s as no destination`, async (where) => {
    if (where !== 'query') sessionStorage.setItem(KEY, value);
    open(where === 'query' ? `/sign-in?from=${encodeURIComponent(value)}` : where.endsWith('/sign-in') ? '/sign-in' : '/', ALEX);
    await screen.findByRole('heading', { name: 'Home' });
    expect(window.location.pathname + window.location.search).toBe('/');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
}

it.each(['/privacy', '/terms'])('legal %s stays directly accessible signed out and in', async (path) => {
  for (const user of [null, ALEX]) {
    sessionStorage.setItem(KEY, paths[0]);
    open(path, user);
    await screen.findByRole('heading', { level: 1 });
    expect(window.location.pathname).toBe(path);
    if (user) expect(sessionStorage.getItem(KEY)).toBeNull();
    cleanup();
  }
});

for (const path of ['/', '/privacy', '/terms', '/sign-in?from=%2Ffiles%2FProjects']) {
  it(`missing folder wins at ${path} and discards the return`, async () => {
    sessionStorage.setItem(KEY, paths[0]);
    open(path, ALEX, 'missing');
    await screen.findByRole('heading', { name: 'Welcome' });
    expect(window.location.pathname).toBe('/welcome');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
  it(`elsewhere wins at ${path}, discards return, and takeover stays at the requested page`, async () => {
    sessionStorage.setItem(KEY, paths[0]);
    let active = false;
    const place: PlaceSource = {
      state: () => active ? 'active' : 'elsewhere', start: async () => 'elsewhere',
      useHere: async () => { active = true; }, subscribe: () => () => undefined, pageOnly: () => false,
    };
    const app = open(path, ALEX, 'ready', place);
    const use = await screen.findByRole('button', { name: 'Use here' });
    expect(app.sources.session.folderState).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    await act(async () => use.click());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use here' })).toBeNull());
    expect(window.location.pathname).toBe(path.startsWith('/sign-in') ? '/' : path);
  });
}

it('unresolved authentication and folder state expose no content or return navigation', async () => {
  sessionStorage.setItem(KEY, paths[0]);
  const sources = loadingSources();
  const view = render(<DataProvider sources={sources}><App /></DataProvider>);
  expect(screen.queryByRole('heading')).toBeNull();
  view.unmount();
  sources.session.current = async () => ALEX;
  render(<DataProvider sources={sources}><App /></DataProvider>);
  await act(async () => undefined);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(sessionStorage.getItem(KEY)).toBe(paths[0]);
});

it('sign-out cleanup removes the pending destination', () => {
  sessionStorage.setItem(KEY, paths[0]);
  forgetThisPerson();
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

it('storage failures are logged and authentication falls back to Home', async () => {
  const error = new Error('storage blocked');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw error; });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw error; });
  open('/', ALEX);
  await screen.findByRole('heading', { name: 'Home' });
  expect(logged).toHaveBeenCalledWith(error);
});

it('an invalid explicit return clears an old destination before signing in', async () => {
  sessionStorage.setItem(KEY, paths[0]);
  const app = open('/sign-in?from=%2F%2Fexample.com');
  await screen.findByRole('button', { name: 'Continue with Google' });
  expect(sessionStorage.getItem(KEY)).toBeNull();
  await app.signIn();
  await screen.findByRole('heading', { name: 'Home' });
});

// R-home-query: a Home destination that differs only in its query still renders Home.
it.each(['/', '/sign-in'])('callback at %s returning to /?view=list renders Home with that query', async (path) => {
  sessionStorage.setItem(KEY, '/?view=list');
  open(path, ALEX);
  await act(async () => undefined);
  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe('/?view=list');
  expect(sessionStorage.getItem(KEY)).toBeNull();
});
