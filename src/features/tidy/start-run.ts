import { useRef, useState } from 'react';
import type { RunSource } from '@/data/sources';
import type { RunState } from '@/data/types';
import { useSources } from '@/data/provider';
import { usePrefs } from '@/app/prefs';

/** Starts a tidy-up with the person's choice about the web (Settings, off unless turned on). */
function startRun(runs: RunSource, scope: 'all' | 'instructions'): Promise<RunState> {
  return runs.start(scope, { allowWeb: usePrefs.getState().lookUpWeb });
}

/**
 * Every button that starts a tidy-up: `busy` while it starts ("Starting…", aria-disabled so focus stays). A ref, so two
 * presses in one render start once; while busy `start` returns undefined and calls nothing. The caller keeps its own
 * error message (the pending flag lives here, as React's useTransition isPending; the error stays with the caller).
 */
export function useStartRun(): { busy: boolean; start: (scope: 'all' | 'instructions') => Promise<RunState> | undefined } {
  const { runs } = useSources();
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const start = (scope: 'all' | 'instructions'): Promise<RunState> | undefined => {
    if (starting.current) return undefined;
    starting.current = true;
    setBusy(true);
    return startRun(runs, scope).finally(() => {
      starting.current = false;
      setBusy(false);
    });
  };
  return { busy, start };
}
