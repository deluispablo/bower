import type { RunSource } from '@/data/sources';
import type { RunState } from '@/data/types';
import { usePrefs } from '@/app/prefs';

/** Starts a tidy-up with the person's choice about the web (Settings, off unless turned on). */
export function startRun(runs: RunSource, scope: 'all' | 'instructions'): Promise<RunState> {
  return runs.start(scope, { allowWeb: usePrefs.getState().lookUpWeb });
}
