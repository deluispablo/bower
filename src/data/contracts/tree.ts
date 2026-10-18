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

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });

/** A folder in a sentence: a month or year folder reads with its parent, "September 2026 receipts", "2026 receipts". */
export function folderWords(parts: string[]): string {
  const last = parts.at(-1) ?? '';
  const parent = parts.at(-2);
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(last);
  if (!m || !parent) return last;
  const month = m[2] ? Number(m[2]) : 0;
  // Not a real month: named as on Drive, with its parent.
  if (m[2] && (month < 1 || month > 12)) return `${parent} ${last}`;
  const when = month ? `${MONTH.format(Date.UTC(2000, month - 1))} ${m[1]}` : m[1];
  // An acronym ("NHS") keeps its case: only a parent whose second letter is lower case reads in lower case.
  const said = /^.\p{Ll}/u.test(parent) ? `${parent.charAt(0).toLowerCase()}${parent.slice(1)}` : parent;
  return `${when} ${said}`;
}

/** A thing's name as people see it, wherever it shows: no extension (its kind shows beside it, as in the tree). */
export const thingName = (name: string): string => name.replace(/\.[A-Za-z0-9]{1,5}$/, '');

/** The word for a thing's kind, wherever it shows. */
export const KIND_WORD: Record<FileKind, string> = { note: 'Note', pdf: 'PDF', image: 'Photo', link: 'Link', doc: 'Document', sheet: 'Spreadsheet', audio: 'Audio', other: 'File' };

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

/** Longest name a person can give (Drive takes more, but a copy on a computer would not). */
export const MAX_NAME = 120;

/** Characters that break Obsidian links, including control characters. */
export const NAME_BREAKERS = /[[\]|#^\p{Cc}]/gu;

function checkNameCharacters(name: string): void {
  if (name.search(NAME_BREAKERS) >= 0) throw new BowerError('conflict', 'That name has a character Bower cannot use.');
}

/** Refuses a name longer than MAX_NAME (a file's extension does not count; a folder has none, so its dots do). */
export function checkLength(name: string, type: 'note' | 'folder'): void {
  const shown = displayName(name);
  if ((type === 'folder' ? shown : shown.replace(/\.[A-Za-z0-9]{1,5}$/, '')).length > MAX_NAME) throw new BowerError('conflict', `That name is too long. Keep it under ${MAX_NAME} characters.`);
}

/** A new note or folder must stay visible, with the same length limit as before. */
export function checkCreationName(name: string, type: 'note' | 'folder'): void {
  if (name.trim().startsWith('.')) throw new BowerError('conflict', 'A name cannot start with a dot.');
  checkNameCharacters(name);
  checkLength(name, type);
}

/** A free name in `folder`: `Name`, then `Name (2)`, `Name (3)`. */
export function freeName(entries: Entries, folder: string, name: string, except?: string): string {
  checkNameCharacters(name);
  const ext = extOf(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  const taken = new Set([...entries.keys()].filter((p) => p !== except).map((p) => p.toLowerCase()));
  let candidate = name;
  for (let n = 2; taken.has(join(folder, candidate).toLowerCase()); n++) {
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
  if (isRoot(path)) throw new BowerError('conflict', 'That stays where it is: Bower needs it there.');
  const to = join(toFolder, freeName(entries, toFolder, nameOf(path)));
  relocate(entries, path, to, at);
  return to;
}

/** Renames in place, keeping a file's extension when the new name has none. */
export function renameEntry(entries: Entries, path: string, newName: string, at: number): string {
  const e = entries.get(path);
  if (!e) throw new BowerError('not-found', 'That is no longer there.');
  if (isRoot(path)) throw new BowerError('conflict', 'That keeps its name: Bower needs it.');
  checkNameCharacters(newName);
  let name = newName.trim().replace(/[/\\]/g, '-');
  if (name.startsWith('.')) throw new BowerError('conflict', 'A name cannot start with a dot.');
  if (!name || !displayName(name).replace(/\.[A-Za-z0-9]{1,5}$/, '').trim()) throw new BowerError('conflict', 'A name cannot be empty.');
  if (displayName(name).length > MAX_NAME) throw new BowerError('conflict', `That name is too long. Keep it under ${MAX_NAME} characters.`);
  // A rename never changes a file's type: "Plan v1.2" stays a note (Plan v1.2.md).
  const ext = extOf(nameOf(path));
  if (e.type === 'file' && ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
  const folder = parentOf(path);
  if (join(folder, name) === path) return path;
  // Drive tells names apart by case, Obsidian on a Mac does not: refuse both kinds of clash.
  const lower = join(folder, name).toLowerCase();
  const clash = [...entries.keys()].some((p) => p !== path && p.toLowerCase() === lower);
  if (clash) throw new BowerError('conflict', `There is already a "${displayName(name)}" here.`);
  const to = join(folder, name);
  relocate(entries, path, to, at);
  return to;
}

export function removeEntry(entries: Entries, path: string): Entry[] {
  const gone: Entry[] = [];
  for (const e of entries.values()) if (within(e.path, path)) gone.push(e);
  if (!gone.length) throw new BowerError('not-found', 'That is no longer there.');
  if (isRoot(path)) throw new BowerError('conflict', 'That stays: Bower needs it.');
  for (const e of gone) entries.delete(e.path);
  return gone;
}

/** The main folders, and the two files Bower reads every run, stay where they are. */
export function isRoot(path: string): boolean {
  return (PARA_ROOTS as readonly string[]).includes(path) || path === 'Rules.md' || path === 'About me.md';
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
  // As people read them: without the extension, numbers in order ("Untitled" before "Untitled (2)").
  const bare = (n: TreeNode): string => (n.type === 'file' ? n.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') : n.name);
  const byName = (a: TreeNode, b: TreeNode): number =>
    bare(a).localeCompare(bare(b), undefined, { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name);
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
  // The inbox lists its piles newest first, as Home does, whatever the order chosen for folders.
  const inboxOrder = (nodes: TreeNode[]): TreeNode[] => [...nodes].sort((a, b) => b.created - a.created || a.name.localeCompare(b.name));
  const walk = (nodes: TreeNode[], level: number, parent: string): void => {
    for (const n of level === 0 ? nodes : parent === 'Inbox' ? inboxOrder(nodes) : sortNodes(nodes, order)) {
      out.push({ node: n, level });
      if (n.children && open.has(n.path)) walk(n.children, level + 1, n.path);
    }
  };
  walk(roots, 0, '');
  return out;
}

/** The PARA root a path lives under, for its colour. */
export function rootOf(path: string): string {
  const i = path.indexOf('/');
  return i < 0 ? path : path.slice(0, i);
}
