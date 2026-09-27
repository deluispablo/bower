/**
 * The note's one "more" menu (#210, spec §14 "Note menu"): a bottom sheet
 * under 900 px, a popover pinned under the More button from 900 px up —
 * one component, `note-menu.css`'s breakpoint switches the presentation
 * the same way `layout.css` already does for the drawer vs the sidebar.
 * `role="menu"`, each row `role="menuitem"`; focus is trapped inside while
 * open (`use-focus-trap.ts`, the same pattern as the explorer drawer),
 * Escape and a backdrop tap close it and hand focus back to the More
 * button that opened it.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  IconChat,
  IconCopy,
  IconEdit,
  IconExternalLink,
  IconPin,
} from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import '../styles/note-menu.css';

/**
 * #216 adds a `pinned` helper (frontmatter `pinned: <ISO time>`, spec §14).
 * It does not exist yet, so there is nothing for this row to read or write:
 * left in the code, behind this constant, rather than improvised — flip it
 * on once that helper lands.
 */
const PIN_TO_HOME_ENABLED = false;

export interface NoteMenuProps {
  file: DriveFile;
  /** The note's name with its `.md` extension stripped. */
  noteName: string;
  /** False for Bower's own files (spec §14): the Edit row is left out. */
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * `navigator.clipboard` first; a denied permission or an insecure context
 * (no Clipboard API at all) falls back to a read-only input the row
 * reveals, already selected so Ctrl/Cmd+C works.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText === undefined) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export function NoteMenu({
  file,
  noteName,
  canEdit,
  onEdit,
  onClose,
}: NoteMenuProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  useFocusTrap(panelRef, onClose);

  useEffect(() => {
    if (copyState === 'manual') linkInputRef.current?.select();
  }, [copyState]);

  async function handleCopyLink(): Promise<void> {
    setCopyState((await copyToClipboard(location.href)) ? 'copied' : 'manual');
  }

  function selectAndClose(action: () => void): () => void {
    return () => {
      onClose();
      action();
    };
  }

  return (
    <div class="note-menu">
      <div class="note-menu-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="note-menu-panel"
        role="menu"
        aria-label="Note actions"
        tabIndex={-1}
      >
        {PIN_TO_HOME_ENABLED && (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            onClick={onClose}
          >
            <IconPin />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">Pin to Home</span>
              <span class="note-menu-row-hint">
                Shows above Recent, on every device
              </span>
            </span>
          </button>
        )}
        <a
          role="menuitem"
          class="note-menu-row"
          href={`/tell?text=${encodeURIComponent(`[[${noteName}]] `)}`}
          onClick={onClose}
        >
          <IconChat />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Ask Bower about this note</span>
            <span class="note-menu-row-hint">
              Opens Tell Bower with the note attached
            </span>
          </span>
        </a>
        <a
          role="menuitem"
          class="note-menu-row"
          href={driveViewUrl(file)}
          target="_blank"
          rel="noopener"
          onClick={onClose}
        >
          <IconExternalLink />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Open in Drive</span>
          </span>
        </a>
        <button
          type="button"
          role="menuitem"
          class="note-menu-row"
          onClick={() => void handleCopyLink()}
        >
          <IconCopy />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Copy link</span>
            {copyState === 'copied' && (
              <span class="note-menu-row-hint" role="status">
                Copied.
              </span>
            )}
          </span>
        </button>
        {copyState === 'manual' && (
          <input
            ref={linkInputRef}
            class="note-menu-copy-fallback"
            aria-label="This note's link"
            readOnly
            value={location.href}
          />
        )}
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            onClick={selectAndClose(onEdit)}
          >
            <IconEdit />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">Edit the text</span>
              <span class="note-menu-row-hint">
                Plain text, for small fixes. Bower&rsquo;s own files are
                read-only here.
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
