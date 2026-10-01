/**
 * The one ⋯ menu (#210, #352, #608, #907, spec §3.6): a phone action sheet
 * that hugs its items and ends with Cancel, a 320 px popover under the ⋯
 * from 900 px up. One component: an `Overlay` of kind `menu` on the queue
 * (R-OVL-2). `role="menu"`, each row `role="menuitem"`; arrows, Home and
 * End rove, Escape, Cancel, a scrim tap or an outside click close it and
 * hand focus back to the ⋯ that opened it.
 *
 * What it lists and in which order is `moreMenuGroups` (`more-menu.ts`),
 * per kind: a folder, a root landmark (no Rename…, no Move to…), a note, a
 * file, or a tab screen (home, add, bower, notes, justFiled, settings).
 * An item whose handler is not given, or whose Drive id is not loaded yet
 * (R-API-5), is left out.
 *
 * "Ask Bower about this" opens the Ask sheet over the page (`openAsk`,
 * #910). Rename… opens the Rename sheet (`rename-sheet.tsx`) and Move to…
 * the folder picker (`openMoveTo`, #909): the app never renames or moves
 * anything itself, it writes a request for Bower. "Help and about this"
 * asks the shell for Help (`requestHelp`).
 */

import { useState } from 'preact/hooks';
import { Fragment } from 'preact';
import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import { getBlob } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  MENU_NAMES,
  isRootFolder,
  moreMenuGroups,
  requestHelp,
  showInFoldersHref,
} from '../more-menu.js';
import type { MenuKind, MoreItem, MoreItemId } from '../more-menu.js';
import { displayName, driveFolderUrl } from '../navigation.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import type { PendingRequest } from '../rename-request.js';
import { revealHref, revealInFolders } from '../reveal.js';
import { showToast } from '../toast-store.js';
import { isAppFile } from '../vault-index.js';
import { mediaMatches } from '../use-media-query.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';
import { openMoveTo } from './folder-picker.js';
import { openRename } from './rename-sheet.js';
import { openAsk } from './send-to-bower.js';
import {
  IconAddParagraph,
  IconBulb,
  IconChat,
  IconCheck,
  IconClock,
  IconCopy,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconHelp,
  IconLocate,
  IconMove,
  IconPin,
  IconText,
} from './icons.js';
import '../styles/note-menu.css';

/** #555/#364: the demo's fixture ids are not real Drive ids, so Drive items
 * are disabled instead of opening a broken Drive page. */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

const ICONS: Readonly<Record<MoreItemId, () => JSX.Element>> = {
  ask: IconChat,
  pin: IconPin,
  drive: IconExternalLink,
  show: IconLocate,
  rename: IconEdit,
  move: IconMove,
  copy: IconCopy,
  download: IconDownload,
  paragraph: IconAddParagraph,
  edit: IconText,
  help: IconHelp,
  editPinned: IconPin,
  showInbox: IconLocate,
  inboxDrive: IconExternalLink,
  ideas: IconBulb,
  rulesDrive: IconExternalLink,
  bowerDrive: IconExternalLink,
  ownFiles: IconEye,
  markSeen: IconCheck,
  everyTidy: IconClock,
};

/** Items that open Google Drive: hidden without their id, greyed in the demo. */
const DRIVE_ITEMS: ReadonlySet<MoreItemId> = new Set([
  'drive',
  'inboxDrive',
  'rulesDrive',
  'bowerDrive',
]);

/** The Drive ids the tab menus need, read before the menu opens (R-API-5). */
export interface MenuDriveIds {
  /** Bower's rules file (`rules.md`). */
  rules?: string;
  /** The inbox folder. */
  inbox?: string;
  /** The Bower folder itself (the vault pointer). */
  root?: string;
}

