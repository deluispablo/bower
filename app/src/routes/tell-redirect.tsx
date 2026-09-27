/**
 * `/tell`: Tell Bower's old address (#317). The Bower tab replaced it, so it
 * has no screen of its own — it replaces itself with `/bower` at once,
 * query string and all (`?text=` prefills the box), the same one-shot
 * pattern as `lint-redirect.tsx`, so a link or bookmark built before the
 * tabs keeps working and Back never returns here.
 */

import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { BOWER_PATH } from '../shell-routes.js';

/** `/bower` with the same query string as the `/tell` link that led here. */
export function bowerUrlFor(query: Record<string, string>): string {
  const search = new URLSearchParams(query).toString();
  return search === '' ? BOWER_PATH : `${BOWER_PATH}?${search}`;
}

export function TellRedirect(): null {
  const { query, route } = useLocation();

  // Runs once, on the navigation that landed here.
  useEffect(() => {
    route(bowerUrlFor(query), true);
  }, []);

  return null;
}
