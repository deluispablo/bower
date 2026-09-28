/**
 * The Bower tab (#340, spec C.7; boards Phone-Bower and Phone-Bower-Empty):
 * one box with no Rule/Task/Question selector, the "?" tip with rotating
 * examples, and three segments, Rules · Requests · Activity.
 *
 * Send writes an instruction note (`kind: request`) into the inbox through
 * the same writer as before (`tell.ts`, `createTextFile`) and starts no
 * run (Part A 6.2.5): it waits for the next tidy-up like anything else in
 * the inbox, and shows under Requests as Waiting. Rules and Activity hold
 * one sentence each until their own screens land (#342, #345); Requests
 * gets its full states in #344.
 */

import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { examplesFor, sinceLabel, waitingRequests } from '../bower-tab.js';
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
import { useShellSlot } from '../components/shell-slots.js';
import { INSTRUCTION_APP_PROPERTIES, createTextFile } from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import { useSession } from '../session.js';
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
            document&hellip;&rdquo;) or a question, in your words. Each one
            waits for the next tidy-up. Tap one:
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

function RequestsList({
  waiting,
  now,
}: {
  waiting: WaitingRequest[];
  now: number;
}): JSX.Element {
  return (
    <ul class="bower-requests">
      {waiting.map((request) => (
        <li key={request.name} class="bower-request">
          <IconChat />
          <div class="bower-request-body">
            <p class="bower-request-head">
              <span class="bower-request-text">{request.text}</span>
              <span class="bower-state bower-state--waiting">Waiting</span>
            </p>
            <p class="bower-request-meta">
              {sinceLabel(request.since, now)} · goes with the next tidy-up
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Bower(): JSX.Element {
  const { me } = useSession();
  const { files, fetchedAt, refresh } = useVault();
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
  const [segment, setSegment] = useState<Segment>('rules');
  const [examples] = useState(() => examplesFor(visits++));
  // `null` until the person toggles it: open the first time, closed after.
  const [tipOpen, setTipOpen] = useState<boolean | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useShellSlot('crumb', CRUMB);

  const waiting = waitingRequests({ files, fetchedAt, sent, justSent });
  // First time: the folder is listed, nothing waits and this device never
  // sent anything (board Phone-Bower-Empty).
  const firstTime =
    fetchedAt !== null && waiting.length === 0 && sent.length === 0;
  const showTip = tipOpen ?? firstTime;
  const canSend =
    text.trim() !== '' && !sending && inboxFolderId !== null && online;

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || sending || inboxFolderId === null || !online) return;

    setSending(true);
    setError(null);

    const now = new Date();
    const name = instructionFileName(trimmed, '', now);
    const content = instructionNote(trimmed, now, 'request');

    try {
      await createTextFile(inboxFolderId, name, content, {
        appProperties: INSTRUCTION_APP_PROPERTIES,
      });
    } catch (err) {
      console.error(err);
      setError('Could not send that. Try again.');
      setSending(false);
      return;
    }

    // No run starts here: the note waits in the inbox for the next tidy-up.
    // The listing catches up now rather than on its next background
    // revalidation, so Home's Inbox count includes it, as after Add
    // (#289); until it does, `justSent` keeps the row under Requests.
    void refresh();
    const item: SentItem = { name, text: trimmed, sentAt: now.toISOString() };
    setSent(addSent(item));
    setJustSent((list) => [item, ...list]);
    setText('');
    setSegment('requests');
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
        {firstTime ? (
          <div class="bower-first">
            <Bird state="looking" size={84} />
            <h2>Nothing yet</h2>
            <p>
              Bower files things its own way until you tell it yours. Write one
              above, in your words.
            </p>
          </div>
        ) : (
          <p class="bower-panel-note">
            Your rules will show here, grouped by topic.
          </p>
        )}
      </div>

      <div
        role="tabpanel"
        id="bower-panel-requests"
        aria-labelledby="bower-tab-requests"
        class="bower-panel"
        hidden={segment !== 'requests'}
      >
        <p class="bower-panel-note">
          What you send waits here for the next tidy-up.
        </p>
        {waiting.length > 0 && <RequestsList waiting={waiting} now={now} />}
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