export interface NoteMenuProps {
  /** What the menu is about; a folder that is a landmark becomes `root`. */
  kind?: MenuKind;
  /** The note's, file's or folder's own Drive entry (thing kinds only). */
  file?: DriveFile;
  /** The thing's display name, for "Opens your folders at <name>". */
  title?: string;
  /** Kept for callers; the v6 menu has no header (boards *-More). */
  typeLabel?: string;
  /** The name "Ask Bower about this" prefills and Move to… uses. */
  askName?: string;
  /** Bower wrote this note: Ask's context line shows the bird (K-29). */
  bowerWritten?: boolean;
  /** False for Bower's own files and for anything but a note. */
  canEdit?: boolean;
  /** False for a protected note and for anything but a note. */
  canAppend?: boolean;
  /** Whether the thing is pinned to Home (#215, #216). */
  pinned?: boolean;
  /** Pins or unpins it. Left out, the Pin row is too. */
  onTogglePin?: () => void;
  onAddParagraph?: () => void;
  onEdit?: () => void;
  /** The names in the same folder, for Rename's "taken" check. Left out,
   * Rename… is too. */
  siblingNames?: readonly string[];
  /** A rename or a move already waits for the next tidy-up: the item reads
   * "Waiting for the next tidy-up" and reopens it, prefilled (§3.6). */
  pending?: PendingRequest | undefined;
  /** "Help and about this"; the default asks the shell (`requestHelp`). */
  onHelp?: () => void;
  /** Drive ids for the tab menus; an item without its id is left out. */
  driveIds?: MenuDriveIds;
  /** Add: where the inbox is, for "Show the inbox in folders". */
  inboxPath?: string;
  /** Home: "Edit pinned". */
  onEditPinned?: () => void;
  /** Bower: "Things you can ask". */
  onIdeas?: () => void;
  /** Folders: the shared "Show Bower's own files" preference. */
  ownFilesShown?: boolean;
  onToggleOwnFiles?: () => void;
  /** Just filed: "Mark all seen" and "Every tidy-up in the Bower tab". */
  onMarkAllSeen?: () => void;
  onEveryTidy?: () => void;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'manual';

/** How long "Copied." shows under Copy link (R-API-11). */
export const COPIED_MS = 2_000;

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

function folderUrl(id: string): string {
  return driveFolderUrl({ id });
}

function fileUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function NoteMenu(props: NoteMenuProps): JSX.Element {
  const { file, onClose } = props;
  const requested = props.kind ?? 'note';
  const kind: MenuKind =
    requested === 'folder' && file !== undefined && isRootFolder(file.path)
      ? 'root'
      : requested;
  const thingKind =
    kind === 'note' || kind === 'file'
      ? kind
      : kind === 'folder' || kind === 'root'
        ? 'folder'
        : null;
  // A root landmark is named as the person sees it ("Areas", not
  // "2-Areas"), in the subtitle and in what Ask prefills.
  const shown = (value: string): string =>
    kind === 'root' ? displayName(value) : value;
  const name = shown(props.title ?? props.askName ?? '');
  const askName = shown(props.askName ?? name);
  const ids = props.driveIds ?? {};
  const [copyState, setCopyState] = useState<CopyState>('idle');

  async function handleCopyLink(): Promise<void> {
    if (await copyToClipboard(location.href)) {
      setCopyState('copied');
      window.setTimeout(() => {
        setCopyState((state) => (state === 'copied' ? 'idle' : state));
      }, COPIED_MS);
    } else {
      setCopyState('manual');
    }
  }

  /** Desktop: the sidebar already follows the route, so scroll it to the
   * open item. Otherwise (phone, or no such row) the link opens the Folders
   * tab revealed at it. */
  function showInFolders(event: MouseEvent): void {
    // The desktop reveals in place, in the sidebar (R-NT-5): nothing in the
    // address changes, so no navigation and no history entry; closing the
    // menu takes its own Back entry off, and one Back then leaves the page
    // (#920).
    if (
      mediaMatches('(min-width: 900px)') &&
      file !== undefined &&
      thingKind !== null
    ) {
      event.preventDefault();
      revealInFolders(file.path, thingKind === 'folder' ? undefined : file.id);
    }
    onClose();
  }

  function download(target: DriveFile): void {
    onClose();
    getBlob(target.id).then(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = target.name;
        link.click();
        URL.revokeObjectURL(url);
      },
      (err: unknown) => {
        console.error(err);
        showToast('Could not download it. Try again in a moment.');
      },
    );
  }

