/**
 * Session state: who is signed in, once per app load. Loaded with `getMe()`;
 * a 401 means signed out, any other failure keeps the user signed out with
 * a one-sentence error for the login screen (details go to `console.error`).
 *
 * Plain Preact context + hooks, no routing or state library.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { ApiError, getMe, isDemo, isNotInvited, logout } from './api.js';
import type { Me, NotInvitedMe } from './api.js';
import {
  invalidateIndex,
  loadCachedMe,
  saveCachedMe,
  setIndexFolder,
} from './cache.js';
import { driveFetch, folderNameOf, watchFolder } from './drive.js';
import forgetDevice from './forget.js';
import {
  FOLDER_FIELDS,
  FOLDER_RECHECK_MS,
  folderState,
} from './folder-state.js';
import type { FolderState } from './folder-state.js';
import { introSeen } from './intro.js';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  me?: Me;
  error?: string;
  /**
   * The address just turned away at sign-in, for the Not invited screen.
   * Only set from the Worker's one-time `/me` answer; never guessed.
   */
  notInvitedEmail?: string;
  /**
   * What the last check of the Bower folder found (R-VAULT-1). `ok` until a
   * check says otherwise, except that a folder the Worker already marked
   * missing starts as `missing`, so Home is never painted first.
   */
  folder?: FolderState;
  /**
   * The Bower folder's name as Drive reports it (R-VAULT-11), never the
   * stored `me.vault.name`. Unknown until the first check answers.
   */
  folderName?: string;
  /** `me` came from this device because the Worker was out of reach (R-VAULT-13). */
  offline?: boolean;
}

export interface Session extends SessionState {
  signOut: () => Promise<void>;
  /** Replaces `me` in place, e.g. once onboarding provisions a vault. */
  setMe: (me: Me) => void;
  /** Re-fetches `me` from the Worker and replaces it. */
  refresh: () => Promise<void>;
  /** Checks the Bower folder again and stores the result. */
  recheckFolder: () => Promise<FolderState>;
}

/** Reachable regardless of session status; never redirected away from. */
const PUBLIC_PATHS = new Set(['/not-invited', '/privacy', '/terms']);

/** The recovery screens' path (R-VAULT-3). */
export const RECOVER_PATH = '/recover';

/** Where a folder state sends the app, or `null` when it sends nowhere. */
function recoverTarget(folder: FolderState): string | null {
  return folder === 'missing' || folder === 'trashed' || folder === 'no-access'
    ? `${RECOVER_PATH}?reason=${folder}`
    : null;
}

/**
 * Whether `getMe()` has already answered once for this browser tab.
 * `sessionStorage` (not `localStorage`) on purpose: it survives a reload
 * but not a closed tab, which is exactly "previously signed in in this
 * tab" — the signal that a 401 means an expired or revoked session worth
 * forgetting the device for, rather than a plain visitor who was never
 * signed in here and has nothing on the device to forget.
 */
const HAD_SESSION_KEY = 'bower:had-session';

/**
 * The cached `me` to fall back on when `/me` fails (R-VAULT-13): only for a
 * failure that means "no network" (never a 401 or a server answer), and only
 * when one is cached. Pure.
 */
export function offlineMe(
  err: unknown,
  online: boolean,
  cached: Me | undefined,
): Me | undefined {
  if (cached === undefined) return undefined;
  if (err instanceof ApiError) {
    return err.status === 0 || (!online && err.status !== 401)
      ? cached
      : undefined;
  }
  return online ? undefined : cached;
}

/** Session state for a `/me` answer: signed in, or turned away at sign-in. */
function stateFromMe(me: Me | NotInvitedMe): SessionState {
  if (isNotInvited(me)) {
    return { status: 'signed-out', notInvitedEmail: me.email };
  }
  markHadSession();
  // Before anything reads the index: it is keyed by this folder (R-VAULT-9).
  setIndexFolder(me.vault?.folderId ?? null);
  saveCachedMe(me);
  return {
    status: 'signed-in',
    me,
    folder: me.vault?.missingAt !== undefined ? 'missing' : 'ok',
  };
}

