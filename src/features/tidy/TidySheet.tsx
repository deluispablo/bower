import { useState } from 'react';
import { thingsIn, waitingIn } from '@/data/piles';
import { usePiles, useRun, useSources } from '@/data/provider';
import { BowerError, RUN_STEPS, type RunState } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { plural } from '@/app/words';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { toast } from '@/ui/toast';
import { Icon } from '@/ui/Icon';
import { PoseBower } from '@/bird/Bower';
import { hasReplay, isRunning, runClock, runDetail, runTitle, stepLabel, stepState } from './run-words';
import { useNow } from './useNow';
import { TidyScene } from './TidyScene';
import s from './tidy.module.css';

/** The tidy-up: confirm, then the real phases, then the result. One sheet. */
export function TidySheet() {
  const { tidyOpen, setTidy } = useUi();
  const { data: run } = useRun();
  const running = isRunning(run);
  const showRun = !!run && (running || !run.seen);
  const { runs } = useSources();
  const { data: piles } = usePiles();
  const waiting = waitingIn(piles);
  const ask = waiting ? `Tidy up ${plural(waiting, 'thing')}?` : 'Nothing to tidy';
  const onOpenChange = (open: boolean): void => {
    // Closing on a finished run with nothing to replay: it has been seen.
    if (!open && run && run.phase === 'done' && !run.seen && !hasReplay(run)) void runs.markSeen(run.id);
    setTidy(open);
  };
  return (
    <Sheet open={tidyOpen} onOpenChange={onOpenChange} title={showRun && run ? runTitle(run) : ask} hideTitle className={s.sheet}>
      {showRun && run ? <RunView run={run} /> : <Confirm />}
    </Sheet>
  );
}

function Confirm() {
  const { data: piles } = usePiles();
  const { runs } = useSources();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = waitingIn(piles);
  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await runs.start('all');
    } catch (e) {
      setError(e instanceof BowerError ? e.message : 'The tidy-up did not start. Try again.');
      if (!(e instanceof BowerError)) console.error(e);
    } finally {
      setBusy(false);
    }
  };
  if (!piles) return <div className={s.stage} aria-busy="true" />;
  return (
    <div>
      <div className={s.stage}>
        <PoseBower pose={count ? 'idle' : 'sleep'} size={110} priority={1} />
      </div>
      {/* The dialog's own title says this to screen readers. */}
      <p className={s.title} aria-hidden="true">
        {count ? `Tidy up ${plural(count, 'thing')}?` : 'Nothing to tidy'}
      </p>
      <p className={s.detail}>
        {count
          ? 'Bower reads each one, names it, writes what matters into your notes and files it in your Drive. About 5 minutes; you can close the app.'
          : 'Add something and it waits in the inbox until the next tidy-up.'}
      </p>
      {count > 0 && (
        <ul className={s.piles}>
          {piles.map((p) => (
            <li key={p.id}>
              <Icon name={!p.items.length ? 'note' : p.text ? 'pile' : p.items[0]?.kind === 'link' ? 'link' : 'file'} size={18} />
              <span>{p.text || p.items[0]?.name}</span>
              <span className="muted">{thingsIn(p)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.actions}>
        {count === 0 && (
          <Button variant="ghost" block onClick={() => useUi.getState().setTidy(false)}>
            Close
          </Button>
        )}
        {count > 0 && (
          <>
            <Button variant="ghost" onClick={() => useUi.getState().setTidy(false)}>
              Not now
            </Button>
            <Button block onClick={() => void start()} disabled={busy}>
              {busy ? 'Starting…' : `Tidy up ${plural(count, 'thing')}`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RunView({ run }: { run: RunState }) {
  const now = useNow(isRunning(run));
  const { setTidy, startReplay } = useUi();
  const { runs } = useSources();
  return (
    <div>
      <TidyScene phase={run.phase} scope={run.scope} {...(run.report ? { filed: run.report.filed.length } : {})} />
      <div role="status" aria-live="polite">
        <p className={s.title}>{runTitle(run)}</p>
        <p className={s.detail}>{runDetail(run)}</p>
      </div>
      {run.phase !== 'done' && (
        <ol className={s.steps}>
          {RUN_STEPS.map((step) => {
            const st = run.phase === 'failed' && step === 'writing' ? 'failed' : stepState(run, step);
            return (
              <li key={step} className={s[st]} aria-current={st === 'now' ? 'step' : undefined}>
                <span className={s.mark}>{st === 'done' ? <Icon name="check" size={16} stroke={2.6} /> : st === 'failed' ? <Icon name="x" size={14} stroke={2.6} /> : <span />}</span>
                {stepLabel(run, step)}
              </li>
            );
          })}
        </ol>
      )}
      <p className={s.clock}>{runClock(run, now)}</p>
      <div className={s.actions}>
        {run.phase === 'done' && !hasReplay(run) ? (
          <Button
            block
            onClick={() => {
              void runs.markSeen(run.id);
              setTidy(false);
            }}
          >
            Done
          </Button>
        ) : run.phase === 'done' ? (
          <>
            <Button
              onClick={() => {
                setTidy(false);
                startReplay(run.id);
              }}
            >
              <Icon name="play" size={16} /> Watch what Bower did
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void runs.markSeen(run.id);
                setTidy(false);
              }}
            >
              Done
            </Button>
          </>
        ) : run.phase === 'failed' ? (
          <>
            <Button onClick={() => void runs.start(run.scope).catch((e: unknown) => toast(e instanceof BowerError ? e.message : 'The tidy-up did not start. Try again in a minute.'))}>Try again</Button>
            <Button
              variant="ghost"
              onClick={() => {
                void runs.markSeen(run.id);
                setTidy(false);
              }}
            >
              Close
            </Button>
          </>
        ) : (
          <Button variant="ghost" block onClick={() => setTidy(false)}>
            Hide. Tell me when it ends
          </Button>
        )}
      </div>
    </div>
  );
}
