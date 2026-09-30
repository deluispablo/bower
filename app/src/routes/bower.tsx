/**
 * The Bower tab (#340, spec C.7; boards Phone-Bower and Phone-Bower-Empty):
 * one box with no Rule/Task/Question selector, the "?" tip with rotating
 * examples, and three segments, Rules · Requests · Activity.
 *
 * Send writes an instruction note (`kind: request`) into the inbox through
 * the same writer as before (`tell.ts`, `createTextFile`) and starts no
 * run (Part A 6.2.5): it waits for the next tidy-up like anything else in
 * the inbox, and shows under Requests as Waiting. A rule sentence ("From
 * now on…", "Always…", "Never…", "Every time…") is the exception (#343):
 * it goes straight into `Rules.md`, no note, no run, and shows under
 * Requests as Rule kept. Rules is its own screen (#342,
 * `rules-panel.tsx`): a rule's Change it fills the box and Send then
 * rewrites that rule in `Rules.md` instead of sending a note; Apply it
 * sends the job note "Apply this rule to what is already filed".
 * Activity (#345, board Phone-Bower-Activity, `activity-panel.tsx`) shows
 * one card per tidy-up, newest first; `/bower?show=activity` (Home's Last
 * tidy-up card) opens on it. From 1200 px
 * the three segments are three columns instead (#357, Desktop-Bower
 * board): the same header height and top line, the box spanning above.
 *
 * Requests (#344, #756, spec §6.7) lists every request with its state, read
 * from the Bower folder and the finished runs (`requestRows`): In your
 * inbox, Being done now, Done and Did not finish (with the run's counts:
 * a request never vanishes), Answered, Rule kept. A waiting or
 * did-not-finish row has a More menu: Edit fills the box with the note's
 * words and Send then rewrites that note; "Just this, now" starts an
 * instructions-only run through the shared helper (`run-now.ts`); Remove
 * from the inbox moves the note to Drive's Trash. No row starts a run on
 * its own.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { cardWhen } from '../activity.js';
import type { Run } from '../api.js';
import {
  answerNotes,
  clockLabel,
  examplesFor,
  lowerFirst,
  requestMeta,
  requestRows,
  sentenceKind,
  stateLabel,
  waitingNotes,
} from '../bower-tab.js';
import type {
  KeptSentence,
  RequestRow,
  RequestState,
  SentRequest,
} from '../bower-tab.js';
import { ActivityPanel, useRuns } from '../components/activity-panel.js';
import { Bird } from '../components/bird.js';
import { DictateButton } from '../components/dictate-button.js';
import {
  IconChat,
  IconCheck,
  IconClock,
  IconClose,
  IconHelp,
  IconInbox,
  IconMore,
  IconSend,
  IconShield,
  IconSparkle,
} from '../components/icons.js';
import { Overlay } from '../components/overlay.js';
import { Queued } from '../components/queued-overlay.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import {
  RulesPanel,
  useFileText,
  writeError,
} from '../components/rules-panel.js';
import { useShellSlot } from '../components/shell-slots.js';
import {
  INSTRUCTION_APP_PROPERTIES,
  SaveError,
  createTextFile,
  deleteFile,
} from '../drive.js';
import type { DriveFile } from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import { dayOf } from '../proposals.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import {
  allRules,
  applyToFiledRequest,
  dropRuleLead,
  parseRules,
  ruleBullet,
} from '../rules.js';
import type { Rule, RuleRef } from '../rules.js';
import { JUST_FILED_PATH, runKey } from '../just-filed.js';
import { outcomeCounts, outcomeFromRun } from '../run-outcome.js';
import { RUN_NOW_LABEL, RUN_NOW_LINE, useRunNow } from '../run-now.js';
import type { RunNow } from '../run-now.js';
import { IDEAS_PATH } from '../shell-routes.js';
import {
  instructionBody,
  instructionFileName,
  instructionNote,
  rewriteInstruction,
} from '../tell.js';
import { OfflineError, useVault } from '../vault-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { requestRowText } from '../move-request.js';
import '../styles/bower.css';
import '../styles/pin-sheet.css';

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Bower</h1>;

type Segment = 'rules' | 'requests' | 'activity';

interface SegmentTab {
  id: Segment;
  label: string;
  Icon: () => JSX.Element;
}

/** From 1200 px the three segments are three columns side by side (#357). */
const WIDE_QUERY = '(min-width: 1200px)';

