import { LoadError } from '@/ui/LoadError';
import { Bone, Skeleton } from '@/ui/Skeleton';
import { Link, useLocation, useNavigate } from 'react-router';
import { useInbox, useQuestions, useRequests, useRulesSection, useRun, useSources } from '@/data/provider';
import { noteRoute } from '@/app/paths';
import { report } from '@/ui/report';
import { focusMain } from '@/ui/focus';
import { useUi } from '@/app/ui-store';
import { countOr, plural } from '@/app/words';
import { Button } from '@/ui/Button';
import { isRunning, RUNNING_WAITS, runDetail, runTitle } from '@/features/tidy/run-words';
import { Inline } from '@/features/note/markdown';
import { useNoteLink } from '@/features/note/note-link';
import { FailedChanges } from './FailedChanges';
import s from './bower.module.css';

/** Bower in the desktop's right panel: what it is doing and what it asks. */
export function BowerPanel() {
  const runState = useRun();
  const { data: run, loading: runLoading } = runState;
  const questionsState = useQuestions();
  const { data: qs } = questionsState;
  const rulesState = useRulesSection();
  const { rules, prose } = rulesState;
  const requestsState = useRequests();
  const { data: requests } = requestsState;
  const asked = (requests ?? []).filter((r) => !r.done);
  const link = useNoteLink();
  const { setTidy } = useUi();
  const { runs } = useSources();
  // Home's Got it, in the same words: the stopped run is seen, everywhere.
  const putAway = (id: string): void => void runs.markSeen(id).then(focusMain, (e: unknown) => report(e, 'That did not work. Try again.'));
  const nav = useNavigate();
  // Home shows the questions and their error itself (d-v2-14).
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const onBower = pathname === '/bower';
  // Only an inbox that last read fine and holds nothing; a failed refresh keeps the usual line.
  const { waiting } = useInbox();
  const inboxEmpty = waiting === 0;
  return (
    <div className={s.panel}>
      <section>
        <h2 className={s.ph}>Now</h2>
        {runState.error ? <LoadError state={runState} /> : run && (isRunning(run) || (!run.seen && run.phase !== 'failed')) ? (
          <button type="button" className={s.panelCard} onClick={() => setTidy(true, run.id)}>
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
              Got it
            </Button>
          </div>
        ) : run === undefined && runLoading ? (
          // The size of the resting line that follows: one line with an empty inbox, two otherwise.
          <Skeleton label="Opening the activity panel">
            <Bone style={{ height: inboxEmpty ? '1lh' : '2lh' }} />
          </Skeleton>
        ) : (
          <p className="muted">{inboxEmpty ? 'Resting. Nothing waiting in the inbox.' : 'Resting. Tidy up when the inbox has what you want filed.'}</p>
        )}
        <FailedChanges />
      </section>
      {!onHome && <LoadError state={questionsState} />}
      {!onHome && !!qs?.length && (
        <section>
          <h2 className={s.ph}>{plural(qs.length, 'question')} for you</h2>
          {qs.map((q) => (
            <p key={q.id} className={s.panelQ}>
              <Inline text={q.text} link={link} />
            </p>
          ))}
          <Link to="/">Answer on Home</Link>
        </section>
      )}
      <section>
        {/* With the person's own text there is no count to claim; while that is unknown, none either. */}
        <h2 className={s.ph}>{countOr(prose === '' && rules?.length ? rules.length : undefined, 'rule', 'Rules')}</h2>
        <LoadError state={rulesState} />
        <ul className={s.panelRules}>
          {(rules ?? []).slice(0, prose ? 4 : 5).map((r) => (
            <li key={r.id}>
              <span className={s.panelRuleText}>{r.text}</span>
              {r.pending && <span className={s.waits}>Waits for the next tidy-up</span>}
            </li>
          ))}
        </ul>
        {prose && <Link to={noteRoute('Rules.md')}>Your rules note</Link>}
      </section>
      <LoadError state={requestsState} />
      {asked.length > 0 && (
        <section>
          <h2 className={s.ph}>You asked</h2>
          <ul className={s.panelRules}>
            {asked.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className={s.panelRuleText}>{r.text}</span>
                <span className={s.waits}>{isRunning(run) ? RUNNING_WAITS : 'Waits for the next tidy-up'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!onBower && (
        <Button variant="ghost" size="sm" block onClick={() => nav('/bower')}>
          Tell Bower something
        </Button>
      )}
    </div>
  );
}
