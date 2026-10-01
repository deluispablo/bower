// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { LocationProvider, useLocation } from 'preact-iso';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderState } from '../src/folder-state.js';
import { ApiError, getMe } from '../src/api.js';
import type { Me } from '../src/api.js';
import { bootState } from '../src/boot-screen.js';
import { loadCachedMe } from '../src/cache.js';
import { markIntroSeen } from '../src/intro.js';
import {
  SessionProvider,
  decideRedirect,
  offlineMe,
  useSession,
} from '../src/session.js';
import type { Session } from '../src/session.js';

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  getMe: vi.fn(),
}));
vi.mock('../src/boot-screen.js', () => ({ bootState: vi.fn() }));
vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadCachedMe: vi.fn(),
  saveCachedMe: vi.fn(),
  setIndexFolder: vi.fn(),
  invalidateIndex: vi.fn(),
}));
vi.mock('../src/forget.js', () => ({ default: vi.fn() }));
vi.mock('../src/folder-state.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/folder-state.js')>()),
  folderState: vi.fn(() => Promise.resolve('ok')),
}));
vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  watchFolder: vi.fn(),
}));

// Components are UI smoke only when cheap; `decideRedirect` is the pure
// logic that decides routing on load, so it is unit-tested directly.
describe('decideRedirect', () => {
  it('sends a signed-out user to /login', () => {
    expect(decideRedirect('signed-out', false, '/')).toBe('/login');
  });

  it('sends a signed-in user with no vault to /onboarding', () => {
    expect(decideRedirect('signed-in', false, '/')).toBe('/onboarding');
  });

  it('leaves a signed-in user with a vault on the current path', () => {
    expect(decideRedirect('signed-in', true, '/settings')).toBeNull();
  });

  it('sends a signed-in user with a vault away from /login', () => {
    expect(decideRedirect('signed-in', true, '/login')).toBe('/');
  });

  it('never redirects away from the public /not-invited path', () => {
    expect(decideRedirect('signed-out', false, '/not-invited')).toBeNull();
    expect(decideRedirect('signed-in', false, '/not-invited')).toBeNull();
  });

  it('never redirects away from the public /privacy path', () => {
    expect(decideRedirect('signed-out', false, '/privacy')).toBeNull();
    expect(decideRedirect('signed-in', false, '/privacy')).toBeNull();
    expect(decideRedirect('signed-in', true, '/privacy')).toBeNull();
  });

  it('does not redirect while loading', () => {
    expect(decideRedirect('loading', false, '/')).toBeNull();
  });

  it('does not loop when already at the target', () => {
    expect(decideRedirect('signed-out', false, '/login')).toBeNull();
    expect(decideRedirect('signed-in', false, '/onboarding')).toBeNull();
  });

  // #207: a signed-out visitor who has never seen the intro lands on
  // /welcome from /, but not from a deep link, and /welcome is never
  // redirected away from either way.
  it('sends a signed-out visitor who has not seen the intro to /welcome from /', () => {
    expect(decideRedirect('signed-out', false, '/', false)).toBe('/welcome');
  });

  // #313, 6.3.2: /login is the way out of the intro, never a way in — a
  // sign-in link or a reload of the sign-in page must never show the
  // intro instead of the sign-in form.
  it('never redirects /login to the intro, seen or not', () => {
    expect(decideRedirect('signed-out', false, '/login', false)).toBeNull();
    expect(decideRedirect('signed-out', false, '/login', true)).toBeNull();
  });

  it('never sends a deep link to /welcome, even unseen', () => {
    expect(decideRedirect('signed-out', false, '/note/id-1', false)).toBe(
      '/login',
    );
    expect(
      decideRedirect('signed-out', false, '/not-invited', false),
    ).toBeNull();
  });

  it('leaves a signed-out visitor who has seen the intro alone', () => {
    expect(decideRedirect('signed-out', false, '/', true)).toBe('/login');
  });

  it('never redirects away from /welcome itself, signed in or out', () => {
    expect(decideRedirect('signed-out', false, '/welcome', false)).toBeNull();
    expect(decideRedirect('signed-in', true, '/welcome')).toBeNull();
    expect(decideRedirect('signed-in', false, '/welcome')).toBeNull();
  });

  // R-LEARN-1: Learn Bower is public, a prefix match.
  it('never redirects /learn or an example page, signed in with no folder or out', () => {
    for (const path of ['/learn', '/learn/flat-hunting']) {
      expect(decideRedirect('signed-out', false, path, false)).toBeNull();
      expect(decideRedirect('signed-in', false, path)).toBeNull();
      expect(decideRedirect('signed-in', true, path)).toBeNull();
    }
    expect(decideRedirect('signed-in', false, '/learning')).toBe('/onboarding');
  });

  // #193: the demo signs in as Alex from the very first load (`getMe()`
  // always answers signed in, `demo/api.ts`), so without this check a
  // first-time visitor would skip the intro and "Run your own Bower"
  // entirely and land straight in the app.
  describe('in a demo build', () => {
    it('sends a first-time visitor to /welcome from / even though already signed in', () => {
      expect(decideRedirect('signed-in', true, '/', false, true)).toBe(
        '/welcome',
      );
    });

    // #313: /login never redirects to the intro, in the demo either — it
    // renders "Run your own Bower" there instead (`app.tsx`).
    it('never redirects /login to the intro, even unseen', () => {
      expect(
        decideRedirect('signed-in', true, '/login', false, true),
      ).toBeNull();
    });

    it('goes home once the intro has been seen (Skip or Try the demo)', () => {
      expect(decideRedirect('signed-in', true, '/', true, true)).toBeNull();
    });

    // #287: the tour's last step links to /login, which a demo build
    // renders as "Run your own Bower" (`app.tsx`), not a sign-in form. A
    // signed-in-as-Alex visitor who already saw the intro must be able to
    // land there instead of bouncing back to Home.
    it('leaves /login alone once the intro has been seen', () => {
      expect(
        decideRedirect('signed-in', true, '/login', true, true),
      ).toBeNull();
    });

    it('never sends a deep link to /welcome, even unseen', () => {
      expect(
        decideRedirect('signed-in', true, '/note/id-1', false, true),
      ).toBeNull();
    });

    it('does not apply outside a demo build', () => {
      expect(decideRedirect('signed-in', true, '/', false, false)).toBeNull();
    });
  });
});

