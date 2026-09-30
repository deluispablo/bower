/**
 * Rename… (spec §3.36, R-EDITS-1, R-EDITS-3; board NO-Rename): a content
 * sheet on the phone, the side panel on desktop. The line "Bower renames it
 * at the next tidy-up.", a one-row Composer prefilled with the current name
 * (without its extension), the arrow named "Rename" and the hint under the
 * box. The arrow queues a rename request in the inbox and confirms by a
 * toast with Undo; the name checks of `rename-request.ts` show under the
 * box in the danger colour.
 */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { createTextFile, deleteFile } from '../drive.js';
import { undoRequestNote, writeRequestNote } from '../move-request.js';
import { close, open, OVERLAY_PRIORITY } from '../overlay-queue.js';
import {
  RENAME_HINT,
  RENAME_SENT_TOAST,
  renameRequestText,
  splitFileName,
  validateRename,
} from '../rename-request.js';
import { useSession } from '../session.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { Composer, COMPOSER_LINES } from './composer.js';
import { Overlay, OverlayHeader } from './overlay.js';

import '../styles/append-form.css';

export const RENAME_ID = 'rename';

export interface RenameTarget {
  /** Path from the top of the Bower folder. */
  path: string;
  /** Its current full name, with any extension. */
  name: string;
  /** A note keeps `.md` out of the box. */
  isNote: boolean;
  /** The other names in its folder, for the "already has that name" check. */
  siblingNames: readonly string[];
}

export interface RenameSheetProps {
  target: RenameTarget;
  onClose: () => void;
}

export function RenameSheet({
  target,
  onClose,
}: RenameSheetProps): JSX.Element {
  const { me } = useSession();
  const { refresh } = useVault();
  const { base, extension } = splitFileName(target.name, target.isNote);
  const [value, setValue] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inboxFolderId = me?.vault?.inboxFolderId ?? null;
  const problem = validateRename({
    currentName: target.name,
    input: value,
    extension,
    siblingNames: target.siblingNames,
  });
  // A name check speaks once the person has typed something else.
  const shown = error ?? (value !== base ? problem : null);

  async function undo(id: string): Promise<void> {
    const result = await undoRequestNote(deleteFile, id);
    if (result === 'failed') {
      showToast("Couldn't take that back. It is still in your inbox.");
      return;
    }
    void refresh();
    showToast('Taken out of your inbox.');
  }

  async function rename(): Promise<void> {
    if (busy) return;
    if (problem !== null) {
      setError(problem);
      return;
    }
    if (inboxFolderId === null) {
      setError(COMPOSER_LINES.failed);
      return;
    }
    setBusy(true);
    setError(null);
    let id: string | null;
    try {
      id = await writeRequestNote(
        { createTextFile },
        {
          inboxFolderId,
          text: renameRequestText(target.path, value.trim() + extension),
          now: new Date(),
        },
      );
    } catch (err) {
      console.error(err);
      setBusy(false);
      setError(COMPOSER_LINES.failed);
      return;
    }
    void refresh();
    showToast(
      RENAME_SENT_TOAST,
      undefined,
      id === null ? undefined : { label: 'Undo', run: () => void undo(id) },
    );
    onClose();
  }

  return (
    <Overlay kind="sheet" labelledBy="rename-title" onClose={onClose}>
      <div class="overlay-body edit-sheet">
        <OverlayHeader
          titleId="rename-title"
          title="Rename…"
          closeLabel="Close Rename"
          onClose={onClose}
        />
        <p class="edit-sheet-line">Bower renames it at the next tidy-up.</p>
        <Composer
          id="rename-name"
          mode="send"
          rows={1}
          label="New name"
          commitLabel="Rename"
          value={value}
          onChange={(next) => {
            setError(null);
            setValue(next);
          }}
          onCommit={() => void rename()}
          sending={busy}
          error={shown}
          invalid={shown !== null}
          hint={RENAME_HINT}
          autoFocus
        />
      </div>
    </Overlay>
  );
}

/** Opens Rename… on the overlay queue. */
export function openRename(target: RenameTarget): void {
  open({
    id: RENAME_ID,
    priority: OVERLAY_PRIORITY.own,
    render: () => (
      <RenameSheet target={target} onClose={() => close(RENAME_ID)} />
    ),
  });
}
