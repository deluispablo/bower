/**
 * `/search?q=...`: no screen of its own. It only opens the quick switcher
 * (#142), prefilled from `q` when present, then replaces itself with Home —
 * so a link built before the switcher existed (a note's tag pills,
 * `/search?q=%23tag`, #144) keeps working, and Back never returns here.
 */

import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { openSwitcher } from '../switcher-store.js';

export function SearchRedirect() {
  const { query, route } = useLocation();

  // Runs once, on the query this navigation landed with.
  useEffect(() => {
    openSwitcher(query.q ?? '');
    route('/', true);
  }, []);

  return null;
}
