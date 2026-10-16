import { useEffect, useRef } from 'react';
import { useRun, useSources } from '@/data/provider';
import { waitingIn } from '@/data/piles';
import { useUi } from '@/app/ui-store';
import { toast, useToasts } from '@/ui/toast';
import { usePrefs } from '@/app/prefs';
import { hasReplay, runTitle } from './run-words';

/** Says so when a run ends while its sheet is hidden. */
export function useRunWatcher(): void {
  const { data: run } = useRun();
  const { runs } = useSources();
  const last = useRef<string | null>(null);
  // While "Tidy up now" is shown, the inbox is read (again on each vault change); once nothing waits, the message goes.
  // Keyed by the message, so an answer to a read made for an older one never decides for a newer one.
  const { vault } = useSources();
  const offer = useToasts((t) => t.list.findLast((x) => x.action?.label === 'Tidy up now')?.id);
  useEffect(() => {
    if (offer === undefined) return;
    let latest = 0; // only the newest read decides
    const read = () => {
      const n = ++latest;
      vault.piles().then(
        // The store is checked now: a newer message may have shown before this effect was cleaned up.
        (piles) => { if (n === latest && !waitingIn(piles) && useToasts.getState().list.findLast((x) => x.action?.label === 'Tidy up now')?.id === offer) useToasts.getState().dismissAction('Tidy up now'); },
        (e: unknown) => { if (n === latest) console.error(e); }, // no data, no decision: the offer stays
      );
    };
    read();
    const off = vault.subscribe(read);
    return () => { latest = -1; off(); };
  }, [offer, vault]);
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