  /** Rename… (#765, #910): the Rename sheet, with the name check. */
  function rename(target: DriveFile): void {
    onClose();
    openRename({
      path: target.path,
      name: target.name,
      isNote: kind === 'note',
      siblingNames: props.siblingNames ?? [],
      ...(props.pending?.kind === 'rename' && {
        pending: { name: props.pending.value, fileId: props.pending.fileId },
      }),
    });
  }

  /** Move to… (#909): the folder picker. */
  function move(target: DriveFile): void {
    onClose();
    openMoveTo({
      subject: { path: target.path, isFolder: thingKind === 'folder' },
      name: askName,
      ...(props.pending?.kind === 'move' && {
        pending: {
          destination: props.pending.value,
          fileId: props.pending.fileId,
        },
      }),
    });
  }

  /** Ask Bower about this (R-MORE-5, #910): the Ask sheet over this page. */
  function ask(target: DriveFile, about: 'note' | 'file' | 'folder'): void {
    onClose();
    openAsk({
      name: askName,
      kind: about,
      icon: {
        name: target.name,
        mimeType: target.mimeType,
        path: target.path,
        ...(props.bowerWritten === true && { bowerWritten: true }),
      },
    });
  }

  function selectAndClose(action: () => void): () => void {
    return () => {
      onClose();
      action();
    };
  }

  // What cannot run here is left out (R-API-5, and each handler).
  const omit = new Set<MoreItemId>();
  const leaveOut = (id: MoreItemId, when: boolean): void => {
    if (when) omit.add(id);
  };
  leaveOut('ask', file === undefined || thingKind === null);
  leaveOut('pin', props.onTogglePin === undefined);
  leaveOut('drive', file === undefined);
  leaveOut('show', file === undefined);
  leaveOut(
    'rename',
    file === undefined ||
      props.siblingNames === undefined ||
      isAppFile(file.path, file.name),
  );
  leaveOut('move', file === undefined);
  leaveOut('copy', thingKind === null);
  leaveOut('download', file === undefined);
  leaveOut(
    'paragraph',
    props.canAppend !== true || props.onAddParagraph === undefined,
  );
  leaveOut('edit', props.canEdit !== true || props.onEdit === undefined);
  leaveOut('editPinned', props.onEditPinned === undefined);
  leaveOut('showInbox', props.inboxPath === undefined);
  leaveOut('inboxDrive', ids.inbox === undefined);
  leaveOut('ideas', props.onIdeas === undefined);
  leaveOut('rulesDrive', ids.rules === undefined);
  leaveOut('bowerDrive', ids.root === undefined);
  leaveOut('ownFiles', props.onToggleOwnFiles === undefined);
  leaveOut('markSeen', props.onMarkAllSeen === undefined);
  leaveOut('everyTidy', props.onEveryTidy === undefined);

  const groups = moreMenuGroups(kind, {
    name,
    pinned: props.pinned === true,
    ownFilesShown: props.ownFilesShown === true,
    pendingRename: props.pending?.kind === 'rename',
    pendingMove: props.pending?.kind === 'move',
    omit,
  });

  function driveHref(id: MoreItemId): string {
    switch (id) {
      case 'inboxDrive':
        return folderUrl(ids.inbox ?? '');
      case 'rulesDrive':
        return fileUrl(ids.rules ?? '');
      case 'bowerDrive':
        return folderUrl(ids.root ?? '');
      default:
        if (file === undefined) return '';
        return thingKind === 'folder'
          ? driveFolderUrl(file)
          : driveViewUrl(file);
    }
  }

  function renderText(entry: MoreItem, hint?: string): JSX.Element {
    const sub = hint ?? entry.hint;
    return (
      <span class="note-menu-row-text">
        <span class="note-menu-row-label">{entry.label}</span>
        {sub !== undefined && <span class="note-menu-row-hint">{sub}</span>}
      </span>
    );
  }

