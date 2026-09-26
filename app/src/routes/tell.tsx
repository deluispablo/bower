import { useState } from 'preact/hooks';

import { ApiError, startProcess } from '../api.js';
import { createTextFile } from '../drive.js';
import { useSession } from '../session.js';
import {
  addSent,
  instructionFileName,
  instructionNote,
  loadSent,
} from '../tell.js';
import type { SentItem } from '../tell.js';

interface Example {
  label: string;
  text: string;
}

const EXAMPLES: Example[] = [
  {
    label: 'A rule',
    text: 'From now on, file recipes under Cooking and tag them #recipe',
  },
  {
    label: 'A task',
    text: 'Summarise the PDF I added today in three bullet points',
  },
  {
    label: 'A question',
    text: 'What did I save about trip planning last month?',
  },
];

const SENT_MESSAGE = 'Sent. Bower is on it.';
const QUOTA_MESSAGE = 'Daily limit reached, Bower will run it tomorrow.';

/** The first line of `text`, shortened if it runs long. */
function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

/** A compact "sent at" label, e.g. "Sep 26, 14:05". */
function formatSentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Tell() {
  const { me } = useSession();
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;

  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sent, setSent] = useState<SentItem[]>(() => loadSent());

  const canSend = text.trim() !== '' && !sending && inboxFolderId !== null;

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || sending || inboxFolderId === null) return;

    setSending(true);
    setError(null);
    setStatus(null);

    const now = new Date();
    const name = instructionFileName(trimmed, title, now);
    const content = instructionNote(trimmed, now);

    try {
      await createTextFile(inboxFolderId, name, content);
    } catch (err) {
      console.error(err);
      setError('Could not send that. Try again.');
      setSending(false);
      return;
    }

    // The note is safely in the inbox at this point, so it counts as sent
    // whatever happens next: a quota hit is expected and shown to the user;
    // any other /process failure just means the next Process press (or a
    // later run) picks the note up, so it is logged rather than blocking.
    let message = SENT_MESSAGE;
    try {
      await startProcess();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quota') {
        message = QUOTA_MESSAGE;
      } else {
        console.error(err);
      }
    }

    setSent(addSent({ name, text: trimmed, sentAt: now.toISOString() }));
    setText('');
    setTitle('');
    setStatus(message);
    setSending(false);
  }

  return (
    <section>
      <h1>Tell Bower</h1>

      <div class="tell-examples">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            class="chip"
            onClick={() => setText(example.text)}
          >
            {example.label}
          </button>
        ))}
      </div>

      <div class="tell-form">
        <label for="tell-title">Title (optional)</label>
        <input
          id="tell-title"
          type="text"
          value={title}
          onInput={(event) => {
            setTitle((event.target as HTMLInputElement).value);
          }}
        />

        <label for="tell-text">Message</label>
        <textarea
          id="tell-text"
          class="tell-textarea"
          placeholder="A rule, a task or a question. For example: file every receipt under Finance."
          value={text}
          onInput={(event) => {
            setText((event.target as HTMLTextAreaElement).value);
          }}
        />

        {error !== null && <p class="auth-error">{error}</p>}
        {status !== null && <p class="tell-status">{status}</p>}

        <button
          type="button"
          class="button"
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      <h2>Sent</h2>
      {sent.length === 0 ? (
        <p>Nothing sent yet.</p>
      ) : (
        <ul class="tell-sent-list">
          {sent.map((item) => (
            <li key={`${item.name}-${item.sentAt}`} class="tell-sent-item">
              <div class="tell-sent-header">
                <strong>{item.name}</strong>
                <span class="tell-sent-time">
                  {formatSentTime(item.sentAt)}
                </span>
              </div>
              <p class="tell-sent-preview">{firstLine(item.text)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
