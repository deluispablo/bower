/**
 * The Bower folder's six top-level folders, in the order the app lists them,
 * each with its one-line meaning (the Phone-Drawer and Phone-Notes boards).
 * One table on purpose: the folder menu (#319) reads it today, and the Notes
 * tab (#348) and the "What is Bower" intro are meant to read the same words
 * from here rather than keep their own copies.
 */

export interface RootFolder {
  /** The folder's name in Drive, which is also its path from the root. */
  name: string;
  /** What belongs in it, in one short line. */
  meaning: string;
}

export const ROOT_FOLDERS: readonly RootFolder[] = [
  { name: '0-Inbox', meaning: 'What you added, waiting for a tidy-up' },
  { name: '1-Projects', meaning: 'Things with an end date' },
  { name: '2-Areas', meaning: 'Parts of life that go on: home, health, money' },
  {
    name: '3-Resources',
    meaning: 'Things to keep: articles, recipes, manuals',
  },
  { name: '4-Archives', meaning: 'Finished, kept, never deleted' },
  { name: 'Answers', meaning: 'What Bower wrote back to you' },
];

/**
 * A top-level folder's heading on its own screen (#431, Phone-Folder
 * board): the name without its numeric prefix ("1-Projects" → "Projects").
 * Any other path, and a root folder outside the table, keeps its name; the
 * tree, the folder menu and the bar keep the full name everywhere.
 */
export function rootFolderHeading(path: string): string {
  const root = ROOT_FOLDERS.find((folder) => folder.name === path);
  if (root === undefined) return path.slice(path.lastIndexOf('/') + 1);
  return root.name.replace(/^\d+-/, '');
}

/** The meaning line of a top-level folder, or `undefined` for any other path. */
export function folderMeaning(path: string): string | undefined {
  return ROOT_FOLDERS.find((folder) => folder.name === path)?.meaning;
}
