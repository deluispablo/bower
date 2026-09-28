/**
 * `/search?q=...`: no screen of its own. It only opens the quick switcher
 * (#142), prefilled from `q` when present, then replaces itself with Home —
 * so a link built before the switcher existed (a note's tag pills,
 * `/search?q=%23tag`, #144) keeps working, and Back never returns here.
 *
 * `openSwitcher` runs from a microtask, not straight in this effect (#495):
 * `Switcher` (`components/switcher.tsx`) subscribes to the store from its
 * own mount effect, and on this route's first render both mount in the
 * same commit — calling `openSwitcher` inline can fire before `Switcher`
 * has subscribed, so the open is missed and nothing appears. Queuing it
 * lets every mount effect in the commit run first.
 */

import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { openSwitcher } from '../switcher-store.js';

export function SearchRedirect() {
  const { query, route } = useLocation();

  // Runs once, on the query this navigation landed with.
  useEffect(() => {
    const initialQuery = query.q ?? '';
    route('/', true);
    queueMicrotask(() => {
      openSwitcher(initialQuery);
    });
  }, []);

  return null;
}
