/**
 * The pure half of the one More menu (#352, board Phone-Note-Menu,
 * `components/note-menu.tsx`): what its header says and where its two
 * Bower rows point, for a note, a file or a folder. No DOM, so it is unit
 * tested on its own (`test/more-menu.test.ts`).
 */

import { folderOf } from './navigation.js';

/** What the menu is about: a note, any other file, or a folder. */
export type MoreMenuKind = 'note' | 'file' | 'folder';

/**
 * The header's second line, as the board draws it: the type word, then
 * the folder the thing sits in ("PDF · 1-Projects / Flat hunt"). Just the
 * type word for something at the top of the Bower folder.
 */
export function moreMenuMeta(typeLabel: string, path: string): string {
  const folder = folderOf(path);
  return folder === ''
    ? typeLabel
    : `${typeLabel} · ${folder.split('/').join(' / ')}`;
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
 * "Move to…" (the board's label for #302's "This was misfiled"): the
 * Bower tab's box, prefilled with the path and nothing else, in the exact
 * words the rulebook's move request expects (`vault-template/CLAUDE.md`).
 */
export function moveToHref(path: string): string {
  return `/bower?text=${encodeURIComponent(
    `"${path}" was misfiled. It should go to: `,
  )}`;
}