// R-VAULT-2: a missing, trashed or unreachable Bower folder.
describe('decideRedirect with the folder state', () => {
  const at = (path: string, folder: FolderState, query = ''): string | null =>
    decideRedirect('signed-in', true, path, true, false, folder, query);

  it.each(['missing', 'trashed', 'no-access'] as const)(
    'sends %s to /recover from Home, with no Home paint first',
    (folder) => {
      expect(at('/', folder)).toBe(`/recover?reason=${folder}`);
      expect(at('/notes', folder)).toBe(`/recover?reason=${folder}`);
    },
  );

  it('leaves ok and unknown where they are', () => {
    expect(at('/', 'ok')).toBeNull();
    expect(at('/', 'unknown')).toBeNull();
  });

  it('stays on /recover when the reason in the query matches', () => {
    expect(at('/recover', 'trashed', 'reason=trashed')).toBeNull();
    expect(at('/recover', 'trashed', '?reason=trashed')).toBeNull();
  });

  it('corrects a /recover reason that does not match the state', () => {
    expect(at('/recover', 'missing', 'reason=trashed')).toBe(
      '/recover?reason=missing',
    );
    expect(at('/recover', 'no-access')).toBe('/recover?reason=no-access');
  });

  it('sends /recover to / when the folder is ok or unknown', () => {
    expect(at('/recover', 'ok', 'reason=trashed')).toBe('/');
    expect(at('/recover', 'unknown', 'reason=trashed')).toBe('/');
  });

  it('never sends /recover to /onboarding', () => {
    expect(
      decideRedirect('signed-in', false, '/recover', true, false, 'missing'),
    ).toBe('/');
  });

  it('leaves the public paths alone', () => {
    expect(at('/privacy', 'missing')).toBeNull();
  });
});

describe('offlineMe (R-VAULT-13)', () => {
  const cached = { email: 'you@example.com', vault: null } as unknown as Me;
  const network = new ApiError(0, 'network', 'Could not reach the server.');

  it('keeps the cached me when the network is out', () => {
    expect(offlineMe(network, false, cached)).toBe(cached);
    expect(offlineMe(network, true, cached)).toBe(cached);
    expect(offlineMe(new TypeError('x'), false, cached)).toBe(cached);
  });

  it('never covers for a 401 or a server answer while online', () => {
    expect(
      offlineMe(new ApiError(401, 'reauth', 'x'), false, cached),
    ).toBeUndefined();
    expect(
      offlineMe(new ApiError(500, 'boom', 'x'), true, cached),
    ).toBeUndefined();
  });

  it('has nothing to show without a cached me', () => {
    expect(offlineMe(network, false, undefined)).toBeUndefined();
  });
});

