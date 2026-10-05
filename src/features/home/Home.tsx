import { useMemo } from 'react';
import { report } from '@/ui/report';
import { focusMain } from '@/ui/focus';
import { answered } from './answer-words';
import { startRun } from '@/features/tidy/start-run';
import { waitingIn } from '@/data/piles';
import { Link, useNavigate } from 'react-router';
import { useChanges, usePiles, useQuestions, useRun, useSources, useSuggestions, useTree } from '@/data/provider';
import type { Pile, RunState, TreeNode } from '@/data/types';
import { displayName, parentOf } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { ago, greeting, plural } from '@/app/words';
import { crumbs, paraColor, routeFor } from '@/app/paths';
import { PoseBower } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon, BowerHead } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { hasReplay, replayWaiting, isRunning, landedSummary, PHASE_POSE, runDetail, runTitle, stoppedUnseen } from '@/features/tidy/run-words';
import { PileStack } from '@/features/piles/PileStack';
import s from './home.module.css';

export function Home() {
  const { data: run } = useRun();
  const { data: piles } = usePiles();
  const waiting = waitingIn(piles);
  const away = replayWaiting(run);
  const stopped = stoppedUnseen(run);
  const running = isRunning(run);
  // One Bower per screen: it sits on whichever card matters most now.
  const birdOn: 'away' | 'stopped' | 'run' | 'inbox' = away ? 'away' : stopped ? 'stopped' : running ? 'run' : 'inbox';
  return (
    <div className={s.page}>
      <header className={s.top}>
        <h1 className={s.hello}>{greeting('Alex')}</h1>
        <Link to="/settings" className={s.avatar} aria-label="Your account and settings">
          A
        </Link>
      </header>
      <div className={s.grid}>
        <div className={s.colMain}>
          {away && run && <AwayCard run={run} bird={birdOn === 'away'} />}
          {stopped && run && <StoppedCard run={run} />}
          {running && run && <RunningCard run={run} />}
          <Inbox piles={piles} waiting={waiting} bird={birdOn === 'inbox'} running={running} />
        </div>
        <div className={s.colSide}>
          <SearchField />
          <YourChanges running={running} />
          <Questions />
          <Suggestions />
          <JustFiled run={run ?? null} />
        </div>
      </div>
    </div>
  );
}

function AwayCard({ run, bird }: { run: RunState; bird: boolean }) {
  const { startReplay } = useUi();
  const { runs } = useSources();
  const end = run.finishedAt ?? run.phaseAt;
  return (
    <section className={`${s.card} ${s.away}`} aria-labelledby="away">
      {bird && (
        <div className={s.perch}>
          <PoseBower pose="proud" size={84} />
        </div>
      )}
      <p className="muted">Tidy-up finished {ago(end).toLowerCase()}</p>
      <h2 id="away" className={s.cardTitle}>
        {plural(run.report?.filed.length ?? 0, 'thing')} filed{run.report?.updated.length ? `, ${plural(run.report.updated.length, 'note')} brought up to date` : ''}.
      </h2>
      <p className="muted">{landedSummary(run)}</p>
      <div className={s.row2}>
        <Button size="sm" onClick={() => startReplay(run.id)}>
          <Icon name="play" size={15} /> Watch what Bower did
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void runs.markSeen(run.id).then(focusMain, (e: unknown) => report(e, 'That did not work. Try again.'))}>
          Got it
        </Button>
      </div>
    </section>
  );
}

function StoppedCard({ run }: { run: RunState }) {
  const { runs } = useSources();
  return (
    <section className={`${s.card} ${s.stopped}`} aria-labelledby="stopped" role="alert">
      <div className={s.stoppedHead}>
        <PoseBower pose="alarm" size={72} />
        <div>
          <h2 id="stopped" className={s.cardTitle}>
            The tidy-up stopped
          </h2>
          <p className="muted">{runDetail(run)}</p>
        </div>
      </div>
      <div className={s.row2}>
        <Button size="sm" onClick={() => void startRun(runs, run.scope).then(() => useUi.getState().setTidy(true), (e: unknown) => report(e, 'It did not start. Try again in a minute.'))}>
          Try again
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void runs.markSeen(run.id).then(focusMain, (e: unknown) => report(e, 'That did not work. Try again.'))}>
          Got it
        </Button>
      </div>
    </section>
  );
}

