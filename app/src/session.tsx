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

import { ApiError, getMe, logout } from './api.js';
import type { Me } from './api.js';
import forgetDevice from './forget.js';

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  me?: Me;
  error?: string;
}

export interface Session extends SessionState {
  signOut: () => Promise<void>;
  /** Replaces `me` in place, e.g. once onboarding provisions a vault. */
  setMe: (me: Me) => void;
  /** Re-fetches `me` from the Worker and replaces it. */
  refresh: () => Promise<void>;
}

/** Reachable regardless of session status; never redirected away from. */
const PUBLIC_PATHS = new Set(['/not-invited', '/privacy']);

/**
 * Whether `getMe()` has already answered once for this browser tab.
 * `sessionStorage` (not `localStorage`) on purpose: it survives a reload
 * but not a closed tab, which is exactly "previously signed in in this
 * tab" — the signal that a 401 means an expired or revoked session worth
 * forgetting the device for, rather than a plain visitor who was never
 * signed in here and has nothing on the device to forget.
 */
const HAD_SESSION_KEY = 'bower:had-session';

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
 * `null` to stay put. Pure so the four states are unit-testable without
 * rendering anything.
 */
export function decideRedirect(
  status: SessionStatus,
  hasVault: boolean,
  currentPath: string,
): string | null {
  if (status === 'loading' || PUBLIC_PATHS.has(currentPath)) return null;
  if (status === 'signed-out') {
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
        markHadSession();
        setState({ status: 'signed-in', me });
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
    const target = decideRedirect(state.status, state.me?.vault != null, path);
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
    const me = await getMe();
    markHadSession();
    setState({ status: 'signed-in', me });
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
