import { LoadError } from '@/ui/LoadError';
import { useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { PoseBower } from '@/bird/Bower';
import { useLocation } from 'react-router';
import { replayWaiting, isRunning, PHASE_POSE, runShort, stoppedUnseen, watchLine } from './run-words';
import s from './tidy.module.css';

/** On a phone, a hidden run lives in a chip above the tab bar. */
export function RunChip() {
  const runState = useRun();
  const { data: run } = runState;
  const { tidyOpen, setTidy, startReplay, replayRunId } = useUi();
  const { pathname } = useLocation();
  if (tidyOpen || replayRunId) return null;
  if (runState.error) return <div className={`${s.chip} ${s.chipError}`}><LoadError state={runState} /></div>;
  if (!run) return null;
  const running = isRunning(run);
  const unseen = replayWaiting(run);
  const stopped = stoppedUnseen(run);
  // On Home the result card already offers the replay (qa6).
  if (!running && !stopped && (!unseen || pathname === '/')) return null;
  return (
    <button type="button" className={`${s.chip} ${stopped ? s.chipStopped : ''}`} onClick={() => (unseen ? startReplay(run.id) : setTidy(true))}>
      <PoseBower pose={PHASE_POSE[run.phase]} size={34} minor />
      {unseen ? watchLine(run) : stopped ? 'The tidy-up stopped. See why' : runShort(run)}
    </button>
  );
}
