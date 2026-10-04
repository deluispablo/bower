/**
 * The Bower folder as a flat list of entries keyed by path, and the pure
 * operations on it. A tree for the screens is built from it on demand.
 */
import { BowerError, PARA_ROOTS, type FileKind, type TreeNode } from './types';

export interface Entry {
  path: string;
  type: 'folder' | 'file';
  kind?: FileKind;
  modified: number;
  created: number;
  isNew?: boolean;
  byBower?: boolean;
  hub?: boolean;
}

export type Entries = Map<string, Entry>;

export const parentOf = (path: string): string => {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
};
export const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
export const join = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);
export const extOf = (name: string): string => {
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(name);
  return m ? m[0] : '';
};
/** The name people read: a note without `.md`. */
export const displayName = (name: string): string => name.replace(/\.md$/, '');

export function kindOf(name: string): FileKind {
  const e = extOf(name).toLowerCase();
  if (e === '.md') return 'note';
  if (e === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif'].includes(e)) return 'image';
  if (['.doc', '.docx', '.odt', '.txt', '.rtf'].includes(e)) return 'doc';
  if (['.xls', '.xlsx', '.csv', '.ods'].includes(e)) return 'sheet';
  if (['.mp3', '.m4a', '.wav'].includes(e)) return 'audio';
  if (e === '.example' || e === '.url') return 'link';
  return 'other';
}

/** Adds every missing parent folder of `path`. */
export function ensureFolders(entries: Entries, path: string, at: number): void {
  let p = parentOf(path);
  while (p) {
    if (!entries.has(p)) entries.set(p, { path: p, type: 'folder', modified: at, created: at });
    p = parentOf(p);
  }
}

function within(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** A free name in `folder`: `Name`, then `Name (2)`, `Name (3)`. */
export function freeName(entries: Entries, folder: string, name: string, except?: string): string {
  const ext = extOf(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  let candidate = name;
  for (let n = 2; entries.has(join(folder, candidate)) && join(folder, candidate) !== except; n++) {
    candidate = `${base} (${n})${ext}`;
  }
  return candidate;
}

function relocate(entries: Entries, from: string, to: string, at: number): void {
  const moved: Entry[] = [];
  for (const e of entries.values()) if (within(e.path, from)) moved.push(e);
  for (const e of moved) entries.delete(e.path);
  for (const e of moved) {
    const path = to + e.path.slice(from.length);
    entries.set(path, { ...e, path, modified: e.path === from ? at : e.modified });
  }
}

/** Moves a file or folder into `toFolder`; returns its new path. */
export function moveEntry(entries: Entries, path: string, toFolder: string, at: number): string {
  const e = entries.get(path);
  if (!e) throw new BowerError('not-found', 'That is no longer there.');
  if (toFolder && entries.get(toFolder)?.type !== 'folder') throw new BowerError('not-found', 'That folder is no longer there.');
  if (parentOf(path) === toFolder) return path;
  if (e.type === 'folder' && within(toFolder, path)) throw new BowerError('conflict', 'A folder cannot go inside itself.');
  if (isRoot(path)) throw new BowerError('conflict', 'The main folders stay where they are.');
  const to = join(toFolder, freeName(entries, toFolder, nameOf(path)));
  relocate(entries, path, to, at);
  return to;
}

/** Renames in place, keeping a file's extension when the new name has none. */
export function renameEntry(entries: Entries, path: string, newName: string, at: number): string {
  const e = entries.get(path);
  if (!e) throw new BowerError('not-found', 'That is no longer there.');
  if (isRoot(path)) throw new BowerError('conflict', 'The main folders keep their names.');
  let name = newName.trim().replace(/[/\\]/g, '-');
  if (!name) throw new BowerError('conflict', 'A name cannot be empty.');
  // A rename never changes a file's type: "Plan v1.2" stays a note (Plan v1.2.md).
  const ext = extOf(nameOf(path));
  if (e.type === 'file' && ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
  const folder = parentOf(path);
  if (join(folder, name) === path) return path;
  if (entries.has(join(folder, name))) throw new BowerError('conflict', `There is already a "${displayName(name)}" here.`);
  const to = join(folder, name);
  relocate(entries, path, to, at);
  return to;
}

export function removeEntry(entries: Entries, path: string): Entry[] {
  const gone: Entry[] = [];
  for (const e of entries.values()) if (within(e.path, path)) gone.push(e);
  if (!gone.length) throw new BowerError('not-found', 'That is no longer there.');
  if (isRoot(path)) throw new BowerError('conflict', 'The main folders stay.');
  for (const e of gone) entries.delete(e.path);
  return gone;
}

export function isRoot(path: string): boolean {
  return (PARA_ROOTS as readonly string[]).includes(path);
}

export function buildTree(entries: Entries): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  const sorted = [...entries.values()].sort((a, b) => a.path.length - b.path.length);
  const roots: TreeNode[] = [];
  for (const e of sorted) {
    const node: TreeNode = {
      path: e.path,
      name: nameOf(e.path),
      type: e.type,
      modified: e.modified,
      created: e.created,
      ...(e.kind ? { kind: e.kind } : {}),
      ...(e.isNew ? { isNew: true } : {}),
      ...(e.byBower ? { byBower: true } : {}),
      ...(e.hub ? { hub: true } : {}),
      ...(e.type === 'folder' ? { children: [] } : {}),
    };
    nodes.set(e.path, node);
    const parent = nodes.get(parentOf(e.path));
    if (parent?.children) parent.children.push(node);
    else roots.push(node);
  }
  const rank = (n: TreeNode): number => {
    const i = (PARA_ROOTS as readonly string[]).indexOf(n.path);
    return i < 0 ? 99 : i;
  };
  return roots.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export type SortOrder = 'name-az' | 'name-za' | 'modified-new' | 'modified-old' | 'created-new' | 'created-old';

/** Folders first, then files, each in the chosen order (as Obsidian does). */
export function sortNodes(nodes: TreeNode[], order: SortOrder): TreeNode[] {
  const byName = (a: TreeNode, b: TreeNode): number =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const cmp: Record<SortOrder, (a: TreeNode, b: TreeNode) => number> = {
    'name-az': byName,
    'name-za': (a, b) => byName(b, a),
    'modified-new': (a, b) => b.modified - a.modified,
    'modified-old': (a, b) => a.modified - b.modified,
    'created-new': (a, b) => b.created - a.created,
    'created-old': (a, b) => a.created - b.created,
  };
  const folders = nodes.filter((n) => n.type === 'folder').sort(order === 'name-za' ? cmp['name-za'] : byName);
  const files = nodes.filter((n) => n.type === 'file').sort(cmp[order]);
  return [...folders, ...files];
}

export function countFiles(node: TreeNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((s, c) => s + countFiles(c), 0);
}

export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children && path.startsWith(`${n.path}/`)) {
      const f = findNode(n.children, path);
      if (f) return f;
    }
  }
  return null;
}

export interface VisibleRow {
  node: TreeNode;
  level: number;
}

/** The rows an explorer shows: open folders expanded, roots in their own order. */
export function visibleRows(roots: TreeNode[], open: ReadonlySet<string>, order: SortOrder): VisibleRow[] {
  const out: VisibleRow[] = [];
  const walk = (nodes: TreeNode[], level: number): void => {
    for (const n of level === 0 ? nodes : sortNodes(nodes, order)) {
      out.push({ node: n, level });
      if (n.children && open.has(n.path)) walk(n.children, level + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/** The PARA root a path lives under, for its colour. */
export function rootOf(path: string): string {
  const i = path.indexOf('/');
  return i < 0 ? path : path.slice(0, i);
}
