/**
 * The line a note or file page shows while a Rename or Move of it waits for
 * the tidy-up (#765, R-MORE-4, D32, board Rename-Pending-375): "Renaming to
 * {name} at the next tidy-up" or "Moving to {folder} at the next tidy-up",
 * with Undo, which sends the request's note to Drive's Bin. It is a status
 * line; it is not drawn when nothing waits for this path.
 */

import type { JSX } from 'preact';

import type { RequestRow } from '../bower-tab.js';
import { deleteFile } from '../drive.js';
import { undoRequestNote } from '../move-request.js';
import { pendingByPath } from '../rename-request.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { IconClock } from './icons.js';

import '../styles/pending-request-line.css';

export interface PendingRequestLineProps {
  /** The vault path of the note or file the page is about. */
  path: string;
  /** The requests store's rows (`useRequestRows`). */
  rows: readonly RequestRow[];
}

export function PendingRequestLine({
  path,
  rows,
}: PendingRequestLineProps): JSX.Element | null {
  const { refresh } = useVault();
  const pending = pendingByPath(rows).get(path);

  async function undo(id: string): Promise<void> {
    const result = await undoRequestNote(deleteFile, id);
    if (result === 'failed') {
      showToast("Couldn't take that back. It is still in your inbox.");
      return;
    }
    void refresh();
    showToast('Taken out of your inbox.');
  }

  return (
    <div class="pending-request" role="status">
      {pending !== undefined && (
        <>
          <span class="pending-request-icon" aria-hidden="true">
            <IconClock />
          </span>
          <span class="pending-request-text">{pending.line}</span>
          <button
            type="button"
            class="pending-request-undo"
            disabled={pending.fileId === null}
            onClick={() => {
              if (pending.fileId !== null) void undo(pending.fileId);
            }}
          >
            Undo
          </button>
        </>
      )}
    </div>
  );
}