const SEGMENTS: readonly SegmentTab[] = [
  { id: 'rules', label: 'Rules', Icon: IconShield },
  { id: 'requests', label: 'Requests', Icon: IconChat },
  { id: 'activity', label: 'Activity', Icon: IconClock },
];

/** How many times the tab has opened since the app loaded: each visit
 * shows the next set of examples (`examplesFor`). */
let visits = 0;

interface TipProps {
  open: boolean;
  onToggle: () => void;
  examples: string[];
  onPick: (example: string) => void;
}

/** The "?" tip under the box: what can be said, and three examples that
 * fill the box when tapped (never send it). */
function Tip({ open, onToggle, examples, onPick }: TipProps): JSX.Element {
  return (
    <div class="bower-tip">
      <button
        type="button"
        class="bower-tip-toggle"
        aria-expanded={open}
        aria-controls={open ? 'bower-tip-body' : undefined}
        onClick={onToggle}
      >
        <IconHelp />
        <span>Things you can ask</span>
      </button>
      {open && (
        <div id="bower-tip-body" class="bower-tip-body">
          <p>
            A rule (&ldquo;from now on&hellip;&rdquo;), a job (&ldquo;make a
            document&hellip;&rdquo;) or a question, in your words. A rule starts
            at once; a job or a question waits for the next tidy-up. Tap one:
          </p>
          <ul class="bower-examples">
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  class="bower-example"
                  onClick={() => {
                    onPick(example);
                  }}
                >
                  <IconSparkle />
                  <span>{example}</span>
                </button>
              </li>
            ))}
          </ul>
          <a class="bower-more-ideas" href={IDEAS_PATH}>
            More ideas
          </a>
        </div>
      )}
    </div>
  );
}

/** Where the owner's rules live, from the top of the Bower folder. */
const RULES_PATH = 'Rules.md';

/** The icon before a request, as on the board: a clock while it waits,
 * the inbox while the run has it, a cross when it did not finish, a tick
 * once something came of it. */
function StateIcon({ state }: { state: RequestState }): JSX.Element {
  if (state === 'waiting') return <IconClock />;
  if (state === 'tidying') return <IconInbox />;
  if (state === 'failed') return <IconClose />;
  return <IconCheck />;
}

/** The CSS state a row is drawn in: a finished run reads like the green
 * "something came of it", a run that did not finish like the amber wait. */
function toneOf(state: RequestState): string {
  if (state === 'done') return 'answered';
  if (state === 'failed') return 'waiting';
  return state;
}

/**
 * The words of the instruction notes waiting in the inbox, by file id,
 * read through the vault's note cache; read again when a note changes
 * (its `modifiedTime`). A note that cannot be read is left out, and its
 * row falls back to the title in its name.
 */
