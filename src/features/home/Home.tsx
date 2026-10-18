import { LoadError } from '@/ui/LoadError';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { report, undoToast } from '@/ui/report';
import { focusHeading, focusMain } from '@/ui/focus';
import { answered, answerToast } from './answer-words';
import { answerQuestion } from '@/data/answer-loop';
import { askingKey, isQuestionSnapshot, subjectOf, type QuestionAnswer } from '@/data/contracts/questions';
import { usePrefs } from '@/app/prefs';
import { startRun } from '@/features/tidy/start-run';
import { pileName, waitingIn } from '@/data/piles';
import { Link, useNavigate } from 'react-router';
import { useChanges, useLoad, usePiles, usePilesListed, useQuestions, useRun, useSources, useSuggestions, useTree, useUser, type Loaded } from '@/data/provider';
import type { Pile, Question, RunState, TreeNode } from '@/data/types';
import { displayName, nameOf, parentOf, thingName } from '@/data/tree';
import { useUi } from '@/app/ui-store';
import { ago, greeting, plural } from '@/app/words';
import { crumbs, noteRoute, paraColor, routeFor } from '@/app/paths';
import { PoseBower } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { FieldError, fieldBox, Textarea } from '@/ui/Field';
import { Icon, BowerHead } from '@/ui/Icon';
import { toast, useToasts } from '@/ui/toast';
import { filedWords, hasReplay, landedSummary, notesUpdated, reportWaiting, isRunning, PHASE_POSE, runDetail, runTitle, RUNNING_WAITS, stoppedUnseen, unfinishedWords } from '@/features/tidy/run-words';
import { RunLinks } from '@/features/tidy/RunLinks';
import { PileStack } from '@/features/piles/PileStack';
import { SetAsideNote } from '@/features/piles/PileScreen';
import { Inline, type LinkFn } from '@/features/note/markdown';
import { resolverFor } from '@/features/note/resolve';
import ui from '@/ui/ui.module.css';
import s from './home.module.css';
import runStyles from '@/features/tidy/tidy.module.css';
import noteStyles from '@/features/note/note.module.css';

/** One sentence about keeping uploads on this device, or null: said once, for the whole inbox. */
function useUploadNotice(): string | null | undefined {
  return useLoad(async (from) => (await from.vault.uploadNotice?.()) ?? null, (from, cb) => from.vault.subscribe(cb)).data;
}

/** The summary already owns the count; this hook only chooses its sentence. */
function useArrivalLine() {
  const summary = useLoad(async (from) => (await from.vault.orphanSummary?.()) ?? null,
    (from, cb) => from.vault.subscribe(cb));
  if (summary.loading) return null;
  const value = summary.error ? { count: 0, complete: false } : summary.data;
  if (!value || (value.complete && value.count === 0)) return null;
  const incomplete = !value.complete;
  if (value.count === 0) return { text: "Bower couldn't check that everything you added arrived.", unknown: true, incomplete, summary };
  const text = value.count === 1
    ? "1 pile didn't finish arriving. Add it again if you still need it."
    : `${value.count} piles didn't finish arriving. Add them again if you still need them.`;
  return { text: `${value.complete ? '' : 'At least '}${text}`, unknown: false, incomplete, summary };
}

/** Check again is the folder's one refresh, then this summary's read; the sentence stays until the new answer lands. */
function CheckAgain({ summary }: { summary: Pick<Loaded<unknown>, 'reload' | 'settled'> }) {
  const { vault } = useSources();
  const [busy, setBusy] = useState(false);
  const press = () => {
    setBusy(true);
    void Promise.resolve(vault.refresh?.())
      .then(() => { summary.reload(); return summary.settled(); })
      .catch((e: unknown) => report(e, 'That did not work. Try again.'))
      .finally(() => setBusy(false));
  };
  return <Button size="sm" variant="ghost" disabled={busy} onClick={press}>Check again</Button>;
}

