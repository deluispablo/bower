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
 * Activity holds one sentence until its screen lands (#345); Requests gets
 * its full states in #344.
 */

import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import {
  examplesFor,
  sentenceKind,
  sinceLabel,
  waitingRequests,
} from '../bower-tab.js';
import type { WaitingRequest } from '../bower-tab.js';
import { Bird } from '../components/bird.js';
import {
  IconChat,
  IconClock,
  IconHelp,
  IconSend,
  IconShield,
  IconSparkle,
} from '../components/icons.js';
import { RulesPanel, writeError } from '../components/rules-panel.js';
import { useShellSlot } from '../components/shell-slots.js';
import {
  INSTRUCTION_APP_PROPERTIES,
  SaveError,
  createTextFile,
} from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import { useSession } from '../session.js';
import { applyToFiledRequest } from '../rules.js';
import type { Rule, RuleRef } from '../rules.js';
import { IDEAS_PATH } from '../shell-routes.js';
import {
  addSent,
  instructionFileName,
  instructionNote,
  loadSent,
} from '../tell.js';
import type { SentItem } from '../tell.js';
import { useVault } from '../vault-store.js';
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

/** A rule sentence kept at once from this screen (#343). */
interface KeptRule {
  text: string;
  /** ISO-8601. */
  since: string;
}

type RequestRow =
  | ({ kind: 'waiting' } & WaitingRequest)
  | ({ kind: 'kept'; name: string } & KeptRule);

function RequestsList({
  rows,
  now,
  onRules,
}: {
  rows: RequestRow[];
  now: number;
  onRules: () => void;
}): JSX.Element {
  return (
    <ul class="bower-requests">
      {rows.map((row) => (
        <li key={row.name} class="bower-request">
          {row.kind === 'kept' ? <IconShield /> : <IconChat />}
          <div class="bower-request-body">
            <p class="bower-request-head">
              <span class="bower-request-text">{row.text}</span>
              {row.kind === 'kept' ? (
                <span class="bower-state bower-state--kept">Rule kept</span>
              ) : (
                <span class="bower-state bower-state--waiting">
                  Waiting · {sentenceKind(row.text)}
                </span>
              )}
            </p>
            <p class="bower-request-meta">
              {sinceLabel(row.since, now)} ·{' '}
              {row.kind === 'kept' ? (
                <button
                  type="button"
                  class="bower-request-link"
                  onClick={onRules}
                >
                  In your rules
                </button>
              ) : (
                'goes with the next tidy-up'
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Bower(): JSX.Element {
  const { me } = useSession();
  const { files, fetchedAt, refresh, editRule, keepRule } = useVault();
  const online = useOnline();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const { query } = useLocation();

  // Prefilled once from a `/bower?text=…` link (a note's "This was
  // misfiled", Health's "Ask Bower to fix these", an old `/tell` link):
  // read only on mount, so retyping never fights it.
  const [text, setText] = useState(() => query.text ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentItem[]>(() => loadSent());
  const [justSent, setJustSent] = useState<SentItem[]>([]);
  const [kept, setKept] = useState<KeptRule[]>([]);
  const [segment, setSegment] = useState<Segment>('rules');
  const [examples] = useState(() => examplesFor(visits++));
  // `null` until the person toggles it: open the first time, closed after.
  const [tipOpen, setTipOpen] = useState<boolean | null>(null);
  // The rule Change it put in the box: Send rewrites it in place.
  const [changing, setChanging] = useState<RuleRef | null>(null);
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useShellSlot('crumb', CRUMB);

  const waiting = waitingRequests({ files, fetchedAt, sent, justSent });
  // First time: the folder is listed, nothing waits and this device never
  // sent anything (board Phone-Bower-Empty).
  const firstTime =
    fetchedAt !== null &&
    waiting.length === 0 &&
    sent.length === 0 &&
    kept.length === 0;
  const showTip = tipOpen ?? firstTime;
  const canSend =
    text.trim() !== '' &&
    !sending &&
    (changing !== null || inboxFolderId !== null) &&
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
    const item: SentItem = { name, text: request, sentAt: now.toISOString() };
    setSent(addSent(item));
    setJustSent((list) => [item, ...list]);
    setSegment('requests');
    return true;
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
    setKept((list) => [
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
    if (changing !== null) {
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
    setText('');
    setError(null);
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
    const index = SEGMENTS.findIndex((tab) => tab.id === segment);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % SEGMENTS.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + SEGMENTS.length) % SEGMENTS.length;
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
  const rows: RequestRow[] = [
    ...kept.map((rule, i): RequestRow => ({
      kind: 'kept',
      name: `kept-${String(kept.length - i)}`,
      ...rule,
    })),
    ...waiting.map((request): RequestRow => ({ kind: 'waiting', ...request })),
  ].sort((a, b) => b.since.localeCompare(a.since));

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
        {changing !== null && (
          <p class="bower-changing">
            <span>Changing a rule: Send saves it in its place.</span>
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
          What you asked for, and what came of it. A rule starts at once; a job
          or a question waits for the next tidy-up.
        </p>
        {rows.length > 0 && (
          <RequestsList
            rows={rows}
            now={now}
            onRules={() => {
              selectSegment('rules', true);
            }}
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
