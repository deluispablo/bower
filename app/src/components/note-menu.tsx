/**
 * The one More menu for a note, a file and a folder (#210, #352, #608, board
 * Phone-More): a bottom sheet under 900 px, a popover pinned under the More
 * button from 900 px up — one component, `note-menu.css`'s breakpoint
 * switches the presentation the same way `layout.css` already does for the
 * drawer vs the sidebar. `role="menu"`, each row `role="menuitem"`; focus
 * is trapped inside while open (`use-focus-trap.ts`, the same pattern as
 * the explorer drawer), Escape, Cancel and a backdrop tap close it and hand
 * focus back to the More button that opened it.
 *
 * Three callers: `routes/note.tsx`, `routes/file.tsx` and
 * `routes/folder.tsx`. The board's order: a header (the title, then the
 * type word and the folder it sits in, with its PARA mark), Ask Bower about
 * this, Show in folders, Pin to Home, Move to… ("Bower does it"), Open in
 * Drive, Download (files), Copy link, Edit the text (notes only), Cancel.
 *
 * The Pin row (#216) toggles `pinned`/`onTogglePin`, which the note and
 * folder screens wire to `useVault()`'s pin actions (#215) through
 * `pin-action.ts`'s shared toast. A file has no pin handler (pins live in a
 * note's frontmatter or `index.md`'s folder list, and a PDF has neither),
 * so its menu leaves the row out.
 *
 * "Ask Bower about this" opens the Bower tab's box prefilled through
 * `/bower?text=` (`more-menu.ts`) with the thing's name and nothing else.
 * "Show in folders" (#608) opens the Notes tab revealed at the item (phone)
 * or scrolls the sidebar to it (desktop). "Move to…" opens the folder
 * picker (`folder-picker.tsx`): the app never moves anything itself, it
 * writes a request for Bower.
 *
 * "Add a paragraph…" (issue #307, Part E 18.4) reveals the append form
 * ("Add to this note"); it is a note-only row the board does not draw,
 * kept from #307 and gated the same way the form itself is
 * (`!isProtectedNote`, `routes/note.tsx`).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import { getBlob } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  askBowerHref,
  moreMenuHeader,
  showInFoldersHref,
} from '../more-menu.js';
import type { MoreMenuKind } from '../more-menu.js';
import { driveFolderUrl } from '../navigation.js';
import { showToast } from '../toast-store.js';
import { mediaMatches } from '../use-media-query.js';
import { FolderMark } from './folder-mark.js';
import { MoveFlow } from './folder-picker.js';
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

/** #555/#364: the demo's fixture ids are not real Drive ids, so Open in
 * Drive is disabled instead of opening a broken Drive page, the same
 * sentence as Add's own greyed Drive door. */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

/** The board's "Show in folders" mark: a target. Not in the shared set. */
function IconLocate(): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

function IconDownloadArrow(): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

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
  /** The name "Ask Bower about this" prefills and the picker's title and
   * request use: the note's title, the file's full name, the folder's
   * name. */
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
  const [moving, setMoving] = useState(false);
  useFocusTrap(panelRef, onClose);

  useEffect(() => {
    if (copyState === 'manual') linkInputRef.current?.select();
  }, [copyState]);

  async function handleCopyLink(): Promise<void> {
    setCopyState((await copyToClipboard(location.href)) ? 'copied' : 'manual');
  }

  /** Desktop: the sidebar already follows the route, so scroll it to the
   * open item. Otherwise (phone, or no such row) the link opens the Notes
   * tab revealed at it. */
  function showInFolders(event: MouseEvent): void {
    if (mediaMatches('(min-width: 900px)')) {
      const row = document.querySelector(
        '.explorer-sidebar [aria-current="page"]',
      );
      if (row !== null) {
        event.preventDefault();
        row.scrollIntoView?.({ block: 'nearest' });
      }
    }
    onClose();
  }

  function download(): void {
    onClose();
    getBlob(file.id).then(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      },
      (err: unknown) => {
        console.error(err);
        showToast('Could not download it. Try again in a moment.');
      },
    );
  }

  function selectAndClose(action: () => void): () => void {
    return () => {
      onClose();
      action();
    };
  }

  const isNote = kind === 'note';
  const header = moreMenuHeader(typeLabel, file.path);
  const driveHref =
    kind === 'folder' ? driveFolderUrl(file) : driveViewUrl(file);

  return (
    <div class="note-menu">
      <div class="note-menu-backdrop" aria-hidden="true" onClick={onClose} />
      {moving && (
        <MoveFlow
          name={askName}
          path={file.path}
          isFolder={kind === 'folder'}
          onClose={onClose}
        />
      )}
      <div
        ref={panelRef}
        class="note-menu-panel"
        role="menu"
        aria-label={MENU_LABELS[kind]}
        tabIndex={-1}
        hidden={moving}
      >
        <div class="note-menu-head" role="presentation">
          <span class="note-menu-title">{title}</span>
          <span class="note-menu-meta">
            <span>{header.typeLabel}</span>
            {header.place !== null && (
              <span class="note-menu-place">
                {header.place.kind !== null && (
                  <FolderMark kind={header.place.kind} size={18} />
                )}
                {header.place.label}
              </span>
            )}
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
        <a
          role="menuitem"
          class="note-menu-row"
          href={showInFoldersHref(kind, file)}
          onClick={showInFolders}
        >
          <IconLocate />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Show in folders</span>
          </span>
          <span class="note-menu-new">NEW</span>
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
        <button
          type="button"
          role="menuitem"
          class="note-menu-row"
          onClick={() => setMoving(true)}
        >
          <IconFolder />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">Move to…</span>
            <span class="note-menu-row-hint">Bower does it</span>
          </span>
        </button>
        {isDemo() ? (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            disabled
            aria-disabled
          >
            <IconExternalLink />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">Open in Drive</span>
              <span class="note-menu-row-hint">{NOT_IN_DEMO_DRIVE}</span>
            </span>
          </button>
        ) : (
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
        )}
        {kind === 'file' && (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            onClick={download}
          >
            <IconDownloadArrow />
            <span class="note-menu-row-text">
              <span class="note-menu-row-label">Download</span>
            </span>
          </button>
        )}
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