export function Home() {
  const { data: user } = useUser();
  const name = user?.name.trim() ?? '';
  const runState = useRun();
  const { data: run } = runState;
  // The Inbox draws from the folder listing at once; what each pile's note and filed things add fills in after it.
  // When the full read fails, the listing and any earlier read cannot be vouched for (which are ready, held or on
  // their way), so the Inbox lists nothing and says why (React: an error state of its own for each independent read).
  const pilesState = usePiles();
  const { data: read } = pilesState;
  const { data: listed } = usePilesListed();
  // A full read kept from before a pile was added does not hide it: the newer listing adds the piles that read lacks.
  const piles = pilesState.error ? undefined : read && listed
    ? [...read, ...listed.filter((l) => !read.some((p) => p.id === l.id))].sort((a, b) => b.createdAt - a.createdAt)
    : read ?? listed ?? undefined;
  // Which piles are ready is known only from the full read: the listed Inbox shows without a count, and the Tidy up
  // button and its number wait for that read, so neither can drop or move once the person can press it.
  const ready = !pilesState.error && read !== undefined;
  const waiting = ready ? waitingIn(read) : 0;
  const away = reportWaiting(run);
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
          <Inbox piles={piles} error={pilesState} waiting={waiting} ready={ready} bird={birdOn === 'inbox'} running={running} />
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
  const replay = hasReplay(run);
  const detail = replay ? landedSummary(run) : runDetail(run);
  const unfinished = unfinishedWords(run.report);
  return (
    <section className={`${s.card} ${s.away}`} aria-labelledby="away">
      {bird && (
        <div className={s.perch}>
          <PoseBower pose="proud" size={84} />
        </div>
      )}
      <p className="muted">Tidy-up finished {ago(end).toLowerCase()}</p>
      <h2 id="away" className={s.cardTitle}>
        {replay ? <>{filedWords(run.report)}{run.report?.updated.length ? `, ${plural(notesUpdated(run.report), 'note')} brought up to date` : ''}.</> : runTitle(run)}
      </h2>
      {detail && <p className="muted">{detail}</p>}
      {/* The destination summary says only what was filed; what was not has its own sentence beside it. */}
      {replay && unfinished && <p className="muted">{unfinished}</p>}
      {run.report && <RunLinks report={run.report} />}
      <div className={s.row2}>
        {replay && <Button size="sm" onClick={() => startReplay(run.id)}>
          <Icon name="play" size={15} /> Watch what Bower did
        </Button>}
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

function Inbox({ piles, error, waiting, ready, bird, running }: { piles: Pile[] | undefined; error: Pick<Loaded<unknown>, 'error' | 'reload'>; waiting: number; ready: boolean; bird: boolean; running: boolean }) {
  const { setTidy } = useUi();
  const nav = useNavigate();
  const notice = useUploadNotice();
  const arrival = useArrivalLine();
  return (
    <section className={`${s.card} ${s.inbox}`} aria-labelledby="inbox">
      <div className={s.inboxHead}>
        {bird && <PoseBower pose={waiting ? 'idle' : 'sleep'} size={78} className={s.inboxBird} />}
        <div>
          <h2 id="inbox" className={s.cardTitle}>
            Inbox
          </h2>
          <p className={`muted ${s.inboxSub}`}>
            {error.error ? 'Your inbox is not showing.' : piles === undefined || !ready ? 'Looking…' : waiting ? `${plural(waiting, 'thing')} waiting${running ? '' : '. Tidy up when you have added everything.'}` : 'Nothing waiting. Add something and it stays here until the next tidy-up.'}
          </p>
          {ready && arrival && <p className={`${s.arrival} ${arrival.unknown ? 'muted' : s.unfinished}`}>{arrival.text}</p>}
          {ready && arrival?.incomplete && <CheckAgain summary={arrival.summary} />}
        </div>
      </div>
      {/* Always there, so a notice that comes later is heard. */}
      <div role="status">{notice && <p className={s.notice}>{notice}</p>}</div>
      {error.error ? (
        <LoadError state={error} />
      ) : piles === undefined ? (
        <div className={s.skel} aria-hidden="true">
          <span />
          <span />
        </div>
      ) : piles.length > 0 ? (
        <ul className={s.piles}>
          {piles.map((p) => (
            <li key={p.id}>
              <Link to={`/pile/${p.id}`} className={s.pile}>
                <PileStack items={p.items} />
                <span className={s.pileMain}>
                  <span id={`pile-name-${p.id}`} className={s.pileText}>
                    {pileName(p)}
                  </span>
                  <span className={s.pileSub}>
                    {!p.setAside && !p.noteLocked && !p.items.some((it) => it.changed || it.upload !== undefined) && p.question ? (
                      <span className={p.question === 'waiting' ? s.questionWaiting : s.questionExhausted}>
                        {p.question === 'waiting' ? 'Waiting for your answer' : "Bower couldn't place this"}
                      </span>
                    ) : (
                      <>
                        {!p.items.length ? (p.text.trim() ? 'A note' : 'Nothing in it') : p.text ? plural(p.items.length, 'thing') : p.items[0]?.origin}
                        <span aria-hidden="true" className={s.sep} />
                        {ago(p.createdAt)}
                      </>
                    )}
                  </span>
                </span>
                <Icon name="chev" size={16} />
              </Link>
              <SetAsideNote pile={p} remove disabled={running} nameId={`pile-name-${p.id}`} onRemoved={focusMain} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className={s.row2}>
        {ready && waiting > 0 && !running && !error.error && (
          <Button block onClick={() => setTidy(true)}>
            Tidy up {plural(waiting, 'thing')}
          </Button>
        )}
        <Button variant="ghost" block={ready && (waiting === 0 || running)} onClick={() => nav('/add')}>
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
        {running ? RUNNING_WAITS : `Bower reads ${list.length === 1 ? 'this change' : `these ${list.length} changes`} in the next tidy-up, so it knows what you changed and where to look.`}
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
    <button type="button" className={`${s.search} ${fieldBox({ pill: true })}`} onClick={() => setPalette(true)}>
      <Icon name="search" />
      <span>Search your notes and files</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

/** One question surface and answer path, on Home and in the run's sheet. */
export function Questions({ run }: { run?: RunState }) {
  const questionsState = useQuestions();
  const sheetHeadingId = useId();
  const headingId = run ? sheetHeadingId : 'qs';
  const { data: all } = questionsState;
  const { vault, runs } = useSources();
  const { data: tree } = useTree();
  const resolve = useMemo(() => resolverFor(tree ?? [], []), [tree]);
  // The public clock's start is inclusive, for stored and live askings alike.
  const askings = useMemo(() => (all ?? []).filter((q) => !run || q.askedAt >= run.requestedAt)
    .sort((a, b) => a.askedAt - b.askedAt), [all, run]);
  const qs = useMemo(() => {
    if (!run || !isRunning(run)) return askings;
    return askings.filter((q) => {
      if (isQuestionSnapshot([q])) return true;
      console.error('Question omitted from the live card: outside display bounds.', q.id);
      return false;
    }).slice(0, 10);
  }, [askings, run]);
  const shown = run ? qs.slice(0, 1) : qs;
  const host = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Where the answered question stood: kept until it has left the list, then focus goes to its neighbour.
  const [after, setAfter] = useState<{ index: number; key: string } | null>(null);
  useEffect(() => {
    const at = document.activeElement;
    const dialog = host.current?.closest('[role="dialog"]');
    // Radix focuses the dialog when a focused answer control is removed. That fallback
    // still needs our next-card/title focus; a person focusing another control keeps it.
    if (!after || shown.some((q) => askingKey(q) === after.key) || (at && at !== document.body && at !== dialog && at.isConnected)) return;
    const rows = list.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [];
    const next = rows[Math.min(after.index, rows.length - 1)]?.querySelector('button');
    setAfter(null);
    if (next) next.focus();
    else if (run) {
      const title = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '');
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    } else focusHeading();
  }, [after, shown, run]);
  // A [[note]] opens as it does in a note; one not found reads as plain words.
  const link: LinkFn = (target, label, key) => {
    const path = resolve(target);
    return path ? <Link key={key} to={noteRoute(path)}>{label}</Link> : <span key={key}>{label}</span>;
  };
  const answer = async (q: Question, value: QuestionAnswer, label: string): Promise<void> => {
    const index = shown.findIndex((row) => askingKey(row) === askingKey(q));
    // Said at once and held until Drive answers, as the Bin action does (WCAG 4.1.3); the outcome replaces it.
    const pending = toast('Saving your answer…');
    useToasts.getState().hold(pending, true, 'action');
    try {
      const done = await answerQuestion(vault, runs, q.id, value, { allowWeb: usePrefs.getState().lookUpWeb });
      useToasts.getState().replace(pending, done ? answerToast(done.outcome, label) : answered(label));
      setAfter({ index: Math.max(index, 0), key: askingKey(q) });
    } catch (e) {
      report(e, 'That answer did not save. Try again.', pending);
    }
  };
  if (questionsState.error) return <LoadError state={questionsState} />;
  if (!run && !shown.length) return null;
  return (
    <section ref={host} aria-labelledby={shown.length ? headingId : undefined}>
      {shown.length > 0 && (
        run ? <p id={headingId} className={runStyles.linksLabel}>Bower has a question</p> :
          <h2 id={headingId} className={s.h2}>{plural(qs.length, 'question')} for you</h2>
      )}
      {shown.length > 0 && (
        <ul ref={list} className={s.questions}>
          {shown.map((q) => <QuestionCard key={askingKey(q)} question={q} link={link} inSheet={!!run} answer={answer} />)}
        </ul>
      )}
      {run && shown.length > 0 && askings.length > 1 && (
        <Link to="/" className={runStyles.moreQuestions} onClick={() => useUi.getState().setTidy(false)}>
          {plural(askings.length - 1, 'more question')} on Home
        </Link>
      )}
    </section>
  );
}

function QuestionCard({ question: q, link, inSheet, answer }: {
  question: Question; link: LinkFn; inSheet: boolean;
  answer: (q: Question, value: QuestionAnswer, label: string) => Promise<void>;
}) {
  const updateId = useId();
  const textId = useId();
  const errorId = useId();
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const other = useRef<HTMLButtonElement>(null);
  const wasWriting = useRef(false);
  useEffect(() => {
    if (writing) field.current?.focus();
    else if (wasWriting.current) other.current?.focus();
    wasWriting.current = writing;
  }, [writing]);
  const text = draft.trim();
  const tooLong = text.length > 1000;
  const options = q.options?.length ? q.options : undefined;
  const ownWords = subjectOf(q).kind === 'inbox';
  const send = async (value: QuestionAnswer, label: string): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    await answer(q, value, label);
    working.current = false;
    setBusy(false);
  };
  return (
    <li className={`${s.question} ${inSheet ? s.questionInSheet : ''}`}>
      <p><Inline text={q.text} link={link} /></p>
      {q.about && <p className={s.about}><Link to={noteRoute(q.about)}>{displayName(nameOf(q.about))}</Link></p>}
      {q.shown && q.shown.lines.length > 0 && (
        <>
          <p id={updateId} className={runStyles.linksLabel}>{"Bower's update"}</p>
          <div className={noteStyles.state}>
            <ul aria-labelledby={updateId}>{q.shown.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </>
      )}
      {writing ? (
        <form className={s.questionWords} onSubmit={(e) => {
          e.preventDefault();
          if (text && !tooLong) void send({ text }, 'your words');
        }}>
          <label htmlFor={textId}>In your own words</label>
          <Textarea ref={field} id={textId} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
            invalid={tooLong} errorId={errorId} />
          {tooLong && <FieldError id={errorId}>Use 1,000 characters at most.</FieldError>}
          <div className={s.row2}>
            <Button type="submit" size="sm" disabled={!text || tooLong || busy}>Tell Bower</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setWriting(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          <div className={options ? s.questionOptions : s.row2}>
            {options ? options.map((option) => (
              <Button key={option.id} size="sm" variant="ghost" block disabled={busy}
                onClick={() => void send({ option: option.id }, option.label)}>{option.label}</Button>
            )) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => void send(true, q.yes)}>{q.yes}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send(false, q.no)}>{q.no}</Button>
              </>
            )}
          </div>
          {ownWords && <Button ref={other} size="sm" variant="ghost" block className={s.questionOther}
            disabled={busy} onClick={() => setWriting(true)}>Something else…</Button>}
        </>
      )}
    </li>
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
                    undoToast("Bower won't suggest it again.", undo);
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
              {n.isNew && <span className={`${ui.freshPill} ${s.new}`}>New</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
