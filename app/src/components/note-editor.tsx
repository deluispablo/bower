import { useEffect, useRef, useState } from 'preact/hooks';

import { ApiError } from '../api.js';
import { DriveError, SaveError } from '../drive.js';
import type { SaveOptions } from '../drive.js';
import { applyFormat } from '../editor-format.js';
import type { Format } from '../editor-format.js';
import { offlineReason, useOnline } from '../online.js';
import type { EditableNote } from '../vault-store.js';
import '../styles/note-editor.css';

interface NoteEditorProps {
  noteId: string;
  /** The text to edit and the `modifiedTime` the save is checked against. */
  initial: EditableNote;
  /** Saves the whole text; rejects with `SaveError('conflict')` on a conflict. */
  onSave: (text: string, options: SaveOptions) => Promise<void>;
  /** Drops the edit and shows the note as it is in Drive now. */
  onTakeTheirs: () => Promise<void>;
  /** Leaves the editor without saving. */
  onClose: () => void;
}

const TOOLS: Array<{ format: Format; label: string; text: string }> = [
  { format: 'bold', label: 'Bold', text: 'B' },
  { format: 'italic', label: 'Italic', text: 'I' },
  { format: 'link', label: 'Link', text: 'Link' },
  { format: 'heading', label: 'Heading', text: 'H' },
  { format: 'list', label: 'List', text: '•' },
  { format: 'checkbox', label: 'Checkbox', text: '☐' },
];

const LEAVE_QUESTION = 'You have unsaved changes. Leave without saving?';

/** One short sentence for a failed save; details go to the console. */
function errorSentence(err: unknown): string {
  if (err instanceof SaveError && err.code === 'protected') {
    return 'Bower keeps this note up to date itself, so it cannot be edited here.';
  }
  if (
    (err instanceof DriveError || err instanceof ApiError) &&
    err.status === 0
  ) {
    return 'Could not reach Google Drive. Check your connection and try again.';
  }
  return 'Could not save your changes. Try again.';
}

/**
 * Whether a click is on a link the app's router would follow inside this
 * tab. preact-iso has no route guard, so the editor asks before those.
 * Links to other sites are left to `beforeunload`.
 */
function isInAppNavigation(event: MouseEvent): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  const link = event
    .composedPath()
    .find(
      (el): el is HTMLAnchorElement =>
        el instanceof HTMLAnchorElement && el.href !== '',
    );
  if (link === undefined) return false;
  if (link.target !== '' && link.target.toLowerCase() !== '_self') return false;
  if (link.hasAttribute('download')) return false;
  if (link.origin !== location.origin) return false;
  return !(link.getAttribute('href') ?? '').startsWith('#');
}

/**
 * Full-note editor (#50): a plain textarea with a small Markdown toolbar,
 * Save and Cancel. Saving checks the note has not changed in Drive since
 * the editor opened; if it has, a dialog offers keep mine, take theirs or
 * open both. Leaving with unsaved changes asks first.
 */
export function NoteEditor({
  noteId,
  initial,
  onSave,
  onTakeTheirs,
  onClose,
}: NoteEditorProps) {
  const online = useOnline();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(initial.text);
  const [base, setBase] = useState<string | null>(initial.modifiedTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveError | null>(null);

  const dirty = text !== initial.text;
  const canSave = dirty && online && !busy;

  // Unsaved changes: the browser's own prompt on reload or closing the tab,
  // and a confirm() before an in-app link (capture phase, so it runs before
  // the router's own click listener on window).
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }
    function click(event: MouseEvent): void {
      if (!isInAppNavigation(event)) return;
      if (window.confirm(LEAVE_QUESTION)) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('click', click, true);
    };
  }, [dirty]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (conflict !== null && !dialog.open) dialog.showModal();
    if (conflict === null && dialog.open) dialog.close();
  }, [conflict]);

  function format(kind: Format): void {
    const area = textareaRef.current;
    if (area === null) return;
    const out = applyFormat(
      area.value,
      area.selectionStart,
      area.selectionEnd,
      kind,
    );
    // Set the DOM first so the selection survives the re-render.
    area.value = out.text;
    area.focus();
    area.setSelectionRange(out.selectionStart, out.selectionEnd);
    setText(out.text);
  }

  async function save(force: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await onSave(text, { baseModifiedTime: base, force });
    } catch (err) {
      if (err instanceof SaveError && err.code === 'conflict') {
        setConflict(err);
      } else {
        console.error(err);
        setError(errorSentence(err));
      }
      setBusy(false);
    }
  }

  function keepMine(): void {
    setConflict(null);
    void save(true);
  }

  async function takeTheirs(): Promise<void> {
    setConflict(null);
    setBusy(true);
    setError(null);
    try {
      await onTakeTheirs();
    } catch (err) {
      console.error(err);
      setError('Could not load the current version. Try again.');
      setBusy(false);
    }
  }

  function openBoth(): void {
    // Seeing the current version counts as having read it: the next Save
    // goes through unless the note changes yet again.
    const seen = conflict?.currentModifiedTime ?? null;
    if (seen !== null) setBase(seen);
    setConflict(null);
    window.open(`/note/${encodeURIComponent(noteId)}`, '_blank', 'noopener');
    setStatus(
      'The current version is open in a new tab. Save again when your changes are ready.',
    );
  }

  function cancel(): void {
    if (dirty && !window.confirm('Discard your changes?')) return;
    onClose();
  }

  return (
    <div class="note-editor">
      <div class="note-editor-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((tool) => (
          <button
            key={tool.format}
            type="button"
            class={`note-editor-tool note-editor-tool-${tool.format}`}
            aria-label={tool.label}
            title={tool.label}
            disabled={busy}
            onClick={() => {
              format(tool.format);
            }}
          >
            {tool.text}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        class="note-editor-textarea"
        aria-label="Note text"
        spellcheck
        value={text}
        disabled={busy}
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
        <p class="note-editor-status" role="status">
          {status}
        </p>
      )}
      {!online && <p class="offline-reason">{offlineReason('edit')}</p>}

      <div class="note-editor-actions">
        <button
          type="button"
          class="button"
          disabled={!canSave}
          aria-disabled={!canSave}
          onClick={() => void save(false)}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          class="button-link"
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </button>
      </div>

      <dialog
        ref={dialogRef}
        class="note-editor-dialog"
        aria-labelledby="conflict-title"
        onCancel={(event) => {
          // Escape: back to the editor, nothing lost.
          event.preventDefault();
          setConflict(null);
        }}
      >
        <h2 id="conflict-title">This note changed</h2>
        <p>
          {base === null
            ? 'You started editing offline, so Bower cannot tell whether this note changed somewhere else in the meantime.'
            : 'This note was changed somewhere else after you started editing.'}{' '}
          What would you like to do?
        </p>
        <div class="note-editor-dialog-actions">
          <button type="button" class="button" onClick={keepMine}>
            Keep mine
          </button>
          <button
            type="button"
            class="button"
            onClick={() => void takeTheirs()}
          >
            Take theirs
          </button>
          <button type="button" class="button" onClick={openBoth}>
            Open both
          </button>
        </div>
        <p class="note-editor-dialog-help">
          Keep mine replaces the other version with yours. Take theirs drops
          your changes. Open both keeps your changes here and opens the other
          version in a new tab. Google Drive keeps earlier versions either way.
        </p>
      </dialog>
    </div>
  );
}
