import { LoadError } from '@/ui/LoadError';
import { useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { PoseBower } from '@/bird/Bower';
import { replayWaiting, isRunning, PHASE_POSE, runShort, stoppedUnseen } from './run-words';
import s from './tidy.module.css';

/** On a phone, a hidden run lives in a chip above the tab bar. */
export function RunChip() {
  const runState = useRun();
  const { data: run } = runState;
  const { tidyOpen, setTidy, startReplay, replayRunId } = useUi();
  if (tidyOpen || replayRunId) return null;
  if (runState.error) return <div className={`${s.chip} ${s.chipError}`}><LoadError state={runState} /></div>;
  if (!run) return null;
  const running = isRunning(run);
  const unseen = replayWaiting(run);
  const stopped = stoppedUnseen(run);
  if (!running && !unseen && !stopped) return null;
  return (
    <button type="button" className={`${s.chip} ${unseen ? s.chipDone : ''} ${stopped ? s.chipStopped : ''}`} onClick={() => (unseen ? startReplay(run.id) : setTidy(true))}>
      <PoseBower pose={PHASE_POSE[run.phase]} size={34} />
      {unseen ? `${runShort(run)}. Watch` : stopped ? 'The tidy-up stopped. See why' : runShort(run)}
    </button>
  );
}
