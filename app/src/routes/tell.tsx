import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { Bird } from '../components/bird.js';
import { useFocusTrap } from '../components/use-focus-trap.js';
import { IconClock, IconClose } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';
import { TellComposer } from '../components/tell-composer.js';
import { INSTRUCTION_APP_PROPERTIES, createTextFile } from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import {
  addSent,
  firstLine,
  instructionFileName,
  instructionNote,
  loadSent,
  statusLineFor,
} from '../tell.js';
import type { RunSnapshot, SentItem } from '../tell.js';

/** The bird's opening line (spec §6, Tell Bower row). */
const OPENING_LINE =
  "A rule, a task or a question. I'll put it in your inbox and get to it on the next tidy-up.";

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Bower</h1>;

interface TellHistoryProps {
  sent: SentItem[];
  runSnapshot: RunSnapshot;
  onClose: () => void;
}

/**
 * The full sent list, as a modal dialog (spec §6): the same dialog pattern
 * as the explorer drawer (#140) — `role="dialog"`, focus trapped inside
 * while open, Escape and the close button both dismiss it.
 */
function TellHistory({
  sent,
  runSnapshot,
  onClose,
}: TellHistoryProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  return (
    <div class="tell-history">
      <div class="tell-history-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="tell-history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Sent history"
        tabIndex={-1}
      >
        <div class="tell-history-head">
          <h2>Sent</h2>
          <button
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        {sent.length === 0 ? (
          <p>Nothing sent yet.</p>
        ) : (
          <ul class="tell-history-list">
            {sent.map((item) => (
              <li key={`${item.name}-${item.sentAt}`} class="tell-history-item">
                <p class="tell-history-text">{firstLine(item.text)}</p>
                <p class="tell-status-line">
                  {statusLineFor(item, runSnapshot)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Tell() {
  const { me } = useSession();
  const { phase, run, process } = useRun();
  const online = useOnline();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const { query } = useLocation();

  // Prefilled once, e.g. from the health check's "Ask Bower to fix these"
  // (`/bower?text=…`, #148; old `/tell` links redirect here): read only on mount, so retyping never fights it.
  const [text, setText] = useState(() => query.text ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentItem[]>(() => loadSent());
  const [historyOpen, setHistoryOpen] = useState(false);

  useShellSlot('crumb', CRUMB);

  const runSnapshot: RunSnapshot = { phase, run };
  const canSend =
    text.trim() !== '' && !sending && inboxFolderId !== null && online;

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || sending || inboxFolderId === null || !online) return;

    setSending(true);
    setError(null);

    const now = new Date();
    // No separate title field in the conversation view: the note's name
    // falls back to the first six words of the message, same as before.
    const name = instructionFileName(trimmed, '', now);
    const content = instructionNote(trimmed, now);

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

    // The note is safely in the inbox at this point, so it counts as sent
    // whatever the run does next (queued, quota, failed…): the bubble's own
    // status line is where that shows now.
    void process();

    setSent(addSent({ name, text: trimmed, sentAt: now.toISOString() }));
    setText('');
    setSending(false);
  }

  return (
    <section class="tell-screen">
      <div class="tell-head">
        <h1 class="screen-title">Tell Bower</h1>
        <button
          type="button"
          class="icon-button"
          aria-label="Sent history"
          aria-haspopup="dialog"
          aria-expanded={historyOpen}
          onClick={() => {
            setHistoryOpen(true);
          }}
        >
          <IconClock />
        </button>
      </div>

      <div class="tell-feed">
        <div class="tell-row tell-row--bird">
          <Bird state="looking" size={44} />
          <p class="tell-bubble tell-bubble--bird">{OPENING_LINE}</p>
        </div>
        {[...sent].reverse().map((item) => (
          <div
            key={`${item.name}-${item.sentAt}`}
            class="tell-row tell-row--sent"
          >
            <p class="tell-bubble tell-bubble--sent">{item.text}</p>
            <p class="tell-status-line">{statusLineFor(item, runSnapshot)}</p>
          </div>
        ))}
      </div>

      {error !== null && <p class="auth-error">{error}</p>}
      {!online && <p class="offline-reason">{offlineReason('tell')}</p>}

      <TellComposer
        value={text}
        onChange={setText}
        onSubmit={() => void handleSend()}
        disabled={!canSend}
        sending={sending}
      />

      {historyOpen && (
        <TellHistory
          sent={sent}
          runSnapshot={runSnapshot}
          onClose={() => {
            setHistoryOpen(false);
          }}
        />
      )}
    </section>
  );
}
