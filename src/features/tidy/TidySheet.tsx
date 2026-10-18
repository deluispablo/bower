import { LoadError } from '@/ui/LoadError';
import { useState } from 'react';
import { report } from '@/ui/report';
import { useStartRun } from './start-run';
import { pileName, thingsIn, waitingIn } from '@/data/piles';
import { usePiles, useRequests, useRules, useRun, useSources, type Loaded } from '@/data/provider';
import { BowerError, RUN_STEPS, type RunState } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { usePrefs } from '@/app/prefs';
import { plural } from '@/app/words';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { PileStack } from '@/features/piles/PileStack';
import { PoseBower } from '@/bird/Bower';
import { hasReplay, isRunning, runClock, runDetail, runTitle, stepLabel, stepState } from './run-words';
import { useNow } from './useNow';
import { TidyScene } from './TidyScene';
import { RunLinks } from './RunLinks';
import { Questions } from '@/features/home/Home';
import s from './tidy.module.css';

/** The tidy-up: confirm, then the real phases, then the result. One sheet. */
export function TidySheet() {
  const { tidyOpen, tidyReportRunId, setTidy } = useUi();
  const runState = useRun();
  const { data: run } = runState;
  const running = isRunning(run);
  // The opener (status bar, panel card) names an unseen done run to show it, rows or not; watched runs still show their end even with no rows.
  // A stopped run stays reachable until acknowledged as well.
  const [watched, setWatched] = useState<string | null>(null);
  // Adjusted while rendering (React: storing information from previous renders), not in an effect.
  if (!tidyOpen && watched !== null) setWatched(null);
  else if (tidyOpen && running && run && watched !== run.id) setWatched(run.id);
  const showRun = !!run && (running || (tidyReportRunId === run.id && run.phase === 'done' && !run.seen) || (run.phase === 'failed' && !run.seen) || watched === run.id);
  const { runs } = useSources();
  const pilesState = usePiles();
  const { data: piles } = pilesState;
  const waiting = waitingIn(piles);
  const ask = waiting ? `Tidy up ${plural(waiting, 'thing')}?` : 'Nothing in the inbox';
  const onOpenChange = (open: boolean): void => {
    // Closing a finished run with nothing to replay: it has been seen. A stopped one stays on Home
    // (with Try again) until "Got it", however the sheet was closed.
    if (!open && showRun && run && run.phase === 'done' && !run.seen && !hasReplay(run)) void runs.markSeen(run.id);
    setTidy(open);
  };
  return (
    <Sheet open={tidyOpen} onOpenChange={onOpenChange} title={runState.error ? 'Latest update unavailable' : showRun && run ? runTitle(run) : ask} hideTitle className={s.sheet}>
      {runState.error ? <LoadError state={runState} /> : showRun && run ? <RunView run={run} /> : <Confirm pilesState={pilesState} />}
    </Sheet>
  );
}

