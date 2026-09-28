/**
 * The one More menu for a note, a file and a folder (#210, #352, board
 * Phone-Note-Menu): a bottom sheet under 900 px, a popover pinned under the
 * More button from 900 px up — one component, `note-menu.css`'s breakpoint
 * switches the presentation the same way `layout.css` already does for the
 * drawer vs the sidebar. `role="menu"`, each row `role="menuitem"`; focus
 * is trapped inside while open (`use-focus-trap.ts`, the same pattern as
 * the explorer drawer), Escape, Cancel and a backdrop tap close it and hand
 * focus back to the More button that opened it.
 *
 * Three callers: `routes/note.tsx`, `routes/file.tsx` and
 * `routes/folder.tsx`. The board's order: a header (the title, then the
 * type word and the folder it sits in), Ask Bower about this, Pin to Home,
 * Move to…, Open in Drive, Copy link, Edit the text (notes only), Cancel.
 *
 * The Pin row (#216) toggles `pinned`/`onTogglePin`, which the note and
 * folder screens wire to `useVault()`'s pin actions (#215) through
 * `pin-action.ts`'s shared toast. A file has no pin handler (pins live in a
 * note's frontmatter or `index.md`'s folder list, and a PDF has neither),
 * so its menu leaves the row out.
 *
 * "Ask Bower about this" and "Move to…" (the board's name for #302's
 * "This was misfiled") open the Bower tab's box prefilled through
 * `/bower?text=` (`more-menu.ts`): the thing's name, or its path and the
 * move request's words, and nothing else from it.
 *
 * "Add a paragraph…" (issue #307, Part E 18.4) reveals the append form
 * ("Add to this note"); it is a note-only row the board does not draw,
 * kept from #307 and gated the same way the form itself is
 * (`!isProtectedNote`, `routes/note.tsx`).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import { askBowerHref, moreMenuMeta, moveToHref } from '../more-menu.js';
import type { MoreMenuKind } from '../more-menu.js';
import { driveFolderUrl } from '../navigation.js';
import {
  IconChat,
  IconCopy,
  IconEdit,
  IconExternalLink,
  IconFolder,
  IconPin,
  IconPlus,
} from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import '../styles/note-menu.css';

const MENU_LABELS: Readonly<Record<MoreMenuKind, string>> = {
  note: 'Note actions',
  file: 'File actions',
  folder: 'Folder actions',
};

export interface NoteMenuProps {
  /** What the menu is about: a note (the default), a file or a folder. */
  kind?: MoreMenuKind;
  /** The note's, file's or folder's own Drive entry. */
  file: DriveFile;
  /** The header's title: the note's title, the file's title, the folder's
   * name. */
  title: string;
  /** The header's type word: "Note", "PDF", "Folder"… */
  typeLabel: string;
  /** The name "Ask Bower about this" prefills: the note's title, the
   * file's full name, the folder's name. */
  askName: string;
  /** False for Bower's own files (spec §14) and for anything but a note:
   * the Edit row is left out. */
  canEdit?: boolean;
  /** False for a protected note (`isProtectedNote`) and for anything but
   * a note: the Add a paragraph row is left out. */
  canAppend?: boolean;
  /** Whether the note or folder currently has a `pinned` timestamp (#215,
   * #216). */
  pinned?: boolean;
  /** Pins or unpins it; the row's own label follows `pinned`. Left out,
   * the Pin row is too. */
  onTogglePin?: () => void;
  onAddParagraph?: () => void;
  onEdit?: () => void;
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
  kind = 'note',
  file,
  title,
  typeLabel,
  askName,
  canEdit = false,
  canAppend = false,
  pinned = false,
  onTogglePin,
  onAddParagraph,
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

  const isNote = kind === 'note';
  const driveHref =
    kind === 'folder' ? driveFolderUrl(file) : driveViewUrl(file);

  return (
    <div class="note-menu">
      <div class="note-menu-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="note-menu-panel"
        role="menu"
        aria-label={MENU_LABELS[kind]}
        tabIndex={-1}
      >
        <div class="note-menu-head" role="presentation">
          <span class="note-menu-title">{title}</span>
          <span class="note-menu-meta">
            {moreMenuMeta(typeLabel, file.path)}
          </span>
        </div>
        <a
          role="menuitem"
          class="note-menu-row"
          href={askBowerHref(kind, askName)}
          onClick={onClose}
        >
          <IconChat />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Ask Bower about this</span>
            <span class="note-menu-row-hint">
              Summarise it, pull out dates, compare it
            </span>
          </span>
        </a>
        {onTogglePin !== undefined && (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            onClick={selectAndClose(onTogglePin)}
          >
            <IconPin />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">
                {pinned ? 'Unpin from Home' : 'Pin to Home'}
              </span>
            </span>
          </button>
        )}
        <a
          role="menuitem"
          class="note-menu-row"
          href={moveToHref(file.path)}
          onClick={onClose}
        >
          <IconFolder />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Move to…</span>
            <span class="note-menu-row-hint">
              Tell Bower where it goes; it remembers
            </span>
          </span>
        </a>
        <a
          role="menuitem"
          class="note-menu-row"
          href={driveHref}
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
            aria-label={`This ${kind}'s link`}
            readOnly
            value={location.href}
          />
        )}
        {isNote && canAppend && onAddParagraph !== undefined && (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            onClick={selectAndClose(onAddParagraph)}
          >
            <IconPlus />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">Add a paragraph…</span>
              <span class="note-menu-row-hint">
                A new paragraph at the end of this note
              </span>
            </span>
          </button>
        )}
        {isNote && canEdit && onEdit !== undefined && (
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
                Notes only. Plain text, for small fixes.
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          class="note-menu-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