function useNoteTexts(notes: DriveFile[]): ReadonlyMap<string, string> {
  const { getNoteText } = useVault();
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const key = notes
    .map((note) => `${note.id}@${note.modifiedTime ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      notesRef.current.map(async (note): Promise<[string, string] | null> => {
        try {
          return [note.id, await getNoteText(note.id)];
        } catch (err) {
          // Offline with nothing cached: the title in its name stands in.
          if (!(err instanceof OfflineError)) console.error(err);
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setTexts(
        new Map(
          entries.filter((entry): entry is [string, string] => entry !== null),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key, getNoteText]);

  return texts;
}

interface RequestsListProps {
  rows: RequestRow[];
  now: number;
  /** When the run in flight started (ISO-8601), for "started 13:52". */
  runStarted: string | null;
  /** The finished runs, for a done row's counts. */
  runs: readonly Run[];
  /** "Just this, now": its disabled states and how to start it. */
  runNow: RunNow;
  /** A write is under way: the row buttons wait. */
  busy: boolean;
  onRules: () => void;
  onEdit: (row: RequestRow) => void;
  onRemove: (row: RequestRow) => void;
  onRunNow: () => void;
}

function RequestMeta({
  row,
  now,
  runStarted,
  runs,
  onRules,
}: Pick<RequestsListProps, 'now' | 'runStarted' | 'runs' | 'onRules'> & {
  row: RequestRow;
}): JSX.Element {
  const when = lowerFirst(cardWhen(row.since, now));
  const run = runs.find((item) => runKey(item) === row.runKey);
  const counts =
    row.state === 'done' && run !== undefined
      ? outcomeCounts(outcomeFromRun(run), { short: true })
      : '';
  const meta = requestMeta(row, {
    when,
    counts,
    startedAt: clockLabel(runStarted ?? row.since),
  });
  switch (row.state) {
    case 'answered':
      return (
        <p class="bower-request-meta">
          {meta} ·{' '}
          <a class="bower-request-link" href={`/note/${row.fileId ?? ''}`}>
            Read the answer
          </a>
        </p>
      );
    case 'done':
      return (
        <p class="bower-request-meta">
          {meta}
          {row.runKey !== undefined && (
            <>
              {' '}
              ·{' '}
              <a
                class="bower-request-link"
                href={`${JUST_FILED_PATH}?run=${encodeURIComponent(row.runKey)}`}
              >
                See what came of it
              </a>
            </>
          )}
        </p>
      );
    case 'kept':
      return (
        <p class="bower-request-meta">
          <button type="button" class="bower-request-link" onClick={onRules}>
            {meta}
          </button>
        </p>
      );
    case 'waiting':
    case 'tidying':
    case 'failed':
      return <p class="bower-request-meta">{meta}</p>;
    default: {
      const exhaustive: never = row.state;
      return exhaustive;
    }
  }
}

interface RequestMenuProps {
  row: RequestRow;
  runNow: RunNow;
  onClose: () => void;
  onEdit: (row: RequestRow) => void;
  onRemove: (row: RequestRow) => void;
  onRunNow: () => void;
}

/** The More menu on a waiting or did-not-finish request (R-REQ-2): Edit,
 * "Just this, now" with what it costs, Remove from the inbox. Nothing on a
 * row starts a run except this one item. */
function RequestMenu({
  row,
  runNow,
  onClose,
  onEdit,
  onRemove,
  onRunNow,
}: RequestMenuProps): JSX.Element {
  function choose(action: () => void): () => void {
    return () => {
      onClose();
      action();
    };
  }
  const blocked = runNow.block !== null;
  return (
    <Queued id="request-menu" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="menu" label="Request actions" onClose={onClose}>
        <div class="pin-sheet-rows">
          {row.kind !== 'context' && (
            <button
              type="button"
              role="menuitem"
              class="pin-sheet-row"
              onClick={choose(() => {
                onEdit(row);
              })}
            >
              <span>Edit</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            class="pin-sheet-row bower-menu-now"
            disabled={blocked}
            aria-disabled={blocked}
            onClick={choose(onRunNow)}
          >
            <span>{RUN_NOW_LABEL}</span>
            <small>
              {runNow.reason ?? lowerFirst(RUN_NOW_LINE).replace(/\.$/, '')}
            </small>
          </button>
          <button
            type="button"
            role="menuitem"
            class="pin-sheet-row bower-menu-danger"
            onClick={choose(() => {
              onRemove(row);
            })}
          >
            <span>Remove from the inbox</span>
          </button>
        </div>
        <p class="bower-menu-foot">
          &ldquo;{RUN_NOW_LABEL}&rdquo; runs only this request and leaves
          everything else in the inbox for the tidy-up. It is off while a
          tidy-up is running.
        </p>
      </Overlay>
    </Queued>
  );
}

function RequestsList({
  rows,
  now,
  runStarted,
  runs,
  runNow,
  busy,
  onRules,
  onEdit,
  onRemove,
  onRunNow,
}: RequestsListProps): JSX.Element {
  // The row whose More menu is open, by key.
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const menuRow = rows.find((row) => row.key === menuKey) ?? null;
  return (
    <>
      <ul class="bower-requests">
        {rows.map((row) => (
          <li
            key={row.key}
            class={`bower-request bower-request--${toneOf(row.state)}`}
          >
            <StateIcon state={row.state} />
            <div class="bower-request-body">
              <p class="bower-request-head">
                <span class="bower-request-text">
                  {requestRowText(row.text)}
                </span>
                <span class={`bower-state bower-state--${toneOf(row.state)}`}>
                  {stateLabel(row)}
                </span>
              </p>
              <RequestMeta
                row={row}
                now={now}
                runStarted={runStarted}
                runs={runs}
                onRules={onRules}
              />
              {(row.state === 'waiting' || row.state === 'failed') &&
                row.fileId !== null && (
                  <div class="bower-request-actions">
                    <button
                      type="button"
                      class="chip bower-request-more"
                      aria-label="More for this request"
                      aria-haspopup="menu"
                      disabled={busy}
                      onClick={() => {
                        setMenuKey(row.key);
                      }}
                    >
                      <IconMore />
                    </button>
                  </div>
                )}
            </div>
          </li>
        ))}
      </ul>
      {menuRow !== null && (
        <RequestMenu
          row={menuRow}
          runNow={runNow}
          onClose={() => {
            setMenuKey(null);
          }}
          onEdit={onEdit}
          onRemove={onRemove}
          onRunNow={onRunNow}
        />
      )}
    </>
  );
}

/** The request Edit put in the box: Send rewrites that note. */
interface EditingRequest {
  id: string;
  /** The note as read, frontmatter included (`rewriteInstruction`). */
  note: string;
  /** What the save is checked against (`saveEditedNote`). */
  baseModifiedTime: string | null;
}

export function Bower(): JSX.Element {
  const { me } = useSession();
  const {
    index,
    files,
    fetchedAt,
    refresh,
    editRule,
    keepRule,
    openNoteForEdit,
    saveEditedNote,
  } = useVault();
  // #513: the run store's shared, minute-ticking clock (#537), so the
  // Requests rows' relative times agree with Home's cards and the working
  // sheet instead of each keeping (and rounding) their own.
  const { phase, run, now, lastFinished } = useRun();
  const runNow = useRunNow();
  const online = useOnline();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const { query } = useLocation();

  // Prefilled once from a `/bower?text=…` link (a note's "This was
  // misfiled", Health's "Ask Bower to fix these", an old `/tell` link):
  // read only on mount, so retyping never fights it.
  const [text, setText] = useState(() => query.text ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<SentRequest[]>([]);
  const [justKept, setJustKept] = useState<KeptSentence[]>([]);
  // Notes removed from here: gone from the list before the listing knows.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [segment, setSegment] = useState<Segment>(() =>
    query.show === 'activity' ? 'activity' : 'rules',
  );
  const wide = useMediaQuery(WIDE_QUERY);
  const [examples] = useState(() => examplesFor(visits++));
  // `null` until the person toggles it: open the first time, closed after.
  const [tipOpen, setTipOpen] = useState<boolean | null>(null);
  // The rule Change it put in the box: Send rewrites it in place.
  const [changing, setChanging] = useState<RuleRef | null>(null);
  // The request Edit put in the box: Send rewrites its note.
  const [editing, setEditing] = useState<EditingRequest | null>(null);
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const [requestsMessage, setRequestsMessage] = useState<string | null>(null);
  // One line under the box confirming what Send just did (#507): "Kept as
  // a rule", "Already in your rules", "Will go with the next tidy-up".
  // Reset on every new Send.
  const [sendConfirm, setSendConfirm] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [listening, setListening] = useState(false);

  useShellSlot('crumb', CRUMB);

  // Waiting instructions and answered notes both, so an answered row can
  // read the question it actually holds, not just the short title in its
  // file name (#465).
  const texts = useNoteTexts([...waitingNotes(files), ...answerNotes(files)]);

  // A request sent from here counts as seen once a listing shows its note:
  // from then on the listing alone says whether it is still waiting (#491).
  useEffect(() => {
    const names = new Set(waitingNotes(files).map((file) => file.name));
    setJustSent((list) =>
      list.some((item) => item.seen !== true && names.has(item.name))
        ? list.map((item) =>
            item.seen !== true && names.has(item.name)
              ? { ...item, seen: true }
              : item,
          )
        : list,
    );
  }, [files]);
  const rulesLoad = useFileText(index?.byPath.get(RULES_PATH));
  const inFlight = phase === 'queued' || phase === 'running';
  // The finished runs: Requests shows what each one did or dropped
  // (R-REQ-1), Activity its cards. Read only once Requests or Activity is
  // on screen (`GET /runs` is a few KV reads).
  const runsLoad = useRuns(
    segment !== 'rules' || wide,
    lastFinished?.finishedAt ?? null,
  );
  const runs = runsLoad.status === 'ready' ? runsLoad.runs : [];
  const rows = requestRows({
    runs,
    files,
    fetchedAt,
    texts,
    justSent,
    runSince: inFlight ? (run?.requestedAt ?? null) : null,
    rules:
      rulesLoad.status === 'ready' ? allRules(parseRules(rulesLoad.text)) : [],
    justKept,
  }).filter((row) => row.fileId === null || !removed.has(row.fileId));
  // First time: the folder and the rules are read, and nothing was ever
  // asked (board Phone-Bower-Empty).
  const firstTime =
    fetchedAt !== null && rulesLoad.status !== 'loading' && rows.length === 0;
  const showTip = tipOpen ?? firstTime;
  const canSend =
    text.trim() !== '' &&
    !sending &&
    (changing !== null || editing !== null || inboxFolderId !== null) &&
    online;

  /** Writes `request` as an instruction note in the inbox and lists it
   * under Requests; `false` when it did not go through. */
  async function sendRequest(request: string): Promise<boolean> {
    if (inboxFolderId === null) return false;
    const now = new Date();
    const name = instructionFileName(request, '', now);
    const content = instructionNote(request, now, 'request');

    try {
      await createTextFile(inboxFolderId, name, content, {
        appProperties: INSTRUCTION_APP_PROPERTIES,
      });
    } catch (err) {
      console.error(err);
      return false;
    }

    // No run starts here: the note waits in the inbox for the next tidy-up.
    // The listing catches up now rather than on its next background
    // revalidation, so Home's Inbox count includes it, as after Add
    // (#289); until it does, `justSent` keeps the row under Requests.
    void refresh();
    const item: SentRequest = {
      name,
      text: request,
      sentAt: now.toISOString(),
    };
    setJustSent((list) => [item, ...list]);
    setSegment('requests');
    return true;
  }

  /** Send with a request in the box (Edit): its note rewritten with the
   * new words, the frontmatter kept, no run. */
  async function saveEdit(
    edit: EditingRequest,
    changed: string,
  ): Promise<void> {
    try {
      await saveEditedNote(edit.id, rewriteInstruction(edit.note, changed), {
        baseModifiedTime: edit.baseModifiedTime,
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof SaveError && err.code === 'conflict'
          ? 'Your notes changed meanwhile. Try again.'
          : 'Could not save that. Try again.',
      );
      return;
    }
    setEditing(null);
    setText('');
    setSegment('requests');
  }

  /** Send with a rule in the box (Change it): that rule's line rewritten
   * in `Rules.md` through `rules.ts`, no note, no run. */
  async function saveChange(rule: RuleRef, changed: string): Promise<void> {
    try {
      await editRule({ kind: 'change', rule, text: changed });
    } catch (err) {
      console.error(err);
      setError(writeError(err));
      return;
    }
    setChanging(null);
    setText('');
    setRulesMessage(`Changed: ${changed}`);
    setSegment('rules');
  }

  /** Whether `sentence` is already a rule in `Rules.md`, the same
   * dedup check `keepRule`'s own write path (`appendRule`) makes, so the
   * confirmation line (#507) can tell "Kept as a rule" from "Already in
   * your rules" before the write even starts. */
  function ruleAlreadyKept(sentence: string): boolean {
    if (rulesLoad.status !== 'ready') return false;
    const bullet = ruleBullet(dropRuleLead(sentence), dayOf(new Date()));
    const wanted = allRules(parseRules(bullet))[0]?.text;
    if (wanted === undefined) return false;
    return allRules(parseRules(rulesLoad.text)).some(
      (rule) => rule.text === wanted,
    );
  }

  /** A rule sentence (#343): kept at once in `Rules.md`, no note, no run,
   * and listed under Requests as Rule kept. */
  async function keepRuleNow(sentence: string): Promise<void> {
    const already = ruleAlreadyKept(sentence);
    try {
      await keepRule(sentence);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof SaveError && err.code === 'conflict'
          ? 'Your notes changed meanwhile. Try again.'
          : 'Could not keep that rule. Try again.',
      );
      return;
    }
    setJustKept((list) => [
      { text: sentence, since: new Date().toISOString() },
      ...list,
    ]);
    setText('');
    setSegment('requests');
    setSendConfirm(already ? 'Already in your rules' : 'Kept as a rule');
  }

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (!canSend) return;

    setSending(true);
    setError(null);
    setSendConfirm(null);
    if (editing !== null) {
      await saveEdit(editing, trimmed);
    } else if (changing !== null) {
      await saveChange(changing, trimmed);
    } else if (sentenceKind(trimmed) === 'rule') {
      await keepRuleNow(trimmed);
    } else if (await sendRequest(trimmed)) {
      setText('');
      // Idle: the Requests segment already shows the new Waiting row at
      // once. Mid-run, that row is easy to miss under "Tidying up…", so
      // it gets a word of its own (#507, #552): since #491 a request sent
      // during a run is held for the *next* one, same as the row's own
      // "goes with the next tidy-up".
      if (inFlight) setSendConfirm('Will go with the next tidy-up');
    } else {
      setError('Could not send that. Try again.');
    }
    setSending(false);
  }

  function changeRule(rule: Rule): void {
    setEditing(null);
    setChanging({ line: rule.line, raw: rule.raw });
    setText(rule.text);
    setError(null);
    setRulesMessage(null);
    setSendConfirm(null);
    // After the sheet has closed and handed focus back to the rule.
    window.setTimeout(() => {
      boxRef.current?.focus();
    }, 0);
  }

  function cancelChange(): void {
    setChanging(null);
    setEditing(null);
    setText('');
    setError(null);
    setSendConfirm(null);
  }

  /** Edit on a waiting request: the note read fresh, its words in the box. */
  async function editRequest(row: RequestRow): Promise<void> {
    if (row.fileId === null) return;
    setRequestsMessage(null);
    setError(null);
    setSendConfirm(null);
    let fresh: { text: string; modifiedTime: string | null };
    try {
      fresh = await openNoteForEdit(row.fileId);
    } catch (err) {
      console.error(err);
      setRequestsMessage('Could not open that request. Try again.');
      return;
    }
    setChanging(null);
    setEditing({
      id: row.fileId,
      note: fresh.text,
      baseModifiedTime: fresh.modifiedTime,
    });
    setText(instructionBody(fresh.text));
    boxRef.current?.focus();
  }

  /** Remove on a waiting request: its note goes to Drive's Trash. */
  async function removeRequest(row: RequestRow): Promise<void> {
    const id = row.fileId;
    if (id === null || sending) return;
    setSending(true);
    setRequestsMessage(null);
    try {
      await deleteFile(id);
    } catch (err) {
      console.error(err);
      setRequestsMessage('Could not remove that. Try again.');
      setSending(false);
      return;
    }
    setRemoved((set) => new Set(set).add(id));
    // Sent from this screen: its row must not come back from `justSent`
    // while the listing catches up (#491).
    setJustSent((list) =>
      list.filter((item) => `request-${item.name}` !== row.key),
    );
    if (editing?.id === id) cancelChange();
    // Home's Inbox count and the listing catch up now.
    void refresh();
    setSending(false);
  }

  /** "Just this, now" (R-REQ-3): the shared helper starts an
   * instructions-only run. The note is written already (Edit saves before
   * its Send returns), so there is no save left to wait for. */
  async function runThisNow(): Promise<void> {
    setRequestsMessage(null);
    let started = false;
    try {
      started = await runNow.run();
    } catch (err) {
      console.error(err);
    }
    if (!started) {
      setRequestsMessage(
        "Couldn't start Bower now. Your request goes with the next tidy-up.",
      );
    }
  }

  async function applyRule(rule: Rule): Promise<void> {
    if (!online) {
      setRulesMessage(offlineReason('tell'));
      return;
    }
    if (sending) return;
    setSending(true);
    setRulesMessage(null);
    if (!(await sendRequest(applyToFiledRequest(rule.text)))) {
      setRulesMessage('Could not send that. Try again.');
    }
    setSending(false);
  }

  function pickExample(example: string): void {
    setText(example);
    boxRef.current?.focus();
  }

  function selectSegment(id: Segment, focus: boolean): void {
    setSegment(id);
    if (focus) document.getElementById(`bower-tab-${id}`)?.focus();
  }

  // Arrow keys, Home and End move between the three tabs (WAI-ARIA tabs).
  function onTabKey(event: JSX.TargetedKeyboardEvent<HTMLDivElement>): void {
    const at = SEGMENTS.findIndex((tab) => tab.id === segment);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (at + 1) % SEGMENTS.length;
        break;
      case 'ArrowLeft':
        next = (at - 1 + SEGMENTS.length) % SEGMENTS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = SEGMENTS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const tab = SEGMENTS[next];
    if (tab !== undefined) selectSegment(tab.id, true);
  }

  // The three panels' contents: tabs under 1200 px, three columns from
  // there (#357, Desktop-Bower board).
  const panels: Record<Segment, JSX.Element> = {
    rules: (
      <RulesPanel
        message={rulesMessage}
        onMessage={setRulesMessage}
        onChange={changeRule}
        onApply={(rule) => void applyRule(rule)}
      />
    ),
    requests: (
      <>
        <p class="bower-panel-note">
          What you ask waits in your inbox and Bower does it at the next
          tidy-up.
        </p>
        {requestsMessage !== null && (
          <p class="auth-error" role="alert">
            {requestsMessage}
          </p>
        )}
        {rows.length > 0 && (
          <RequestsList
            rows={rows}
            now={now}
            runStarted={
              inFlight && run !== null
                ? (run.startedAt ?? run.requestedAt)
                : null
            }
            runs={runs}
            runNow={runNow}
            busy={sending}
            onRules={() => {
              selectSegment('rules', true);
            }}
            onEdit={(row) => void editRequest(row)}
            onRemove={(row) => void removeRequest(row)}
            onRunNow={() => void runThisNow()}
          />
        )}
      </>
    ),
    // Read only when shown: `GET /runs` is a few KV reads per visit.
    activity:
      segment === 'activity' || wide ? (
        <ActivityPanel load={runsLoad} />
      ) : (
        <></>
      ),
  };

  return (
    <section class="bower-screen">
      <h1 class="screen-title">Bower</h1>

      <div class="bower-box">
        <div class="bower-box-intro">
          <Bird state={listening ? 'listening' : 'looking'} size={56} />
          <p class="bower-bubble">
            {listening
              ? "I'm listening. Speak as you would to a person."
              : 'Tell me what you want, in your words. I work out whether it is a rule, a job or a question.'}
          </p>
        </div>
        <div class="bower-box-row">
          <DictateButton
            class="bower-dictate"
            inputClass="bower-textarea"
            inputRef={boxRef}
            label="Tell Bower what to do, or ask it something"
            placeholder="For example: from now on, file every receipt under Finance"
            rows={2}
            value={text}
            onValue={setText}
            onListening={setListening}
          />
          <button
            type="button"
            class="button bower-send"
            aria-label={sending ? 'Sending' : 'Send'}
            disabled={!canSend}
            aria-disabled={!canSend}
            onClick={() => void handleSend()}
          >
            <IconSend />
          </button>
        </div>
        {(changing !== null || editing !== null) && (
          <p class="bower-changing">
            <span>
              {editing !== null
                ? 'Changing a request: Send saves it in its place.'
                : 'Changing a rule: Send saves it in its place.'}
            </span>
            <button
              type="button"
              class="bower-changing-cancel"
              onClick={cancelChange}
            >
              Cancel
            </button>
          </p>
        )}
        {error !== null && <p class="auth-error">{error}</p>}
        {!online && <p class="offline-reason">{offlineReason('tell')}</p>}
        {/* #553: always in the markup, empty until Send sets it, so the
            region exists before the text does (WCAG 4.1.3) — an element
            mounted only once there is something to say is never picked up
            by a screen reader's live-region announcement. */}
        <p class="bower-send-confirm" aria-live="polite">
          {sendConfirm}
        </p>
      </div>

      <Tip
        open={showTip}
        onToggle={() => {
          setTipOpen(!showTip);
        }}
        examples={examples}
        onPick={pickExample}
      />

      {wide ? (
        <div class="bower-columns">
          {SEGMENTS.map(({ id, label }) => (
            <section
              key={id}
              class="bower-column"
              aria-labelledby={`bower-column-${id}`}
            >
              <h2 class="bower-column-head" id={`bower-column-${id}`}>
                {label}
              </h2>
              {panels[id]}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div
            class="bower-segments"
            role="tablist"
            aria-label="Rules, requests and activity"
            onKeyDown={onTabKey}
          >
            {SEGMENTS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`bower-tab-${id}`}
                class="bower-segment"
                aria-selected={segment === id}
                aria-controls={`bower-panel-${id}`}
                tabIndex={segment === id ? 0 : -1}
                onClick={() => {
                  selectSegment(id, false);
                }}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>

          {SEGMENTS.map(({ id }) => (
            <div
              key={id}
              role="tabpanel"
              id={`bower-panel-${id}`}
              aria-labelledby={`bower-tab-${id}`}
              class="bower-panel"
              hidden={segment !== id}
            >
              {panels[id]}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
