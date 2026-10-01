/**
 * The run history's "when Bower filed it" by path (`file-origin.ts#
 * filedHistory`, R-API-3, #922), read from `GET /runs` once per tab and
 * shared by every screen that says who filed a file (a file's About, the
 * folder preview). Read again after a run completes (the shared titles are
 * forgotten at that moment too, `cache.ts#invalidateOnRunComplete`). Empty
 * until the answer arrives and when the read fails (the screens then fall
 * back to the file's own times); the failure goes to the console.
 */

import { useEffect, useState } from 'preact/hooks';

import { getRuns } from '../api.js';
import { filedHistory } from '../file-origin.js';
import { onTitlesForgotten } from '../note-titles.js';

const EMPTY: ReadonlyMap<string, string> = new Map();

let known: ReadonlyMap<string, string> | null = null;
let reading: Promise<ReadonlyMap<string, string>> | null = null;

function readHistory(): Promise<ReadonlyMap<string, string>> {
  reading ??= getRuns().then(
    ({ runs }) => {
      known = filedHistory(runs);
      return known;
    },
    (err: unknown) => {
      console.error('Could not read the run history', err);
      reading = null;
      return EMPTY;
    },
  );
  return reading;
}

onTitlesForgotten(() => {
  known = null;
  reading = null;
});

/** When each file a run filed was filed, by path; empty while it loads. */
export function useFiledHistory(): ReadonlyMap<string, string> {
  const [history, setHistory] = useState<ReadonlyMap<string, string>>(
    () => known ?? EMPTY,
  );
  // A run completed: read the history again (the module forgot it first,
  // as it subscribed before any screen did).
  const [version, setVersion] = useState(0);
  useEffect(() => onTitlesForgotten(() => setVersion((n) => n + 1)), []);
  useEffect(() => {
    let cancelled = false;
    void readHistory().then((read) => {
      if (!cancelled) setHistory(read);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);
  return history;
}