function Confirm({ pilesState }: { pilesState: ReturnType<typeof usePiles> }) {
  const { data: piles } = pilesState;
  // Waiting keeps the focus: aria-disabled, not disabled (as on the pile page).
  const { busy, start: begin } = useStartRun();
  const [error, setError] = useState<string | null>(null);
  const count = waitingIn(piles);
  const start = (): void => {
    const started = begin('all');
    if (!started) return;
    setError(null);
    void started.catch((e: unknown) => {
      setError(e instanceof BowerError ? e.message : 'The tidy-up did not start. Try again.');
      if (!(e instanceof BowerError)) console.error(e);
    });
  };
  // A failed read says why and can be asked again; the sheet is never left busy on it.
  if (pilesState.error) return <LoadError state={pilesState} />;
  if (!piles) return <div className={s.stage} aria-busy="true" />;
  return (
    <div>
      <div className={s.stage}>
        <PoseBower pose={count ? 'idle' : 'sleep'} size={110} priority={1} />
      </div>
      {/* The dialog's own title says this to screen readers. */}
      <p className={s.title} aria-hidden="true">
        {count ? `Tidy up ${plural(count, 'thing')}?` : 'Nothing in the inbox'}
      </p>
      <p className={s.detail}>
        {count
          ? 'Bower reads each one, names it, writes what matters into your notes and files it in your Drive. About 5 minutes; you can close the app.'
          : 'Add something to the inbox to start a tidy-up here.'}
      </p>
      {count > 0 && (
        <>
          <p className={s.linksLabel}>In the inbox: {plural(piles.length, 'pile')}, {plural(count, 'thing')}</p>
          <ul className={s.piles} aria-label="In the inbox">
            {piles.map((p) => (
              <li key={p.id}>
                <PileStack items={p.items} />
                <span>{pileName(p)}</span>
                <span className="muted">{plural(thingsIn(p), 'thing')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Journal />
      {count > 0 && <p className={s.detail}>Bower will consider these requests and pending rules too. Some work may wait for another tidy-up.</p>}
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
            <Button block onClick={start} aria-disabled={busy || undefined}>
              {busy ? 'Starting…' : error ? 'Try again' : `Tidy up ${plural(count, 'thing')}`}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pending requests and rules the tidy-up also considers, counted from the readers' live data. Each says it is checking
 * or failed instead of a count it does not know: an error hides a retained count until a read succeeds again.
 */
function Journal() {
  const requests = useRequests();
  const rules = useRules();
  const rows: Array<{ label: string; icon: 'send' | 'list'; state: Loaded<unknown>; n: number | undefined; one: string; many: string }> = [
    { label: 'Requests', icon: 'send', state: requests, n: requests.data?.filter((r) => !r.done).length, one: 'request', many: 'requests' },
    { label: 'Pending rules', icon: 'list', state: rules, n: rules.data?.filter((r) => r.pending === true).length, one: 'pending rule', many: 'pending rules' },
  ];
  return (
    <>
      <ul className={s.piles} aria-label="Requests and pending rules">
        {rows.map((r) => (
          <li key={r.label}>
            <Icon name={r.icon} size={18} />
            <span>{r.label}</span>
            <span className="muted">
              {r.state.error ? `${r.label} could not be checked` : r.n === undefined ? `Checking ${r.many}…` : plural(r.n, r.one, r.many)}
            </span>
          </li>
        ))}
      </ul>
      {rows.map((r) => r.state.error && (
        <div key={r.label} role="group" aria-label={r.label} className={s.error}>
          <LoadError state={r.state} />
        </div>
      ))}
    </>
  );
}

function RunView({ run }: { run: RunState }) {
  const now = useNow(isRunning(run));
  const { setTidy, startReplay } = useUi();
  const { runs } = useSources();
  const { busy, start } = useStartRun();
  // The same condition useRunWatcher notifies on, read on render.
  const notifies = usePrefs((p) => p.notifyRuns) && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return (
    <div>
      <TidyScene phase={run.phase} scope={run.scope} {...(run.report ? { filed: run.report.filed.length } : {})} />
      {/* The sheet is named by the title already; the live region says what changed. */}
      <p className={s.title} aria-hidden="true">
        {runTitle(run)}
      </p>
      <p className={s.detail} role="status" aria-live="polite">
        {runDetail(run)}
      </p>
      <Questions run={run} />
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
      {run.phase === 'done' && run.report && <RunLinks report={run.report} onOpen={() => setTidy(false)} />}
      <p className={s.clock}>{runClock(run, now)}</p>
      <div className={s.pinned}>
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
            <Button onClick={() => void start(run.scope)?.catch((e: unknown) => report(e, 'The tidy-up did not start. Try again in a minute.'))} aria-disabled={busy || undefined}>
              {busy ? 'Starting…' : 'Try again'}
            </Button>
            <Button variant="ghost" onClick={() => setTidy(false)}>
              Close
            </Button>
          </>
        ) : (
          <>
            <p className={s.hideLine}>{notifies ? 'Bower tells you here when it ends, or with a notification if you are in another app.' : 'Bower tells you here when it ends.'}</p>
            <Button variant="ghost" block onClick={() => setTidy(false)}>
              Hide this
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