function markHadSession(): void {
  try {
    sessionStorage.setItem(HAD_SESSION_KEY, '1');
  } catch {
    // Storage blocked: worst case a later 401 skips `forgetDevice()`.
  }
}

function hadSessionInThisTab(): boolean {
  try {
    return sessionStorage.getItem(HAD_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

function clearHadSessionMarker(): void {
  try {
    sessionStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Where the app should navigate given the session and the current path, or
 * `null` to stay put. Pure so the states are unit-testable without
 * rendering anything.
 *
 * `introHasBeenSeen` (#207) defaults to `true` so every existing call site
 * and test keeps its old behaviour unless it opts in; `SessionProvider`
 * below always passes the real `introSeen()` reading. `/welcome` itself is
 * always left alone: it is reachable signed out (the first-run intro) and
 * signed in (reopened from Settings), and never auto-redirected to for a
 * signed-in visitor — only the signed-out first visit sends someone there.
 *
 * `isDemoBuild` (#193) defaults to `isDemo()`, `SessionProvider` passes it
 * explicitly. The demo's `getMe()` answers as Alex, signed in, from the
 * very first load (`demo/api.ts`) — with no gate of its own that would
 * skip a first-time visitor straight past the intro and "Run your own
 * Bower" into the app. So this checks the intro-seen flag even while
 * already "signed in", the one case a signed-in visitor is still sent to
 * `/welcome`.
 *
 * `/login` itself is never redirected to the intro (#313, 6.3.2): only `/`
 * does, so a sign-in link or a reload of the sign-in page always lands on
 * the sign-in form (or, in a demo build, "Run your own Bower"), never on
 * the four-page intro — `/login` is the way out of it.
 *
 * `folder` (R-VAULT-2) is what the last check of the Bower folder found. A
 * missing, trashed or unreachable one sends a signed-in user to
 * `/recover?reason=…` from every screen but the public ones, so Home is never
 * painted over it. `/recover` is never sent to `/onboarding`; with the folder
 * `ok` or `unknown` it goes to `/`. `query` is the URL's query string (with
 * or without the `?`), read for the reason.
 */
export function decideRedirect(
  status: SessionStatus,
  hasVault: boolean,
  currentPath: string,
  introHasBeenSeen = true,
  isDemoBuild = isDemo(),
  folder: FolderState = 'ok',
  query = '',
): string | null {
  if (status === 'loading' || PUBLIC_PATHS.has(currentPath)) return null;
  if (currentPath === '/welcome') return null;
  if (isDemoBuild && !introHasBeenSeen && currentPath === '/') {
    return '/welcome';
  }
  if (status === 'signed-out') {
    if (!introHasBeenSeen && currentPath === '/') {
      return '/welcome';
    }
    return currentPath === '/login' ? null : '/login';
  }
  if (currentPath === RECOVER_PATH) {
    const target = hasVault ? recoverTarget(folder) : null;
    if (target === null) return '/';
    const asked = new URLSearchParams(query).get('reason');
    return asked === folder ? null : target;
  }
  if (!hasVault) {
    return currentPath === '/onboarding' ? null : '/onboarding';
  }
  const toRecover = recoverTarget(folder);
  if (toRecover !== null) return toRecover;
  // A demo build's `/login` is the "Run your own Bower" screen (`app.tsx`'s
  // route line), not a real sign-in form: once the intro has been seen, a
  // signed-in-as-Alex visitor following the tour's last link there must be
  // left alone rather than bounced back to Home.
  if (isDemoBuild && currentPath === '/login') return null;
  return currentPath === '/login' ? '/' : null;
}

const SessionContext = createContext<Session | undefined>(undefined);

interface SessionProviderProps {
  children: ComponentChildren;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const { path, route, query } = useLocation();
  const folderId = state.me?.vault?.folderId ?? null;
  const folderIdRef = useRef<string | null>(null);
  folderIdRef.current = folderId;
  const lastCheckRef = useRef(0);
  const followingRef = useRef(false);

  const recheckFolder = async (): Promise<FolderState> => {
    const id = folderIdRef.current;
    if (id === null || isDemo()) return 'ok';
    lastCheckRef.current = Date.now();
    let name: string | null = null;
    const found = await folderState(id, async (folderId) => {
      const response = await driveFetch(
        `/drive/v3/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent(FOLDER_FIELDS)}&supportsAllDrives=true`,
      );
      const file = (await response.json()) as unknown;
      name = folderNameOf(file);
      return file;
    });
    // `unknown` (offline, Drive down) never overrides what is already known.
    if (found !== 'unknown' && folderIdRef.current === id) {
      setState((prev) =>
        prev.status === 'signed-in'
          ? {
              ...prev,
              folder: found,
              ...(name !== null ? { folderName: name } : {}),
            }
          : prev,
      );
    }
    return found;
  };

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setState(stateFromMe(me));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          const wasSignedIn = hadSessionInThisTab();
          clearHadSessionMarker();
          setState({ status: 'signed-out' });
          // Session expired elsewhere or the user was removed: the device
          // may still hold that user's notes. A plain visitor who was
          // never signed in here has nothing to forget.
          if (wasSignedIn) void forgetDevice();
          return;
        }
        const cached = offlineMe(err, navigator.onLine, loadCachedMe());
        if (cached !== undefined) {
          // Offline is never "missing" or "signed out": keep the shell.
          setIndexFolder(cached.vault?.folderId ?? null);
          setState({
            status: 'signed-in',
            me: cached,
            folder: 'ok',
            offline: true,
          });
          return;
        }
        console.error(err);
        setState({
          status: 'signed-out',
          error: 'Could not reach the server.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const target = decideRedirect(
      state.status,
      state.me?.vault != null,
      path,
      introSeen(localStorage),
      isDemo(),
      state.folder ?? 'ok',
      query.reason !== undefined ? `reason=${query.reason}` : '',
    );
    if (target !== null) route(target);
  }, [state.status, state.me, state.folder, path, query.reason, route]);

  // R-VAULT-1: on load (in parallel with the listing) and on a new pointer.
  useEffect(() => {
    if (state.status === 'signed-in' && folderId !== null) {
      void recheckFolder();
    }
  }, [state.status, folderId]);

  // R-VAULT-9: a folder that is gone leaves no cached listing behind.
  useEffect(() => {
    if (state.folder === 'missing' || state.folder === 'trashed') {
      void invalidateIndex();
    }
  }, [state.folder]);

  // R-VAULT-10: `/drive/token` naming another folder means another tab or
  // device re-pointed: read `me` again and follow it.
  useEffect(() => {
    if (state.status !== 'signed-in' || folderId === null || isDemo()) {
      watchFolder(null, null);
      return;
    }
    watchFolder(folderId, () => {
      if (followingRef.current) return;
      followingRef.current = true;
      getMe()
        .then((me) => {
          setState(stateFromMe(me));
        })
        .catch((err: unknown) => {
          console.error(err);
        })
        .finally(() => {
          followingRef.current = false;
        });
    });
    return () => {
      watchFolder(null, null);
    };
  }, [state.status, folderId]);

  // R-VAULT-1: on focus after 10 minutes.
  useEffect(() => {
    function onFocus(): void {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastCheckRef.current < FOLDER_RECHECK_MS) return;
      void recheckFolder();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const signOut = async (): Promise<void> => {
    try {
      await logout();
    } catch (err) {
      console.error(err);
    }
    // Clear the device whether the logout request succeeded or not: the
    // Worker session cookie is what matters least here, the notes cached
    // on this device are what matters most. Also covers delete-account
    // (`routes/settings.tsx`), which calls `signOut()` once the account
    // itself is gone.
    clearHadSessionMarker();
    await forgetDevice();
    setState({ status: 'signed-out' });
    route('/login');
  };

  const setMe = (me: Me): void => {
    setState({ status: 'signed-in', me, folder: 'ok' });
  };

  const refresh = async (): Promise<void> => {
    setState(stateFromMe(await getMe()));
  };

  const value: Session = {
    ...state,
    signOut,
    setMe,
    refresh,
    recheckFolder,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (ctx === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
