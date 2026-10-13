import { LoadError } from '@/ui/LoadError';
import { Link, useNavigate } from 'react-router';
import { useQuestions, useRequests, useRules, useRun, useSources } from '@/data/provider';
import { report } from '@/ui/report';
import { focusMain } from '@/ui/focus';
import { useUi } from '@/app/ui-store';
import { countOr, plural } from '@/app/words';
import { Button } from '@/ui/Button';
import { isRunning, runDetail, runTitle } from '@/features/tidy/run-words';
import { FailedChanges } from './FailedChanges';
import s from './bower.module.css';

/** Bower in the desktop's right panel: what it is doing and what it asks. */
export function BowerPanel() {
  const runState = useRun();
  const { data: run, loading: runLoading } = runState;
  const questionsState = useQuestions();
  const { data: qs } = questionsState;
  const rulesState = useRules();
  const { data: rules } = rulesState;
  const requestsState = useRequests();
  const { data: requests } = requestsState;
  const asked = (requests ?? []).filter((r) => !r.done);
  const { setTidy } = useUi();
  const { runs } = useSources();
  // Put away is Home's Got it: the stopped run is seen, everywhere.
  const putAway = (id: string): void => void runs.markSeen(id).then(focusMain, (e: unknown) => report(e, 'That did not work. Try again.'));
  const nav = useNavigate();
  return (
    <div className={s.panel}>
      <section>
        <h2 className={s.ph}>Now</h2>
        {runState.error ? <LoadError state={runState} /> : run && (isRunning(run) || (!run.seen && run.phase !== 'failed')) ? (
          <button type="button" className={s.panelCard} onClick={() => setTidy(true)}>
            <strong>{runTitle(run)}</strong>
            <span className="muted">{runDetail(run)}</span>
          </button>
        ) : run?.phase === 'failed' && !run.seen ? (
          <div className={s.panelCard}>
            <button type="button" className={s.panelCardMain} onClick={() => setTidy(true)}>
              <strong>The last tidy-up stopped</strong>
              <span className="muted">{run.failure ?? 'Nothing was moved. Tidy up again when you are ready.'}</span>
            </button>
            <Button size="sm" variant="ghost" onClick={() => putAway(run.id)}>
              Put it away
            </Button>
          </div>
        ) : run === undefined && runLoading ? (
          <p className="muted">Looking…</p>
        ) : (
          <p className="muted">Resting. Tidy up when the inbox has what you want filed.</p>
        )}
        <FailedChanges />
      </section>
      <LoadError state={questionsState} />
      {!!qs?.length && (
        <section>
          <h2 className={s.ph}>{plural(qs.length, 'question')} for you</h2>
          {qs.map((q) => (
            <p key={q.id} className={s.panelQ}>
              {q.text}
            </p>
          ))}
          <Link to="/">Answer on Home</Link>
        </section>
      )}
      <section>
        <h2 className={s.ph}>{countOr(rules?.length, 'rule', 'Rules')}</h2>
        <LoadError state={rulesState} />
        <ul className={s.panelRules}>
          {(rules ?? []).slice(0, 5).map((r) => (
            <li key={r.id}>
              {r.text}
              {r.pending && <span className={s.waits}>Waits for the next tidy-up</span>}
            </li>
          ))}
        </ul>
      </section>
      <LoadError state={requestsState} />
      {asked.length > 0 && (
        <section>
          <h2 className={s.ph}>You asked</h2>
          <ul className={s.panelRules}>
            {asked.slice(0, 5).map((r) => (
              <li key={r.id}>
                {r.text}
                <span className={s.waits}>Waits for the next tidy-up</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="ghost" size="sm" block onClick={() => nav('/bower')}>
        Tell Bower something
      </Button>
    </div>
  );
}
