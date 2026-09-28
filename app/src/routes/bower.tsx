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
 * Activity holds one sentence until its screen lands (#345).
 *
 * Requests (#344, board Phone-Bower-Requests) lists every request with its
 * state, all read from the Bower folder (`requestRows`): Waiting (with
 * Edit, Remove and Do it now), Tidying up, Answered, Rule kept. Edit fills
 * the box with the note's words and Send then rewrites that note; Remove
 * moves it to Drive's Trash; Do it now opens the "Is that everything?"
 * confirmation for an instructions-only run.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import {
  answerNotes,
  dayLabel,
  examplesFor,
  requestRows,
  sentenceKind,
  sinceLabel,
  stateLabel,
  waitingNotes,
} from '../bower-tab.js';
import type {
  KeptSentence,
  RequestRow,
  RequestState,
  SentRequest,
} from '../bower-tab.js';
import { Bird } from '../components/bird.js';
import {
  IconChat,
  IconCheck,
  IconClock,
  IconHelp,
  IconInbox,
  IconSend,
  IconShield,
  IconSparkle,
} from '../components/icons.js';
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
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { allRules, applyToFiledRequest, parseRules } from '../rules.js';
import type { Rule, RuleRef } from '../rules.js';
import { IDEAS_PATH } from '../shell-routes.js';
import {
  instructionBody,
  instructionFileName,
  instructionNote,
  rewriteInstruction,
} from '../tell.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/bower.css';

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Bower</h1>;

type Segment = 'rules' | 'requests' | 'activity';

interface SegmentTab {
  id: Segment;
  label: string;
  Icon: () => JSX.Element;
}

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
 * the inbox while the run has it, a tick once something came of it. */
function StateIcon({ state }: { state: RequestState }): JSX.Element {
  if (state === 'waiting') return <IconClock />;
  if (state === 'tidying') return <IconInbox />;
  return <IconCheck />;
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
  /** When the run in flight started, for "started 2 min ago". */
  runStarted: string | null;
  /** Do it now is offered (no run in flight, online). */
  canRunNow: boolean;
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
  onRules,
}: Pick<RequestsListProps, 'now' | 'runStarted' | 'onRules'> & {
  row: RequestRow;
}): JSX.Element {
  switch (row.state) {
    case 'waiting':
      return (
        <p class="bower-request-meta">
          {sinceLabel(row.since, now)} · goes with the next tidy-up
        </p>
      );
    case 'tidying':
      return (
        <p class="bower-request-meta">
          started {sinceLabel(runStarted ?? row.since, now)}
        </p>
      );
    case 'answered':
      return (
        <p class="bower-request-meta">
          {sinceLabel(row.since, now)} ·{' '}
          <a class="bower-request-link" href={`/note/${row.fileId ?? ''}`}>
            Read the answer
          </a>
        </p>
      );
    case 'kept':
      return (
        <p class="bower-request-meta">
          {dayLabel(row.since)} ·{' '}
          <button type="button" class="bower-request-link" onClick={onRules}>
            In your rules
          </button>
        </p>
      );
    default: {
      const exhaustive: never = row.state;
      return exhaustive;
    }
  }
}

function RequestsList({
  rows,
  now,
  runStarted,
  canRunNow,
  busy,
  onRules,
  onEdit,
  onRemove,
  onRunNow,
}: RequestsListProps): JSX.Element {
  return (
    <ul class="bower-requests">
      {rows.map((row) => (
        <li key={row.key} class={`bower-request bower-request--${row.state}`}>
          <StateIcon state={row.state} />
          <div class="bower-request-body">
            <p class="bower-request-head">
              <span class="bower-request-text">{row.text}</span>
              <span class={`bower-state bower-state--${row.state}`}>
                {stateLabel(row)}
              </span>
            </p>
            <RequestMeta
              row={row}
              now={now}
              runStarted={runStarted}
              onRules={onRules}
            />
            {row.state === 'waiting' && row.fileId !== null && (
              <div class="bower-request-actions">
                {row.kind !== 'context' && (
                  <button
                    type="button"
                    class="chip"
                    disabled={busy}
                    onClick={() => {
                      onEdit(row);
                    }}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  class="chip"
                  disabled={busy}
                  onClick={() => {
                    onRemove(row);
                  }}
                >
                  Remove
                </button>
                {canRunNow && (
                  <button
                    type="button"
                    class="chip bower-request-now"
                    disabled={busy}
                    onClick={onRunNow}
                  >
                    Do it now
                  </button>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
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
  const { phase, run, doItNow } = useRun();
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
  const [segment, setSegment] = useState<Segment>('rules');
  const [examples] = useState(() => examplesFor(visits++));
  // `null` until the person toggles it: open the first time, closed after.
  const [tipOpen, setTipOpen] = useState<boolean | null>(null);
  // The rule Change it put in the box: Send rewrites it in place.
  const [changing, setChanging] = useState<RuleRef | null>(null);
  // The request Edit put in the box: Send rewrites its note.
  const [editing, setEditing] = useState<EditingRequest | null>(null);
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const [requestsMessage, setRequestsMessage] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useShellSlot('crumb', CRUMB);

  // Waiting instructions and answered notes both, so an answered row can
  // read the question it actually holds, not just the short title in its
  // file name (#465).
  const texts = useNoteTexts([...waitingNotes(files), ...answerNotes(files)]);
  const rulesLoad = useFileText(index?.byPath.get(RULES_PATH));
  const inFlight = phase === 'queued' || phase === 'running';
  const rows = requestRows({
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

  /** A rule sentence (#343): kept at once in `Rules.md`, no note, no run,
   * and listed under Requests as Rule kept. */
  async function keepRuleNow(sentence: string): Promise<void> {
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
  }

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (!canSend) return;

    setSending(true);
    setError(null);
    if (editing !== null) {
      await saveEdit(editing, trimmed);
    } else if (changing !== null) {
      await saveChange(changing, trimmed);
    } else if (sentenceKind(trimmed) === 'rule') {
      await keepRuleNow(trimmed);
    } else if (await sendRequest(trimmed)) {
      setText('');
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
  }

  /** Edit on a waiting request: the note read fresh, its words in the box. */
  async function editRequest(row: RequestRow): Promise<void> {
    if (row.fileId === null) return;
    setRequestsMessage(null);
    setError(null);
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
    if (editing?.id === id) cancelChange();
    // Home's Inbox count and the listing catch up now.
    void refresh();
    setSending(false);
  }

  /** Do it now: the "Is that everything?" confirmation, counting the
   * requests that would go, for an instructions-only run. */
  function runNow(): void {
    doItNow(rows.filter((row) => row.state === 'waiting').length);
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

  const now = Date.now();

  return (
    <section class="bower-screen">
      <h1 class="screen-title">Bower</h1>

      <div class="bower-box">
        <div class="bower-box-intro">
          <Bird state="looking" size={44} />
          <p class="bower-bubble">
            Tell me what you want, in your words. I work out whether it is a
            rule, a job or a question.
          </p>
        </div>
        <div class="bower-box-row">
          <textarea
            ref={boxRef}
            class="bower-textarea"
            aria-label="Tell Bower what to do, or ask it something"
            placeholder="For example: from now on, file every receipt under Finance"
            value={text}
            onInput={(event) => {
              setText((event.target as HTMLTextAreaElement).value);
            }}
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
      </div>

      <Tip
        open={showTip}
        onToggle={() => {
          setTipOpen(!showTip);
        }}
        examples={examples}
        onPick={pickExample}
      />

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

      <div
        role="tabpanel"
        id="bower-panel-rules"
        aria-labelledby="bower-tab-rules"
        class="bower-panel"
        hidden={segment !== 'rules'}
      >
        <RulesPanel
          message={rulesMessage}
          onMessage={setRulesMessage}
          onChange={changeRule}
          onApply={(rule) => void applyRule(rule)}
        />
      </div>

      <div
        role="tabpanel"
        id="bower-panel-requests"
        aria-labelledby="bower-tab-requests"
        class="bower-panel"
        hidden={segment !== 'requests'}
      >
        <p class="bower-panel-note">
          What you asked for, and what came of it. Bower decides what each one
          is: a rule starts at once; a job or a question waits for the next
          tidy-up, or runs on its own with &ldquo;Do it now&rdquo;.
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
            canRunNow={!inFlight && online}
            busy={sending}
            onRules={() => {
              selectSegment('rules', true);
            }}
            onEdit={(row) => void editRequest(row)}
            onRemove={(row) => void removeRequest(row)}
            onRunNow={runNow}
          />
        )}
      </div>

      <div
        role="tabpanel"
        id="bower-panel-activity"
        aria-labelledby="bower-tab-activity"
        class="bower-panel"
        hidden={segment !== 'activity'}
      >
        <p class="bower-panel-note">
          What each tidy-up did will show here: what went where, and what was
          set aside.
        </p>
      </div>
    </section>
  );
}
