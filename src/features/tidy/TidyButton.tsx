import { usePiles, useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { isRunning, runShort } from './run-words';
import s from './tidy.module.css';

/**
 * Tidy up says what it does, in words: an icon alone did not. On the
 * desktop it sits at the top right, always in reach; it becomes the run's
 * status while one goes, and "Watch" when a result has not been seen.
 */
export function TidyButton() {
  const { data: run } = useRun();
  const { data: piles } = usePiles();
  const { setTidy, startReplay } = useUi();
  const waiting = (piles ?? []).reduce((n, p) => n + p.items.length, 0);
  if (run && isRunning(run))
    return (
      <button type="button" className={`${s.tidyBtn} ${s.tidyBusy}`} onClick={() => setTidy(true)}>
        <span className={s.live} />
        {runShort(run)}
      </button>
    );
  if (run?.phase === 'done' && !run.seen)
    return (
      <button type="button" className={s.tidyBtn} onClick={() => startReplay(run.id)}>
        {runShort(run)}. Watch
      </button>
    );
  return (
    <button type="button" className={s.tidyBtn} disabled={!waiting} onClick={() => setTidy(true)} title={waiting ? undefined : 'Nothing waiting in the inbox'}>
      Tidy up{waiting ? ` ${waiting}` : ''}
    </button>
  );
}
