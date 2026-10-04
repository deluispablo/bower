import { useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { PoseBower } from '@/bird/Bower';
import { isRunning, PHASE_POSE, runShort } from './run-words';
import s from './tidy.module.css';

/** On a phone, a hidden run lives in a chip above the tab bar. */
export function RunChip() {
  const { data: run } = useRun();
  const { tidyOpen, setTidy, startReplay, replayRunId } = useUi();
  if (!run || tidyOpen || replayRunId) return null;
  const running = isRunning(run);
  const unseen = run.phase === 'done' && !run.seen;
  if (!running && !unseen && run.phase !== 'failed') return null;
  if (run.phase === 'failed' && run.seen) return null;
  return (
    <button type="button" className={`${s.chip} ${unseen ? s.chipDone : ''}`} onClick={() => (unseen ? startReplay(run.id) : setTidy(true))}>
      <PoseBower pose={PHASE_POSE[run.phase]} size={34} />
      {unseen ? `${runShort(run)}. Watch` : runShort(run)}
    </button>
  );
}
