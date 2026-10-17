import { LoadError } from '@/ui/LoadError';
import { usePiles, useRun, useTree } from '@/data/provider';
import { waitingIn } from '@/data/piles';
import { countFiles } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { BowerHead } from '@/ui/Icon';
import { useOnline } from '@/ui/online';
import { replayWaiting, reportWaiting, isRunning, runShort, statusLine, stoppedUnseen, watchLine } from './run-words';
import s from './tidy.module.css';

/** The desktop's bottom line: the tidy-up, what waits, how much there is. */
export function StatusBar() {
  const runState = useRun();
  const { data: run } = runState;
  const { data: piles } = usePiles();
  const { data: tree } = useTree();
  const { setTidy, startReplay } = useUi();
  const online = useOnline();
  const waiting = waitingIn(piles);
  const total = (tree ?? []).reduce((n, r) => n + countFiles(r), 0);
  const running = isRunning(run);
  let left: string;
  if (running && run) left = runShort(run);
  else if (run && stoppedUnseen(run)) left = 'The tidy-up stopped. See why';
  else if (run && replayWaiting(run)) left = watchLine(run);
  else left = statusLine(run, piles === undefined ? undefined : waiting);
  return (
    <footer className={s.status}>
      {runState.error ? <LoadError state={runState} /> : <button type="button" className={s.statusBtn} onClick={() => (run && replayWaiting(run) ? startReplay(run.id) : setTidy(true, run && reportWaiting(run) ? run.id : undefined))}>
        {running ? <span className={s.live} /> : stoppedUnseen(run) ? <span className={s.stopDot} /> : <BowerHead size={16} />}
        {left}
      </button>}
      <span className={s.statusRight}>
        {tree === undefined ? (
          <span>Opening your Bower folder…</span>
        ) : (
          <>
            <span>{plural(total, 'thing')}</span>
            <span>{runState.error ? 'Latest update unavailable' : online ? 'Synced with your Drive' : 'Offline. Your changes wait here until you are back.'}</span>
          </>
        )}
      </span>
    </footer>
  );
}
