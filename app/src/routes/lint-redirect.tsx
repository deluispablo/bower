/**
 * `/lint`: the Health screen's old address (spec §14, audit finding 10).
 * No screen of its own — it replaces itself with `/health` at once, the
 * same one-shot pattern as `search.tsx`'s `/search` redirect, so a link or
 * bookmark built before the rename keeps working and Back never returns
 * here.
 */

import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { HEALTH_PATH } from '../components/explorer.js';

export function LintRedirect() {
  const { route } = useLocation();

  // Runs once, on the navigation that landed here.
  useEffect(() => {
    route(HEALTH_PATH, true);
  }, []);

  return null;
}
