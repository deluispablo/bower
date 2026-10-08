import { LoadError } from '@/ui/LoadError';
import { useEffect, useMemo, useRef } from 'react';
import { report } from '@/ui/report';
import { focusHeading, focusMain } from '@/ui/focus';
import { answered, answerToast } from './answer-words';
import { answerQuestion } from '@/data/answer-loop';
import { usePrefs } from '@/app/prefs';
import { startRun } from '@/features/tidy/start-run';
import { pileName, waitingIn } from '@/data/piles';
import { Link, useNavigate } from 'react-router';
import { useChanges, useLoad, usePiles, usePilesListed, useQuestions, useRun, useSources, useSuggestions, useTree, useUser } from '@/data/provider';
import type { Pile, RunState, TreeNode } from '@/data/types';
import { displayName, nameOf, parentOf, thingName } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { ago, greeting, plural } from '@/app/words';
import { crumbs, noteRoute, paraColor, routeFor } from '@/app/paths';
import { PoseBower } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon, BowerHead } from '@/ui/Icon';
import { toast } from '@/ui/toast';
import { filedWords, hasReplay, replayWaiting, isRunning, landedSummary, PHASE_POSE, runDetail, runTitle, stoppedUnseen } from '@/features/tidy/run-words';
import { RunLinks } from '@/features/tidy/RunLinks';
import { PileStack } from '@/features/piles/PileStack';
import { SetAsideNote } from '@/features/piles/PileScreen';
import { Inline, type LinkFn } from '@/features/note/markdown';
import { resolverFor } from '@/features/note/resolve';
import s from './home.module.css';

/** One sentence about keeping uploads on this device, or null: said once, for the whole inbox. */
function useUploadNotice(): string | null | undefined {
  return useLoad(async (from) => (await from.vault.uploadNotice?.()) ?? null, (from, cb) => from.vault.subscribe(cb)).data;
}

