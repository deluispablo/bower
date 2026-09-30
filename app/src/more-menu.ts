/**
 * The pure half of the one ⋯ menu (#352, #907, spec §3.6,
 * `components/note-menu.tsx`): what its header says and where its Bower
 * rows point, for a note, a file or a folder. No DOM, so it is unit tested
 * on its own (`test/more-menu.test.ts`).
 */

import { displayPath, folderOf, paraKindOf } from './navigation.js';
import type { ParaKind } from './navigation.js';
import { revealHref } from './reveal.js';

/** What the menu is about: a note, any other file, or a folder. */
export type MoreMenuKind = 'note' | 'file' | 'folder';

export interface MoreMenuHeader {
  typeLabel: string;
  /** The folder the thing sits in; `null` at the top of the Bower folder. */
  place: {
    /** "Projects › Flat hunt": the numeric prefixes left off. */
    label: string;
    /** The landmark it belongs to, `null` for a neutral folder. */
    kind: ParaKind | null;
  } | null;
}

/**
 * The header's second line, as the board draws it (`Phone-More`): the type
 * word, and the folder the thing sits in with its PARA mark ("Projects ›
 * Flat hunt").
 */
export function moreMenuHeader(
  typeLabel: string,
  path: string,
): MoreMenuHeader {
  const folder = folderOf(path);
  if (folder === '') return { typeLabel, place: null };
  return {
    typeLabel,
    place: {
      label: displayPath(folder, ' › '),
      kind: paraKindOf(folder.split('/')[0] ?? ''),
    },
  };
}

/**
 * "Ask Bower about this": the Bower tab's box, prefilled with the thing's
 * name and nothing else from it. A note or a file is named as a
 * `[[wikilink]]`; a folder as "About <folder>: " (#354), the same words
 * for the folder screen's "Ask Bower about it" chip and its More menu.
 */
export function askBowerHref(kind: MoreMenuKind, name: string): string {
  const text = kind === 'folder' ? `About ${name}: ` : `[[${name}]] `;
  return `/bower?text=${encodeURIComponent(text)}`;
}

/**
 * "Show in folders" (#608, R-REVEAL-3): the Notes tab, told to reveal this
 * note, file or folder (`revealHref`, #591).
 */
export function showInFoldersHref(
  kind: MoreMenuKind,
  file: { id: string; path: string },
): string {
  return revealHref(
    kind === 'folder'
      ? { kind, path: file.path }
      : { kind, id: file.id, path: file.path },
  );
}

/**
 * Every kind of ⋯ menu (#907, spec §3.6): a thing (folder, a root landmark,
 * note, file) or a tab screen (home, add, bower, notes, justFiled,
 * settings).
 */
export type MenuKind =
  | 'folder'
  | 'root'
  | 'note'
  | 'file'
  | 'home'
  | 'add'
  | 'bower'
  | 'notes'
  | 'justFiled'
  | 'settings';

/** One item of a ⋯ menu; the component maps each id to its icon and action. */
export type MoreItemId =
  | 'ask'
  | 'pin'
  | 'drive'
  | 'show'
  | 'rename'
  | 'move'
  | 'copy'
  | 'download'
  | 'paragraph'
  | 'edit'
  | 'help'
  | 'editPinned'
  | 'showInbox'
  | 'inboxDrive'
  | 'ideas'
  | 'rulesDrive'
  | 'bowerDrive'
  | 'ownFiles'
  | 'markSeen'
  | 'everyTidy';

export interface MoreItem {
  id: MoreItemId;
  label: string;
  /** The subtitle under the label, only where the spec lists one (K-26). */
  hint?: string;
}

export interface MoreMenuContext {
  /** The thing's name, for "Opens your folders at <name>". */
  name?: string;
  /** Pin reads "Unpin from Home" when the thing is pinned. */
  pinned?: boolean;
  /** Bower's own files are shown: the toggle reads "Hide Bower's own files". */
  ownFilesShown?: boolean;
  /** A rename or a move already waits for the next tidy-up. */
  pendingRename?: boolean;
  pendingMove?: boolean;
  /** Items to leave out: no handler, a Drive id not loaded (R-API-5)… */
  omit?: ReadonlySet<MoreItemId>;
}

const WAITING = 'Waiting for the next tidy-up';

