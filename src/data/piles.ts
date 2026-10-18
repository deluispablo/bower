import { NAME_BREAKERS, thingName } from './tree';
import type { Pile, PileItem, TreeNode } from './types';

/**
 * How a pile lives in the Bower folder (spec, "Who does what"): a pile with
 * a note or more than one thing is a subfolder of the inbox, named by its
 * day and its note, holding the things and `Pile note.md` with your words.
 * A single thing without a note sits at the inbox root. The runner reads
 * each subfolder as one pile and the note as context for all its things.
 */
export const PILE_NOTE = 'Pile note.md';

/** Things a pile asks Bower to file: its files, or its note when it is only a note. */
export const thingCount = (files: number, hasNote: boolean): number => files || (hasNote ? 1 : 0);

export function thingsIn(p: Pile): number {
  return thingCount(p.items.length, !!p.text.trim() || !!p.noteLocked);
}

/**
 * A pile with no things and no words: nothing to file and no note to keep (TL-P2-22). A note Bower could not
 * read still has its words, unseen: that pile is a note, never empty.
 */
export function isEmptyPile(p: Pick<Pile, 'items' | 'text' | 'noteLocked'>): boolean {
  return !p.noteLocked && !p.items.length && !p.text.trim();
}

export function waitingIn(piles: readonly Pile[] | undefined): number {
  return (piles ?? []).reduce((n, p) => n + thingsIn(p), 0);
}

/** "2026-10-04 Receipts from the Saltmere weekend" (kept short and safe for Drive). */
export function pileFolderName(p: Pile): string {
  const day = new Date(p.createdAt).toISOString().slice(0, 10);
  const words = p.text.trim().replace(NAME_BREAKERS, ' ').replace(/[/\\:*?"<>]+/g, ' ').replace(/\s+/g, ' ');
  const short = words.length > 40 ? `${words.slice(0, 40).replace(/\s+\S*$/, '')}…` : words;
  return `${day} ${short || 'Pile'}`;
}

/** Whether a pile gets its own folder (a note, or more than one thing). */
export function pileHasFolder(p: Pile): boolean {
  return !!p.text.trim() || p.items.length > 1;
}

/**
 * The name a thing gets in the inbox: no slashes, no leading dots, and a
 * pasted link becomes a `.url` file. Clashes are settled by the caller.
 */
export function safeInboxName(item: Pick<PileItem, 'name' | 'kind'>): string {
  const safe = item.name.replace(NAME_BREAKERS, ' ').replace(/[/\\]+/g, ' - ').replace(/^[\s.-]+|[\s-]+$/g, '') || 'Untitled';
  // A saved link is always a .url file, even when its address ends like one (example.com, page.html).
  return item.kind === 'link' && !/\.url$/i.test(safe) ? `${safe}.url` : safe;
}

/** Things in a folder for a count: every file, except pile notes and folders' own notes (they describe, they are not things). */
export function countThings(n: TreeNode): number {
  if (n.type === 'file') return n.name === PILE_NOTE || n.hub ? 0 : 1;
  return (n.children ?? []).reduce((t, c) => t + countThings(c), 0);
}

/** A pile folder in the Inbox waits as its things, or once when it holds only its note (as `thingsIn`). */
function pileWaits(n: TreeNode): number {
  return countThings(n) || ((n.children ?? []).some((c) => c.name === PILE_NOTE) ? 1 : 0);
}

/**
 * The one count a folder shows, wherever it shows (card, row, header, tree):
 * what is directly in it, a subfolder counting once, its own note and pile
 * notes not at all. The inbox counts the things waiting, as Home does.
 */
export function folderCount(n: TreeNode): number {
  if (n.type === 'file') return 1;
  if (n.path === 'Inbox') return (n.children ?? []).reduce((t, c) => t + (c.type === 'folder' ? pileWaits(c) : countThings(c)), 0);
  if (/^Inbox\/[^/]+$/.test(n.path)) return pileWaits(n);
  return (n.children ?? []).filter((c) => !c.hub && c.name !== PILE_NOTE).length;
}

/** A pile's name wherever it shows: its note, else its one thing as the tree names it (a link as its address). */
export function pileName(p: Pick<Pile, 'text' | 'items'>): string {
  const first = p.items[0];
  if (p.text) return p.text;
  if (!first) return '';
  return first.kind === 'link' ? first.name.replace(/\.url$/, '') : thingName(first.name);
}

