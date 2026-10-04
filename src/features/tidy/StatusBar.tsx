import { usePiles, useRun, useTree } from '@/data/provider';
import { waitingIn } from '@/data/piles';
import { countFiles } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { BowerHead } from '@/ui/Icon';
import { replayWaiting, isRunning, runShort, statusLine, stoppedUnseen } from './run-words';
import s from './tidy.module.css';

/** The desktop's bottom line: the tidy-up, what waits, how much there is. */
export function StatusBar() {
  const { data: run } = useRun();
  const { data: piles } = usePiles();
  const { data: tree } = useTree();
  const { setTidy, startReplay } = useUi();
  const waiting = waitingIn(piles);
  const total = (tree ?? []).reduce((n, r) => n + countFiles(r), 0);
  const running = isRunning(run);
  let left: string;
  if (running && run) left = runShort(run);
  else if (run && stoppedUnseen(run)) left = 'The tidy-up stopped. See why';
  else if (run && replayWaiting(run)) left = `${runShort(run)}. Watch what Bower did`;
  else left = statusLine(run, piles === undefined ? undefined : waiting);
  return (
    <footer className={s.status}>
      <button type="button" className={s.statusBtn} onClick={() => (run && replayWaiting(run) ? startReplay(run.id) : setTidy(true))}>
        {running ? <span className={s.live} /> : stoppedUnseen(run) ? <span className={s.stopDot} /> : <BowerHead size={16} />}
        {left}
      </button>
      <span className={s.statusRight}>
        {tree === undefined ? (
          <span>Opening your Bower folder…</span>
        ) : (
          <>
            <span>{plural(total, 'thing')}</span>
            <span>Synced with your Drive</span>
          </>
        )}
      </span>
    </footer>
  );
}
