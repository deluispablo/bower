/**
 * Add a paragraph… (spec §3.36, R-EDITS-1; board NO-Append): a content
 * sheet on the phone, the side panel on desktop. The line "A new paragraph
 * at the end of this note.", a three-row Composer with the mic, the arrow
 * named "Add the paragraph" and the hint under the box. The paragraph goes
 * to the end of the note (`onAppend`); the sheet closes with a toast.
 */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { ApiError } from '../api.js';
import { AppendError, DriveError } from '../drive.js';
import { showToast } from '../toast-store.js';
import { Composer } from './composer.js';
import { Overlay, OverlayHeader } from './overlay.js';

import '../styles/append-form.css';

export const APPEND_HINT =
  'The arrow adds the paragraph. Bower keeps it at the next tidy-up.';
export const APPEND_DONE_TOAST = 'Added to the end of this note.';

interface AppendFormProps {
  /** Saves `text` at the end of the note; resolves once it is in Drive. */
  onAppend: (text: string) => Promise<void>;
  onClose: () => void;
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
  return 'Could not add it. Try again.';
}

export function AppendForm({
  onAppend,
  onClose,
}: AppendFormProps): JSX.Element {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(paragraph: string): Promise<void> {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAppend(paragraph);
    } catch (err) {
      console.error(err);
      setError(errorSentence(err));
      setSaving(false);
      return;
    }
    showToast(APPEND_DONE_TOAST);
    onClose();
  }

  return (
    <Overlay kind="sheet" labelledBy="append-title" onClose={onClose}>
      <div class="overlay-body edit-sheet">
        <OverlayHeader
          titleId="append-title"
          title="Add a paragraph…"
          closeLabel="Close Add a paragraph"
          onClose={onClose}
        />
        <p class="edit-sheet-line">A new paragraph at the end of this note.</p>
        <Composer
          id="append-text"
          mode="send"
          rows={3}
          label="Add a paragraph"
          placeholder="Write or dictate the paragraph"
          commitLabel="Add the paragraph"
          value={text}
          onChange={(next) => {
            setError(null);
            setText(next);
          }}
          onCommit={(paragraph) => void add(paragraph)}
          sending={saving}
          error={error}
          hint={APPEND_HINT}
          autoFocus
        />
      </div>
    </Overlay>
  );
}
