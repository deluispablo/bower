/**
 * The pure half of the one More menu (#352, board Phone-More,
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