function RunningCard({ run }: { run: RunState }) {
  const { setTidy } = useUi();
  return (
    <button type="button" className={`${s.card} ${s.running}`} onClick={() => setTidy(true)}>
      <PoseBower pose={PHASE_POSE[run.phase]} size={72} />
      <span>
        <span className={s.cardTitle}>{runTitle(run)}</span>
        <span className="muted" style={{ display: 'block', fontSize: 15 }}>
          {runDetail(run)}
        </span>
      </span>
    </button>
  );
}

function Inbox({ piles, waiting, bird, running }: { piles: Pile[] | undefined; waiting: number; bird: boolean; running: boolean }) {
  const { setTidy } = useUi();
  const nav = useNavigate();
  return (
    <section className={`${s.card} ${s.inbox}`} aria-labelledby="inbox">
      <div className={s.inboxHead}>
        {bird && <PoseBower pose={waiting ? 'idle' : 'sleep'} size={78} className={s.inboxBird} />}
        <div>
          <h2 id="inbox" className={s.cardTitle}>
            Inbox
          </h2>
          <p className="muted">
            {piles === undefined ? 'Looking…' : waiting ? `${plural(waiting, 'thing')} waiting${running ? '' : '. Tidy up when you have added everything.'}` : 'Nothing waiting. Add something and it stays here until the next tidy-up.'}
          </p>
        </div>
      </div>
      {piles === undefined ? (
        <div className={s.skel} aria-hidden="true">
          <span />
          <span />
        </div>
      ) : (
        <ul className={s.piles}>
          {piles.map((p) => (
            <li key={p.id}>
              <Link to={`/pile/${p.id}`} className={s.pile}>
                <PileStack items={p.items} />
                <span className={s.pileMain}>
                  <span className={p.text ? s.pileText : `${s.pileText} mono`}>{p.text || (p.items[0]?.kind === 'link' ? p.items[0].name.replace(/\.url$/, '') : p.items[0]?.name.replace(/\.[A-Za-z0-9]{1,5}$/, ''))}</span>
                  <span className={s.pileSub}>
                    {!p.items.length ? 'A note' : p.text ? plural(p.items.length, 'thing') : p.items[0]?.origin}
                    <span aria-hidden="true" className={s.sep} />
                    {ago(p.createdAt)}
                  </span>
                </span>
                <Icon name="chev" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={s.row2}>
        {waiting > 0 && !running && (
          <Button block onClick={() => setTidy(true)}>
            Tidy up {plural(waiting, 'thing')}
          </Button>
        )}
        <Button variant="ghost" block={waiting === 0 || running} onClick={() => nav('/add')}>
          <Icon name="add" size={18} /> Add a pile
        </Button>
      </div>
    </section>
  );
}

/** The change journal, shown so people know Bower will see what they did. */
function YourChanges({ running }: { running: boolean }) {
  const { data: list } = useChanges();
  const { runs } = useSources();
  if (!list?.length) return null;
  return (
    <section aria-labelledby="yours" className={s.yours}>
      <h2 id="yours" className={s.h2}>
        Since the last tidy-up
      </h2>
      <p className="muted" style={{ fontSize: 15 }}>
        Bower reads {list.length === 1 ? 'this change' : `these ${list.length} changes`} in the next tidy-up, so it knows what you changed and where to look.
      </p>
      <ul className={s.changes}>
        {list.slice(-5).reverse().map((c) => (
          <li key={c.id}>{c.what}</li>
        ))}
      </ul>
      {list.length > 5 && <p className="muted" style={{ fontSize: 14 }}>and {plural(list.length - 5, 'more change')}</p>}
      {!running && (
        <Button size="sm" variant="ghost" onClick={() => void startRun(runs, 'instructions').then(() => useUi.getState().setTidy(true), (e: unknown) => report(e, 'It did not start. Try again.'))}>
          {list.length === 1 ? 'Let Bower read it now' : 'Let Bower read them now'}
        </Button>
      )}
    </section>
  );
}

function SearchField() {
  const { setPalette } = useUi();
  return (
    <button type="button" className={s.search} onClick={() => setPalette(true)}>
      <Icon name="search" />
      <span>Search your notes and files</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

function Questions() {
  const { data: qs } = useQuestions();
  const { vault } = useSources();
  if (!qs?.length) return null;
  const answer = (id: string, yes: boolean, label: string): void => {
    vault.answer(id, yes).then(
      () => {
        toast(answered(label));
        focusMain();
      },
      (e: unknown) => report(e, 'That answer did not save. Try again.'),
    );
  };
  return (
    <section aria-labelledby="qs">
      <h2 id="qs" className={s.h2}>
        {plural(qs.length, 'question')} for you
      </h2>
      <ul className={s.questions}>
        {qs.map((q) => (
          <li key={q.id} className={s.question}>
            <p>{q.text}</p>
            <div className={s.row2}>
              <Button size="sm" onClick={() => answer(q.id, true, q.yes)}>
                {q.yes}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => answer(q.id, false, q.no)}>
                {q.no}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Suggestions() {
  const { data: list } = useSuggestions();
  const { vault } = useSources();
  if (!list?.length) return null;
  return (
    <section aria-label="Bower suggests">
      {list.map((sg) => (
        <div key={sg.id} className={s.suggest}>
          <p className={s.suggestBy}>
            <BowerHead size={18} /> Bower suggests
          </p>
          <p className={s.suggestTitle}>{sg.title}</p>
          <p className="muted" style={{ fontSize: 15 }}>
            {sg.why}
          </p>
          <div className={s.row2}>
            <Button size="sm" onClick={() =>
                void vault.dismissSuggestion(sg.id, true).then(
                  () => {
                    toast('Kept as a rule.');
                    focusMain();
                  },
                  (e: unknown) => report(e, 'That did not work. Try again.'),
                )
              }>
              Keep as a rule
            </Button>
            <Button size="sm" variant="ghost" onClick={() =>
                void vault.dismissSuggestion(sg.id, false).then(
                  (undo) => {
                    toast("Bower won't suggest it again.", { label: 'Undo', run: () => void undo().catch((e: unknown) => report(e, 'That did not work. Try again.')) });
                    focusMain();
                  },
                  (e: unknown) => report(e, 'That did not work. Try again.'),
                )
              }>
              No thanks
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function JustFiled({ run }: { run: RunState | null }) {
  const { data: tree } = useTree();
  const recent = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (ns: TreeNode[]): void => ns.forEach((n) => (n.type === 'file' ? out.push(n) : walk(n.children ?? [])));
    // The inbox has its own card; Recent is what lives in your folders.
    walk((tree ?? []).filter((n) => n.path !== 'Inbox'));
    return out.sort((a, b) => b.modified - a.modified).slice(0, 6);
  }, [tree]);
  if (!recent.length) return null;
  return (
    <section aria-labelledby="recent">
      <div className={s.recentHead}>
        <h2 id="recent" className={s.h2}>
          {hasReplay(run) ? 'Just filed' : 'Recent'}
        </h2>
        {run && hasReplay(run) && run.seen && (
          <button type="button" className={s.watchAgain} onClick={() => useUi.getState().startReplay(run.id)}>
            <Icon name="play" size={14} /> Watch the last tidy-up
          </button>
        )}
      </div>
      <ul className={s.recent}>
        {recent.map((n) => (
          <li key={n.path}>
            <Link to={routeFor(n)} className={s.recentRow}>
              <span className={s.tile}>{n.byBower ? <BowerHead size={20} /> : <Icon name={n.kind === 'image' ? 'image' : 'file'} />}</span>
              <span className={s.pileMain}>
                <span className={s.pileText}>{displayName(n.name)}</span>
                <span className={s.pileSub}>
                  <span className={s.dot} style={{ background: paraColor(n.path) }} />
                  {crumbs(parentOf(n.path))}
                </span>
              </span>
              {n.isNew && <span className={s.new}>New</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
