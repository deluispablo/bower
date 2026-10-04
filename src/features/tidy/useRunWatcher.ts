import { useEffect, useRef } from 'react';
import { useRun, useSources } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { toast } from '@/ui/toast';
import { hasReplay, runTitle } from './run-words';

/** Says so when a run ends while its sheet is hidden. */
export function useRunWatcher(): void {
  const { data: run } = useRun();
  const { runs } = useSources();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!run) return;
    const key = `${run.id}:${run.phase}`;
    const before = last.current;
    last.current = key;
    if (!before || before === key || !before.startsWith(`${run.id}:`)) return;
    if (run.phase === 'done' && !hasReplay(run)) {
      // Nothing to replay (a run that only read your changes): say so, and it is
      // seen. With the sheet open, the sheet shows it and marks it seen on close.
      if (useUi.getState().tidyOpen) return;
      toast(runTitle(run));
      void runs.markSeen(run.id);
      return;
    }
    if ((run.phase === 'done' || run.phase === 'failed') && !useUi.getState().tidyOpen) {
      toast(runTitle(run), run.phase === 'done' ? { label: 'Watch', run: () => useUi.getState().startReplay(run.id) } : { label: 'See why', run: () => useUi.getState().setTidy(true) });
    }
  }, [run, runs]);
}