describe('SessionProvider on load (#985, R-BOOT-14)', () => {
  const me = {
    email: 'you@example.com',
    vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
    quota: { used: 0, limit: 10 },
    needsReauth: false,
    hasApiKey: false,
  } as Me;
  const getMeMock = vi.mocked(getMe);
  const cachedMe = vi.mocked(loadCachedMe);
  const bootStateMock = vi.mocked(bootState);

  let root: HTMLElement;
  let session: Session | undefined;
  let path = '';

  function Probe(): null {
    session = useSession();
    path = useLocation().path;
    return null;
  }

  async function mount(at: string): Promise<void> {
    history.replaceState(null, '', at);
    await act(() => {
      render(
        h(LocationProvider, null, h(SessionProvider, null, h(Probe, null))),
        root,
      );
    });
    // Let the `/me` answer, the state update and the redirect settle.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  beforeEach(() => {
    root = document.createElement('div');
    document.body.append(root);
    session = undefined;
    localStorage.clear();
    sessionStorage.clear();
    cachedMe.mockReturnValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    render(null, root);
    root.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('stays loading and shows the error state on a network failure with nothing saved', async () => {
    getMeMock.mockRejectedValue(new ApiError(0, 'network', 'x'));
    await mount('/');
    expect(session?.status).toBe('loading');
    expect(bootStateMock).toHaveBeenCalledWith('error');
    expect(console.error).toHaveBeenCalled();
    expect(path).toBe('/');
  });

  it('stays loading and shows the error state on a server error with nothing saved', async () => {
    getMeMock.mockRejectedValue(new ApiError(500, 'boom', 'x'));
    await mount('/settings');
    expect(session?.status).toBe('loading');
    expect(bootStateMock).toHaveBeenCalledWith('error');
    expect(path).toBe('/settings');
  });

  it('shows the offline state when the device is offline with nothing saved', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    getMeMock.mockRejectedValue(new ApiError(0, 'network', 'x'));
    await mount('/');
    expect(session?.status).toBe('loading');
    expect(bootStateMock).toHaveBeenCalledWith('offline');
  });

  it('opens the shell offline from the saved me, as before', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    getMeMock.mockRejectedValue(new ApiError(0, 'network', 'x'));
    cachedMe.mockReturnValue(me);
    await mount('/');
    expect(session?.status).toBe('signed-in');
    expect(session?.offline).toBe(true);
    expect(bootStateMock).not.toHaveBeenCalled();
    expect(path).toBe('/');
  });

  it('hands a 401 over to /login, as before', async () => {
    markIntroSeen(localStorage);
    getMeMock.mockRejectedValue(new ApiError(401, 'unauthorized', 'x'));
    await mount('/');
    expect(session?.status).toBe('signed-out');
    expect(bootStateMock).not.toHaveBeenCalled();
    expect(path).toBe('/login');
  });

  it('hands a first-time 401 over to /welcome, as before', async () => {
    getMeMock.mockRejectedValue(new ApiError(401, 'unauthorized', 'x'));
    await mount('/');
    expect(session?.status).toBe('signed-out');
    expect(path).toBe('/welcome');
  });

  it('never covers a 401 with the saved me', async () => {
    markIntroSeen(localStorage);
    cachedMe.mockReturnValue(me);
    getMeMock.mockRejectedValue(new ApiError(401, 'unauthorized', 'x'));
    await mount('/');
    expect(session?.status).toBe('signed-out');
    expect(path).toBe('/login');
  });

  it('keeps "not invited" on /not-invited with the address, as before', async () => {
    getMeMock.mockResolvedValue({
      notInvited: true,
      email: 'you@example.com',
    });
    await mount('/not-invited');
    expect(session?.status).toBe('signed-out');
    expect(session?.notInvitedEmail).toBe('you@example.com');
    expect(bootStateMock).not.toHaveBeenCalled();
    expect(path).toBe('/not-invited');
  });
});
