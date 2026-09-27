/**
 * What the folder menu (`components/folder-menu.tsx`, #319, Phone-Drawer
 * board) lists, as plain data: the top-level folders with their meaning
 * line and count, each with its direct subfolders, and the one-line detail
 * under a pinned note or folder. Pure, so it is unit-tested directly
 * (`folder-menu.test.ts`); the component only renders it.
 */

import { folderMeaning, ROOT_FOLDERS } from './folder-meanings.js';
import { buildTree, folderOf } from './navigation.js';
import type { VaultIndex } from './vault-index.js';
import type { PinnedItem } from './vault-store.js';

export interface MenuFolder {
  path: string;
  name: string;
  /** Notes inside, subfolders included (`folderCounts`). */
  count: number;
}

export interface MenuRoot extends MenuFolder {
  meaning: string;
  /** Its direct subfolders, by name. */
  children: MenuFolder[];
}

/**
 * The six top-level folders of `ROOT_FOLDERS`, in that order, each with its
 * meaning line, its count and its direct subfolders. A top-level folder the
 * index does not hold is left out rather than shown as a dead link; any
 * other top-level folder stays on the Notes tab, which has the full tree.
 */
export function menuRoots(
  index: VaultIndex,
  counts: ReadonlyMap<string, number>,
): MenuRoot[] {
  const tree = buildTree(index, 'name');
  const roots: MenuRoot[] = [];
  for (const { name } of ROOT_FOLDERS) {
    const node = tree.folders.find((folder) => folder.path === name);
    if (node === undefined) continue;
    roots.push({
      path: node.path,
      name: node.name,
      count: counts.get(node.path) ?? 0,
      meaning: folderMeaning(node.path) ?? '',
      children: node.folders.map((child) => ({
        path: child.path,
        name: child.name,
        count: counts.get(child.path) ?? 0,
      })),
    });
  }
  return roots;
}

/** "1 thing", "6 things". */
export function thingsLabel(count: number): string {
  return count === 1 ? '1 thing' : `${count} things`;
}

/** A folder path as a reader sees it: "2-Areas / Home". */
function readablePath(path: string): string {
  return path.split('/').join(' / ');
}

/**
 * The small line under a pinned row: where a note lives ("2-Areas / Home"),
 * or where a folder lives and how much it holds ("1-Projects · 6 things").
 * Empty for a note at the top of the Bower folder.
 */
export function pinnedDetail(
  item: PinnedItem,
  counts: ReadonlyMap<string, number>,
): string {
  if (item.kind === 'note') return readablePath(folderOf(item.file.path));
  const parent = folderOf(item.path);
  const things = thingsLabel(counts.get(item.path) ?? 0);
  return parent === '' ? things : `${readablePath(parent)} · ${things}`;
}
