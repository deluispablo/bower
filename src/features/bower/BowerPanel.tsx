import { Link, useNavigate } from 'react-router';
import { useQuestions, useRequests, useRules, useRun } from '@/data/provider';
import { useUi } from '@/app/ui-store';
import { countOr, plural } from '@/app/words';
import { Button } from '@/ui/Button';
import { isRunning, runDetail, runTitle } from '@/features/tidy/run-words';
import s from './bower.module.css';

/** Bower in the desktop's right panel: what it is doing and what it asks. */
export function BowerPanel() {
  const { data: run, loading: runLoading } = useRun();
  const { data: qs } = useQuestions();
  const { data: rules } = useRules();
  const { data: requests } = useRequests();
  const asked = (requests ?? []).filter((r) => !r.done);
  const { setTidy } = useUi();
  const nav = useNavigate();
  return (
    <div className={s.panel}>
      <section>
        <h3 className={s.ph}>Now</h3>
        {run && (isRunning(run) || !run.seen) ? (
          <button type="button" className={s.panelCard} onClick={() => setTidy(true)}>
            <strong>{runTitle(run)}</strong>
            <span className="muted">{runDetail(run)}</span>
          </button>
        ) : run?.phase === 'failed' ? (
          <button type="button" className={s.panelCard} onClick={() => setTidy(true)}>
            <strong>The last tidy-up stopped</strong>
            <span className="muted">{run.failure ?? 'Nothing was moved.'} Tidy up again when you are ready.</span>
          </button>
        ) : run === undefined && runLoading ? (
          <p className="muted">Looking…</p>
        ) : (
          <p className="muted">Resting. Tidy up when the inbox has what you want filed.</p>
        )}
      </section>
      {!!qs?.length && (
        <section>
          <h3 className={s.ph}>{plural(qs.length, 'question')} for you</h3>
          {qs.map((q) => (
            <p key={q.id} className={s.panelQ}>
              {q.text}
            </p>
          ))}
          <Link to="/">Answer on Home</Link>
        </section>
      )}
      <section>
        <h3 className={s.ph}>{countOr(rules?.length, 'rule', 'Rules')}</h3>
        <ul className={s.panelRules}>
          {(rules ?? []).slice(0, 5).map((r) => (
            <li key={r.id}>
              {r.text}
              {r.pending && <span className={s.waits}>Waits for the next tidy-up</span>}
            </li>
          ))}
        </ul>
      </section>
      {asked.length > 0 && (
        <section>
          <h3 className={s.ph}>You asked</h3>
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
