/**
 * The Bower folder's six top-level folders, in the order the app lists them,
 * each with its one-line meaning (the Phone-Notes board).
 * One table on purpose: the Notes tab, the desktop sidebar and the "What is
 * Bower" intro read the same words from here rather than keep their own
 * copies.
 */

import { displayName, paraKindOf } from './navigation.js';
import type { ParaKind } from './navigation.js';

export interface RootFolder {
  /** The folder's name in Drive, which is also its path from the root. */
  name: string;
  /** What belongs in it, in one short line. */
  meaning: string;
}

export const ROOT_FOLDERS: readonly RootFolder[] = [
  { name: '0-Inbox', meaning: 'Waiting for the next tidy-up' },
  { name: '1-Projects', meaning: 'Things with an end date' },
  { name: '2-Areas', meaning: 'Parts of life that go on: home, health, money' },
  {
    name: '3-Resources',
    meaning: 'Things to keep: articles, recipes, manuals',
  },
  { name: '4-Archives', meaning: 'Finished, kept, never deleted' },
  { name: 'Answers', meaning: 'What Bower wrote back to you' },
];

const MEANINGS: Readonly<Record<ParaKind, { full: string; short: string }>> = {
  inbox: {
    full: 'Waiting for the next tidy-up',
    short: 'Waiting for the next tidy-up',
  },
  projects: {
    full: 'Things with an end date',
    short: 'Things with an end date',
  },
  areas: {
    full: 'Parts of life that go on: home, health, money',
    short: 'Parts of life that go on',
  },
  resources: {
    full: 'Things to keep: articles, recipes, manuals',
    short: 'Things to keep',
  },
  archives: {
    full: 'Finished, kept, never deleted',
    short: 'Finished, kept, never deleted',
  },
};

/** Answers and Clippings carry a line too (spec §9 Q1). */
const OTHER_MEANINGS: Readonly<Record<string, string>> = {
  answers: 'What Bower wrote back to you',
  clippings: 'Pages you clipped, waiting to be read',
};

/**
 * A top-level folder's heading on its own screen (#431, Phone-Folder
 * board): the name without its numeric prefix ("1-Projects" → "Projects").
 */
export function rootFolderHeading(path: string): string {
  return displayName(path.slice(path.lastIndexOf('/') + 1));
}

/**
 * The meaning line of a top-level folder, or `undefined` for any other path.
 * `'short'` is the desktop sidebar's and the Move picker's variant.
 */
export function folderMeaning(
  path: string,
  variant: 'full' | 'short' = 'full',
): string | undefined {
  if (path === '' || path.includes('/')) return undefined;
  const kind = paraKindOf(path);
  if (kind !== null) return MEANINGS[kind][variant];
  return OTHER_MEANINGS[path.toLowerCase()];
}