/**
 * The ⋯ menu's groups for `kind`, in the order of spec §3.6 (R-MORE-1):
 * roots have no Rename… and no Move to…; empty groups are dropped.
 */
export function moreMenuGroups(
  kind: MenuKind,
  context: MoreMenuContext = {},
): MoreItem[][] {
  const name = context.name ?? '';
  const item = (id: MoreItemId, label: string, hint?: string): MoreItem =>
    hint === undefined ? { id, label } : { id, label, hint };
  const ask = item('ask', 'Ask Bower about this');
  const pin = item(
    'pin',
    context.pinned === true ? 'Unpin from Home' : 'Pin to Home',
  );
  const drive = item('drive', 'Open in Drive');
  const show = item('show', 'Show in folders', `Opens your folders at ${name}`);
  const rename = item(
    'rename',
    'Rename…',
    context.pendingRename === true
      ? WAITING
      : 'Bower renames it at the next tidy-up',
  );
  const move = item(
    'move',
    'Move to…',
    context.pendingMove === true
      ? WAITING
      : 'Bower moves it at the next tidy-up',
  );
  const copy = item('copy', 'Copy link');
  const help = item('help', 'Help and about this');
  const bowerDrive = item('bowerDrive', 'Open your Bower folder in Drive');

  const table: Record<MenuKind, MoreItem[][]> = {
    folder: [[ask, pin, drive], [show, move, copy], [help]],
    root: [[ask, pin, drive], [show, copy], [help]],
    note: [
      [ask, pin, drive],
      [show, rename, move, copy],
      [
        item(
          'paragraph',
          'Add a paragraph…',
          'A new paragraph at the end of this note',
        ),
        item('edit', 'Edit the text', 'Plain text, for small fixes'),
      ],
      [help],
    ],
    file: [
      [ask, pin, drive],
      [show, rename, move, copy, item('download', 'Download')],
      [help],
    ],
    home: [[item('editPinned', 'Edit pinned')], [help]],
    add: [
      [
        item('showInbox', 'Show the inbox in folders'),
        item('inboxDrive', 'Open the inbox in Drive'),
      ],
      [help],
    ],
    bower: [
      [
        item(
          'ideas',
          'Things you can ask',
          'Ideas for rules, jobs and questions',
        ),
        item(
          'rulesDrive',
          'Open your rules in Drive',
          'Your rules file, as Bower keeps it',
        ),
      ],
      [help],
    ],
    notes: [
      [
        bowerDrive,
        item(
          'ownFiles',
          context.ownFilesShown === true
            ? "Hide Bower's own files"
            : "Show Bower's own files",
          'Files Bower keeps for itself',
        ),
      ],
      [help],
    ],
    justFiled: [
      [
        item('markSeen', 'Mark all seen', 'Clears the Just filed badge'),
        item(
          'everyTidy',
          'Every tidy-up in the Bower tab',
          'Activity, with what was set aside',
        ),
      ],
      [help],
    ],
    settings: [[bowerDrive], [help]],
  };

  const omit = context.omit;
  return table[kind]
    .map((group) => group.filter((entry) => omit?.has(entry.id) !== true))
    .filter((group) => group.length > 0);
}

/** A top-level landmark folder (Inbox, Projects…): the `root` menu. */
export function isRootFolder(path: string): boolean {
  return path !== '' && !path.includes('/') && paraKindOf(path) !== null;
}

/** The menu's accessible name: "Note actions", "Home actions"… (§3.6). */
export const MENU_NAMES: Readonly<Record<MenuKind, string>> = {
  folder: 'Folder actions',
  root: 'Folder actions',
  note: 'Note actions',
  file: 'File actions',
  home: 'Home actions',
  add: 'Add actions',
  bower: 'Bower actions',
  notes: 'Folders actions',
  justFiled: 'Just filed actions',
  settings: 'Settings actions',
};

/**
 * "Help and about this": asks the shell to open Help for the screen on
 * show. The shell listens for `HELP_REQUEST_EVENT` and cancels it (#906
 * wires it); until it does, the top bar's "?" is pressed instead.
 */
export const HELP_REQUEST_EVENT = 'bower:open-help';

export function requestHelp(): void {
  const event = new Event(HELP_REQUEST_EVENT, { cancelable: true });
  if (!window.dispatchEvent(event)) return;
  document.querySelector<HTMLButtonElement>('.topbar-help')?.click();
}
