import { useEffect, useRef } from 'react';
import { useRun, useSources } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { toast, useToasts } from '@/ui/toast';
import { usePrefs } from '@/app/prefs';
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
    if (run.phase !== 'done' && run.phase !== 'failed') useToasts.getState().dismissAction('Tidy up now');
    if (!before || before === key || !before.startsWith(`${run.id}:`)) return;
    // In the background, a notification says it ended (when the person asked for one).
    if ((run.phase === 'done' || run.phase === 'failed') && document.hidden && usePrefs.getState().notifyRuns && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Bower', { body: runTitle(run), icon: '/favicon.svg' });
    }
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
