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
export function thingsIn(p: Pile): number {
  return p.items.length || (p.text.trim() ? 1 : 0);
}

export function waitingIn(piles: readonly Pile[] | undefined): number {
  return (piles ?? []).reduce((n, p) => n + thingsIn(p), 0);
}

/** "2026-10-04 Receipts from the Saltmere weekend" (kept short and safe for Drive). */
export function pileFolderName(p: Pile): string {
  const day = new Date(p.createdAt).toISOString().slice(0, 10);
  const words = p.text.trim().replace(/[/\\:*?"<>|\n]+/g, ' ').replace(/\s+/g, ' ');
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
  const safe = item.name.replace(/[/\\]+/g, ' - ').replace(/^[\s.-]+|[\s-]+$/g, '') || 'Untitled';
  return item.kind === 'link' && !/\.[a-z]{2,5}$/i.test(safe) ? `${safe}.url` : safe;
}

/** Things in a folder for a count: every file, except the pile notes (they belong to their piles). */
export function countThings(n: TreeNode): number {
  if (n.type === 'file') return n.name === PILE_NOTE ? 0 : 1;
  return (n.children ?? []).reduce((t, c) => t + countThings(c), 0);
}
