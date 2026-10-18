import { useInbox, useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { replayWaiting, isRunning, runShort, stoppedUnseen, watchLine } from './run-words';
import s from './tidy.module.css';

/**
 * Tidy up says what it does, in words: an icon alone did not. On the
 * desktop it sits at the top right, always in reach; it becomes the run's
 * status while one goes, and "Watch what Bower did" when a result has not been seen.
 */
export function TidyButton() {
  const { data: run } = useRun();
  const { waiting } = useInbox();
  const { setTidy, startReplay } = useUi();
  if (run && isRunning(run))
    return (
      <button type="button" className={`${s.tidyBtn} ${s.tidyBusy}`} onClick={() => setTidy(true)}>
        <span className={s.live} />
        {runShort(run)}
      </button>
    );
  if (run && stoppedUnseen(run))
    return (
      <button type="button" className={`${s.tidyBtn} ${s.tidyStopped}`} onClick={() => setTidy(true)}>
        The tidy-up stopped. See why
      </button>
    );
  if (run && replayWaiting(run))
    return (
      <button type="button" className={s.tidyBtn} onClick={() => startReplay(run.id)}>
        {watchLine(run)}
      </button>
    );
  return (
    <button type="button" className={s.tidyBtn} disabled={!waiting} onClick={() => setTidy(true)} title={waiting ? undefined : 'Nothing waiting in the inbox'}>
      Tidy up{waiting ? ` ${waiting}` : ''}
    </button>
  );
}