  // Plain render functions, not components: a re-render (Copied.) must not
  // remount the rows and lose the focused one.
  function renderRow(entry: MoreItem): JSX.Element {
    const Icon = ICONS[entry.id];
    const { id } = entry;

    if (DRIVE_ITEMS.has(id)) {
      if (isDemo()) {
        return (
          <button
            type="button"
            role="menuitem"
            class="note-menu-row"
            disabled
            aria-disabled
          >
            <Icon />
            {renderText(entry, NOT_IN_DEMO_DRIVE)}
          </button>
        );
      }
      return (
        <a
          role="menuitem"
          class="note-menu-row"
          href={driveHref(id)}
          target="_blank"
          rel="noopener"
          onClick={onClose}
        >
          <Icon />
          {renderText(entry)}
        </a>
      );
    }

    if (id === 'show' && file !== undefined && thingKind !== null) {
      return (
        <a
          role="menuitem"
          class="note-menu-row"
          href={showInFoldersHref(thingKind, file)}
          onClick={showInFolders}
        >
          <Icon />
          {renderText(entry)}
        </a>
      );
    }

    if (id === 'showInbox' && props.inboxPath !== undefined) {
      return (
        <a
          role="menuitem"
          class="note-menu-row"
          href={revealHref({ kind: 'folder', path: props.inboxPath })}
          onClick={showInFolders}
        >
          <Icon />
          {renderText(entry)}
        </a>
      );
    }

    if (id === 'copy') {
      return (
        <button
          type="button"
          role="menuitem"
          class="note-menu-row"
          onClick={() => void handleCopyLink()}
        >
          <Icon />
          <span class="note-menu-row-text">
            <span class="note-menu-row-label">{entry.label}</span>
            {copyState === 'copied' && (
              <span class="note-menu-row-hint" role="status">
                Copied.
              </span>
            )}
          </span>
        </button>
      );
    }

    const actions: Partial<Record<MoreItemId, () => void>> = {
      ...(props.onTogglePin !== undefined && {
        pin: selectAndClose(props.onTogglePin),
      }),
      ...(file !== undefined && {
        rename: () => {
          rename(file);
        },
        move: () => {
          move(file);
        },
        ...(thingKind !== null && {
          ask: () => {
            ask(file, thingKind);
          },
        }),
        download: () => {
          download(file);
        },
      }),
      ...(props.onAddParagraph !== undefined && {
        paragraph: selectAndClose(props.onAddParagraph),
      }),
      ...(props.onEdit !== undefined && {
        edit: selectAndClose(props.onEdit),
      }),
      help: selectAndClose(props.onHelp ?? requestHelp),
      ...(props.onEditPinned !== undefined && {
        editPinned: selectAndClose(props.onEditPinned),
      }),
      ...(props.onIdeas !== undefined && {
        ideas: selectAndClose(props.onIdeas),
      }),
      ...(props.onToggleOwnFiles !== undefined && {
        ownFiles: selectAndClose(props.onToggleOwnFiles),
      }),
      ...(props.onMarkAllSeen !== undefined && {
        markSeen: selectAndClose(props.onMarkAllSeen),
      }),
      ...(props.onEveryTidy !== undefined && {
        everyTidy: selectAndClose(props.onEveryTidy),
      }),
    };

    return (
      <button
        type="button"
        role="menuitem"
        class="note-menu-row"
        onClick={actions[id]}
      >
        <Icon />
        {renderText(entry)}
      </button>
    );
  }

  const linkKind = thingKind ?? 'folder';

  return (
    <Queued id="note-menu" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="menu" label={MENU_NAMES[kind]} onClose={onClose}>
        <div class="note-menu">
          {groups.map((group, index) => (
            <div key={index} class="note-menu-group" role="group">
              {index > 0 && <div class="note-menu-sep" role="separator" />}
              {group.map((entry) => (
                <Fragment key={entry.id}>{renderRow(entry)}</Fragment>
              ))}
              {copyState === 'manual' &&
                group.some((entry) => entry.id === 'copy') && (
                  <input
                    ref={(input) => input?.select()}
                    class="note-menu-copy-fallback"
                    aria-label={`This ${linkKind}'s link`}
                    readOnly
                    value={location.href}
                  />
                )}
            </div>
          ))}
          <button
            type="button"
            role="menuitem"
            class="btn btn-secondary btn-block note-menu-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </Overlay>
    </Queued>
  );
}