export function Home() {
  const { data: user } = useUser();
  const name = user?.name.trim() ?? '';
  const runState = useRun();
  const { data: run } = runState;
  // The Inbox draws from the folder listing at once; what each pile's note and filed things add fills in after it.
  const { data: read } = usePiles();
  const { data: listed } = usePilesListed();
  const piles = read ?? listed ?? undefined;
  const waiting = waitingIn(piles);
  const away = replayWaiting(run);
  const stopped = stoppedUnseen(run);
  const running = isRunning(run);
  // One Bower per screen: it sits on whichever card matters most now.
  const birdOn: 'away' | 'stopped' | 'run' | 'inbox' = away ? 'away' : stopped ? 'stopped' : running ? 'run' : 'inbox';
  return (
    <div className={s.page}>
      <header className={s.top}>
        <h1 className={s.hello}>{name ? greeting(name) : "G'day"}</h1>
        <Link to="/settings" className={s.avatar} aria-label="Your account and settings">
          {name ? name.slice(0, 1).toUpperCase() : '…'}
        </Link>
      </header>
      <div className={s.grid}>
        <div className={s.colMain}>
          <LoadError state={runState} />
          {running && run && <RunningCard run={run} />}
          <Inbox piles={piles} waiting={waiting} bird={birdOn === 'inbox'} running={running} />
          {/* The last tidy-up's report comes from a read of its own and fills in after the Inbox: below it, so nothing
              under the person's finger moves when it lands (progressive rendering: each part shows when its data is there). */}
          {stopped && run && <StoppedCard run={run} />}
          {away && run && <AwayCard run={run} bird={birdOn === 'away'} />}
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
        {filedWords(run.report)}{run.report?.updated.length ? `, ${plural(run.report.updated.length, 'note')} brought up to date` : ''}.
      </h2>
      <p className="muted">{landedSummary(run)}</p>
      {run.report && <RunLinks report={run.report} />}
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
  const notice = useUploadNotice();
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
      {/* Always there, so a notice that comes later is heard. */}
      <div role="status">{notice && <p className={s.notice}>{notice}</p>}</div>
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
                  <span id={`pile-name-${p.id}`} className={p.text ? s.pileText : `${s.pileText} mono`}>
                    {pileName(p)}
                  </span>
                  <span className={s.pileSub}>
                    {!p.items.length ? (p.text.trim() ? 'A note' : 'Nothing in it') : p.text ? plural(p.items.length, 'thing') : p.items[0]?.origin}
                    <span aria-hidden="true" className={s.sep} />
                    {ago(p.createdAt)}
                  </span>
                </span>
                <Icon name="chev" size={16} />
              </Link>
              <SetAsideNote pile={p} remove disabled={running} nameId={`pile-name-${p.id}`} onRemoved={focusMain} />
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
  const changesState = useChanges();
  const { data: list } = changesState;
  const { runs } = useSources();
  if (changesState.error) return <LoadError state={changesState} />;
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
  const questionsState = useQuestions();
  const { data: qs } = questionsState;
  const { vault, runs } = useSources();
  const { data: tree } = useTree();
  // By today's names only: the journal is read once on Home, by Since the last tidy-up.
  const resolve = useMemo(() => resolverFor(tree ?? [], []), [tree]);
  // After an answer, the answered question goes; the keyboard moves on to the next question (the one now
  // at its place), or to the Home heading when none is left, never to the body.
  const list = useRef<HTMLUListElement>(null);
  const after = useRef<number | null>(null);
  const settle = (): void => {
    const at = document.activeElement;
    if (after.current === null || (at && at !== document.body && at.isConnected)) return;
    const rows = list.current?.querySelectorAll<HTMLElement>('li') ?? [];
    const next = rows[Math.min(after.current, rows.length - 1)]?.querySelector('button');
    after.current = null;
    if (next) next.focus();
    else focusHeading();
  };
  useEffect(settle, [qs]);
  if (questionsState.error) return <LoadError state={questionsState} />;
  if (!qs?.length) return null;
  // A [[note]] the question names opens it, as in a note; one not found reads as plain words.
  const link: LinkFn = (target, label, key) => {
    const path = resolve(target);
    return path ? (
      <Link key={key} to={noteRoute(path)}>
        {label}
      </Link>
    ) : (
      <span key={key}>{label}</span>
    );
  };
  const answer = (id: string, yes: boolean, label: string): void => {
    const index = (qs ?? []).findIndex((q) => q.id === id);
    // Stored once; a yes a tidy-up can act on starts a small one at once (TL-P4-08 addendum 8).
    answerQuestion(vault, runs, id, yes, { allowWeb: usePrefs.getState().lookUpWeb }).then(
      (done) => {
        if (done?.outcome.kind === 'failed') console.error(done.outcome.error);
        toast(done ? answerToast(done.outcome, label) : answered(label));
        after.current = Math.max(index, 0);
        // The list may already have changed, or change a moment later (then the effect lands it).
        setTimeout(settle, 0);
      },
      (e: unknown) => report(e, 'That answer did not save. Try again.'),
    );
  };
  return (
    <section aria-labelledby="qs">
      <h2 id="qs" className={s.h2}>
        {plural(qs.length, 'question')} for you
      </h2>
      <ul ref={list} className={s.questions}>
        {qs.map((q) => (
          <li key={q.id} className={s.question}>
            <p>
              <Inline text={q.text} link={link} />
            </p>
            {q.about && (
              <p className={s.about}>
                <Link to={noteRoute(q.about)}>{displayName(nameOf(q.about))}</Link>
              </p>
            )}
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
  const suggestionsState = useSuggestions();
  const { data: list } = suggestionsState;
  const { vault } = useSources();
  if (suggestionsState.error) return <LoadError state={suggestionsState} />;
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
                <span className={s.pileText}>{thingName(n.name)}</span>
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
