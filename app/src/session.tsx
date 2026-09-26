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

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  me?: Me;
  error?: string;
}

export interface Session extends SessionState {
  signOut: () => Promise<void>;
}

/** Reachable regardless of session status; never redirected away from. */
const PUBLIC_PATHS = new Set(['/not-invited']);

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
        setState({ status: 'signed-in', me });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ status: 'signed-out' });
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
    setState({ status: 'signed-out' });
    route('/login');
  };

  const value: Session = { ...state, signOut };

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
