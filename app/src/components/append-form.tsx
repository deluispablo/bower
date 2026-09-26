import { useState } from 'preact/hooks';

import { ApiError } from '../api.js';
import { AppendError, DriveError } from '../drive.js';
import { offlineReason, useOnline } from '../online.js';
import '../styles/append-form.css';

interface AppendFormProps {
  /** Saves `text` at the end of the note; resolves once it is in Drive. */
  onAppend: (text: string) => Promise<void>;
}

/** One short sentence for a failed append; details go to the console. */
function errorSentence(err: unknown): string {
  if (err instanceof AppendError && err.code === 'conflict') {
    return 'This note changed somewhere else at the same moment. Try again.';
  }
  if (err instanceof AppendError && err.code === 'protected') {
    return 'Bower keeps this note up to date itself, so it cannot be added to here.';
  }
  if (
    (err instanceof DriveError || err instanceof ApiError) &&
    err.status === 0
  ) {
    return 'Could not reach Google Drive. Check your connection and try again.';
  }
  return 'Could not add that to the note. Try again.';
}

/**
 * "Add to this note": a textarea and an Add button under a rendered note.
 * The text goes to the end of the note as its own paragraph. Disabled while
 * offline, since there is no queue to hold it.
 */
export function AppendForm({ onAppend }: AppendFormProps) {
  const online = useOnline();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const canAdd = text.trim() !== '' && !saving && online;

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!canAdd) return;

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await onAppend(text);
      setText('');
      setStatus('Added to this note.');
    } catch (err) {
      console.error(err);
      setError(errorSentence(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form class="append-form" onSubmit={(event) => void handleSubmit(event)}>
      <label for="append-text">Add to this note</label>
      <textarea
        id="append-text"
        class="append-textarea"
        placeholder="A new paragraph at the end of this note."
        value={text}
        disabled={!online || saving}
        onInput={(event) => {
          setText((event.target as HTMLTextAreaElement).value);
        }}
      />

      {error !== null && (
        <p class="auth-error" role="alert">
          {error}
        </p>
      )}
      {status !== null && (
        <p class="append-status" role="status">
          {status}
        </p>
      )}
      {!online && <p class="offline-reason">{offlineReason('append')}</p>}

      <button
        type="submit"
        class="button"
        disabled={!canAdd}
        aria-disabled={!canAdd}
      >
        {saving ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}
