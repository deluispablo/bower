/**
 * Session state: who is signed in, once per app load. Loaded with `getMe()`;
 * a 401 means signed out, any other failure keeps the user signed out with
 * a one-sentence error for the login screen (details go to `console.error`).
 *
 * Plain Preact context + hooks, no routing or state library.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { ApiError, getMe, isDemo, isNotInvited, logout } from './api.js';
import type { Me, NotInvitedMe } from './api.js';
import forgetDevice from './forget.js';
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
}

export interface Session extends SessionState {
  signOut: () => Promise<void>;
  /** Replaces `me` in place, e.g. once onboarding provisions a vault. */
  setMe: (me: Me) => void;
  /** Re-fetches `me` from the Worker and replaces it. */
  refresh: () => Promise<void>;
}

/** Reachable regardless of session status; never redirected away from. */
const PUBLIC_PATHS = new Set(['/not-invited', '/privacy', '/terms']);

/**
 * Whether `getMe()` has already answered once for this browser tab.
 * `sessionStorage` (not `localStorage`) on purpose: it survives a reload
 * but not a closed tab, which is exactly "previously signed in in this
 * tab" — the signal that a 401 means an expired or revoked session worth
 * forgetting the device for, rather than a plain visitor who was never
 * signed in here and has nothing on the device to forget.
 */
const HAD_SESSION_KEY = 'bower:had-session';

/** Session state for a `/me` answer: signed in, or turned away at sign-in. */
function stateFromMe(me: Me | NotInvitedMe): SessionState {
  if (isNotInvited(me)) {
    return { status: 'signed-out', notInvitedEmail: me.email };
  }
  markHadSession();
  return { status: 'signed-in', me };
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
 */
export function decideRedirect(
  status: SessionStatus,
  hasVault: boolean,
  currentPath: string,
  introHasBeenSeen = true,
  isDemoBuild = isDemo(),
): string | null {
  if (status === 'loading' || PUBLIC_PATHS.has(currentPath)) return null;
  if (currentPath === '/welcome') return null;
  if (
    isDemoBuild &&
    !introHasBeenSeen &&
    (currentPath === '/' || currentPath === '/login')
  ) {
    return '/welcome';
  }
  if (status === 'signed-out') {
    if (
      !introHasBeenSeen &&
      (currentPath === '/' || currentPath === '/login')
    ) {
      return '/welcome';
    }
    return currentPath === '/login' ? null : '/login';
  }
  if (!hasVault) {
    return currentPath === '/onboarding' ? null : '/onboarding';
  }
  return currentPath === '/login' ? '/' : null;
}

const SessionContext = createContext<Session | undefined>(undefined);

interface SessionProviderProps {
  children: ComponentChildren;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const { path, route } = useLocation();

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
    );
    if (target !== null) route(target);
  }, [state.status, state.me, path, route]);

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
    setState({ status: 'signed-in', me });
  };

  const refresh = async (): Promise<void> => {
    setState(stateFromMe(await getMe()));
  };

  const value: Session = { ...state, signOut, setMe, refresh };

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
