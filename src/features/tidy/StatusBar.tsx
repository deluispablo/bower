import { usePiles, useRun, useTree } from '@/data/provider';
import { countFiles } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { clock, plural } from '@/app/words';
import { BowerHead } from '@/ui/Icon';
import { isRunning, runShort } from './run-words';
import s from './tidy.module.css';

/** The desktop's bottom line: the tidy-up, what waits, how much there is. */
export function StatusBar() {
  const { data: run } = useRun();
  const { data: piles } = usePiles();
  const { data: tree } = useTree();
  const { setTidy, startReplay } = useUi();
  const waiting = (piles ?? []).reduce((n, p) => n + p.items.length, 0);
  const total = (tree ?? []).reduce((n, r) => n + countFiles(r), 0);
  const running = isRunning(run);
  let left: string;
  if (running && run) left = runShort(run);
  else if (run?.phase === 'done' && !run.seen) left = `${runShort(run)}. Watch what Bower did`;
  else if (run?.phase === 'done') left = `Last tidy-up ${clock(run.finishedAt ?? run.phaseAt)}. ${waiting ? `${plural(waiting, 'thing')} waiting` : 'Nothing waiting'}`;
  else left = waiting ? `${plural(waiting, 'thing')} waiting` : 'Nothing waiting';
  return (
    <footer className={s.status}>
      <button type="button" className={s.statusBtn} onClick={() => (run?.phase === 'done' && !run.seen ? startReplay(run.id) : setTidy(true))}>
        {running ? <span className={s.live} /> : <BowerHead size={16} />}
        {left}
      </button>
      <span className={s.statusRight}>
        <span>{plural(total, 'thing')}</span>
        <span>Synced with your Drive</span>
      </span>
    </footer>
  );
}
