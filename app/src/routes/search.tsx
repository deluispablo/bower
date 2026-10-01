/**
 * `/search?q=...`: no screen of its own. It opens Search (the switcher,
 * #142), prefilled from `q` when present, over the page the person came
 * from: a tag on a note links here (`/search?q=%23tag`, #917, R-SE-5), so
 * the route steps back to the note and Search opens over it; closing
 * Search shows the note again, and Back never returns here. Opened with no
 * page behind it (a fresh load of the link), it replaces itself with Home.
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

import { lastPage, openSwitcher } from '../switcher-store.js';

export function SearchRedirect(): null {
  const { query, route } = useLocation();

  // Runs once, on the query this navigation landed with.
  useEffect(() => {
    const initialQuery = query.q ?? '';
    if (lastPage() !== null) {
      // The page behind is the previous history entry: step back to it.
      history.back();
    } else {
      route('/', true);
    }
    queueMicrotask(() => {
      openSwitcher(initialQuery);
    });
  }, []);

  return null;
}
