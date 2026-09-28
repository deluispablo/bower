/**
 * Pure helpers behind the tree, the Home lists and the note view. No Drive
 * calls, no Preact: everything here takes a `VaultIndex` or a plain file
 * list and returns data, so it is unit-tested directly (`navigation.test.ts`).
 */

import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';
import { appFileLabel, basenameKey, isAppFile } from './vault-index.js';
import type { VaultIndex } from './vault-index.js';

const INBOX_FOLDERS = new Set(['0-Inbox', 'Clippings']);
const DAY_MS = 24 * 60 * 60 * 1000;

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/** `path`'s containing folder (everything before its last `/`), or `''` for
 * a top-level file or folder. Exported for the Pinned tile's own display
 * text (`components/pinned-section.tsx`, issue #216), which needs a note's
 * or a folder's parent path the same way the tree already does. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * A note's age in plain English, coarser the further back it is (unlike
 * `vault-store.ts`'s `formatAgo`, which is a "how stale is the index"
 * indicator and collapses anything past a day to "yesterday").
 */
export function relativeTime(iso: string, now: number | Date): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const days = Math.floor(Math.max(0, nowMs - Date.parse(iso)) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Top 20 (by default) notes by `modifiedTime` descending. Missing times sort
 * last. Bower's own files (`isAppFile`) are left out unless `showAppFiles`
 * is on (the `showAppFiles` preference, spec §5.3).
 */
export function recentNotes(
  index: VaultIndex,
  n = 20,
  showAppFiles = false,
): DriveFile[] {
  const notes = showAppFiles
    ? index.notes
    : index.notes.filter((note) => !isAppFile(note.path, note.name));
  return [...notes]
    .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
    .slice(0, n);
}

/**
 * How many files are still waiting in the inbox: anything under `0-Inbox/`
 * or `Clippings/`, at any depth, except folders, files under a `Processed/`
 * or `0-Inbox/Quarantine/` folder, and folder notes (`_*.md`). A quarantined
 * file was already reported once, the run that flagged it (spec A.5; issue
 * #264): it never becomes pending again. Takes the raw file list (not the
 * index), so it also counts files the index hides for other reasons.
 */
export function pendingCount(files: DriveFile[]): number {
  return files.filter((file) => {
    if (file.mimeType === FOLDER_MIME) return false;
    const segments = file.path.split('/');
    if (!INBOX_FOLDERS.has(segments[0] ?? '')) return false;
    if (segments.some((segment) => segment === 'Processed')) return false;
    if (segments[0] === '0-Inbox' && segments[1] === 'Quarantine') return false;
    if (file.name.startsWith('_') && file.name.toLowerCase().endsWith('.md')) {
      return false;
    }
    return true;
  }).length;
}

export interface TreeNode {
  /** Path relative to the Bower folder; '' for the root. */
  path: string;
  name: string;
  folders: TreeNode[];
  /** Hub notes (basename === folder name) first, then alphabetical. */
  notes: DriveFile[];
}

/** How the explorer orders the tree: by name, or most recently modified first. */
export type TreeSort = 'name' | 'modified';

function sortByName(node: TreeNode): void {
  node.folders.sort((a, b) => compareNames(a.name, b.name));
  const hubKey = node.path === '' ? '' : basenameKey(node.name);
  node.notes.sort((a, b) => {
    const aHub = hubKey !== '' && basenameKey(a.name) === hubKey;
    const bHub = hubKey !== '' && basenameKey(b.name) === hubKey;
    if (aHub !== bHub) return aHub ? -1 : 1;
    return compareNames(a.name, b.name);
  });
  for (const child of node.folders) sortByName(child);
}

/**
 * Newest first: notes by `modifiedTime`, folders by their newest note at any
 * depth. Missing times sort last; ties fall back to the name. Returns the
 * node's newest time ('' when it holds no dated note).
 */
function sortByModified(node: TreeNode): string {
  const newest = new Map<TreeNode, string>();
  for (const child of node.folders) newest.set(child, sortByModified(child));
  node.folders.sort(
    (a, b) =>
      (newest.get(b) ?? '').localeCompare(newest.get(a) ?? '') ||
      compareNames(a.name, b.name),
  );
  node.notes.sort(
    (a, b) =>
      (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') ||
      compareNames(a.name, b.name),
  );
  let latest = node.notes[0]?.modifiedTime ?? '';
  for (const time of newest.values()) if (time > latest) latest = time;
  return latest;
}

/**
 * Nests the index's visible folders and notes into a tree. Folder notes
 * (`_Folder.md`) never appear: `buildVaultIndex` already excludes them from
 * `index.notes`. Bower's own files (`isAppFile`) never appear here either —
 * they never belong in their real folder position; the explorer renders
 * them separately, as the "Bower's files" group (`appFileGroup`), only when
 * `showAppFiles` is on. A "hub" note is identified by basename only (its
 * name matches its folder's name) — frontmatter tags (`hub`, `moc`) are not
 * available here, since the index holds no note text. `sort` is the
 * explorer's order (`explorerSort` pref); by name unless asked otherwise.
 */
export function buildTree(
  index: VaultIndex,
  sort: TreeSort = 'name',
): TreeNode {
  const byPath = new Map<string, TreeNode>();
  const root: TreeNode = { path: '', name: '', folders: [], notes: [] };
  byPath.set('', root);

  function ensure(path: string): TreeNode {
    const existing = byPath.get(path);
    if (existing !== undefined) return existing;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const parent = ensure(folderOf(path));
    const node: TreeNode = { path, name, folders: [], notes: [] };
    parent.folders.push(node);
    byPath.set(path, node);
    return node;
  }

  for (const folder of index.folders) ensure(folder.path);
  for (const note of index.notes) {
    if (isAppFile(note.path, note.name)) continue;
    ensure(folderOf(note.path)).notes.push(note);
  }

  if (sort === 'modified') sortByModified(root);
  else sortByName(root);
  return root;
}

/**
 * How many notes each folder holds, subfolders included, keyed by folder
 * path (the tree's per-folder counts). Every visible folder has an entry,
 * empty ones at 0; the root ('') has none. Folder notes are already left
 * out of `index.notes`, so they never count; Bower's own files (`isAppFile`)
 * never count either, so a folder's number always matches what `buildTree`
 * shows for it (they never appear inside a real folder, `showAppFiles` on
 * or off).
 */
export function folderCounts(index: VaultIndex): Map<string, number> {
  const counts = new Map<string, number>();
  for (const folder of index.folders) counts.set(folder.path, 0);
  for (const note of index.notes) {
    if (isAppFile(note.path, note.name)) continue;
    let folder = folderOf(note.path);
    while (folder !== '') {
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
      folder = folderOf(folder);
    }
  }
  return counts;
}

function nodeMatches(name: string, query: string): boolean {
  return name.toLowerCase().includes(query);
}

/**
 * `node`, trimmed to what matches `query` (case-insensitive, name only): a
 * note survives if its own name matches; a folder survives, with its full
 * subtree kept as-is, if its own name matches, or — filtered the same way —
 * if any descendant does. `null` once nothing below `node` matches, so the
 * caller drops it; the root itself is never dropped (`filterTree` always
 * returns a node, empty when nothing matches).
 */
function filterNode(node: TreeNode, query: string): TreeNode | null {
  if (node.path !== '' && nodeMatches(node.name, query)) return node;
  const notes = node.notes.filter((note) => nodeMatches(note.name, query));
  const folders: TreeNode[] = [];
  for (const folder of node.folders) {
    const filtered = filterNode(folder, query);
    if (filtered !== null) folders.push(filtered);
  }
  if (notes.length === 0 && folders.length === 0) return null;
  return { ...node, folders, notes };
}

/**
 * The drawer's filter (spec §14): `tree` narrowed to notes and folders whose
 * name contains `query` (case-insensitive), keeping the parent folders of
 * every match so its path stays visible; an empty or blank `query` returns
 * `tree` unchanged. Pure — the caller (`tree.tsx`) decides which folders to
 * force open from the result.
 */
export function filterTree(tree: TreeNode, query: string): TreeNode {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return tree;
  return filterNode(tree, trimmed) ?? { ...tree, folders: [], notes: [] };
}

export interface AppFileEntry {
  file: DriveFile;
  /** Friendly name (`appFileLabel`), what the "Bower's files" group shows. */
  label: string;
}

export interface AppFileGroup {
  /** Top-level named files (Rulebook, Catalogue, …), sorted by label. */
  files: AppFileEntry[];
  /** How many `Bower - *.md` instruction notes exist, at any depth. */
  instructionNotesCount: number;
  /**
   * The `.claude` folder as "Agent settings" (spec §14), `null` when the
   * vault has none. It opens in Drive, read-only — never `/note/:id`, since
   * it is a folder, not a note.
   */
  agentSettings: AppFileEntry | null;
}

/**
 * Bower's own files, gathered for the explorer's "Bower's files" group
 * (shown only when `showAppFiles` is on): the top-level named files with
 * their friendly labels, a count of instruction notes (shown as one
 * "Instruction notes (n)" row rather than individually), and the `.claude`
 * folder, labelled "Agent settings", when the vault has one.
 */
export function appFileGroup(index: VaultIndex): AppFileGroup {
  const files: AppFileEntry[] = [];
  let instructionNotesCount = 0;
  for (const note of index.notes) {
    if (!isAppFile(note.path, note.name)) continue;
    if (note.name.startsWith('Bower - ')) {
      instructionNotesCount++;
      continue;
    }
    files.push({ file: note, label: appFileLabel(note.name) });
  }
  files.sort((a, b) => compareNames(a.label, b.label));
  const agentSettings =
    index.agentSettingsFolder === undefined
      ? null
      : { file: index.agentSettingsFolder, label: 'Agent settings' };
  return { files, instructionNotesCount, agentSettings };
}

export interface BreadcrumbSegment {
  name: string;
  /** Folder path, usable as the tree's `expandPath`. */
  path: string;
}

/** Folder segments of a note's path, each carrying its own full path. */
export function breadcrumb(path: string): BreadcrumbSegment[] {
  const segments = path.split('/');
  segments.pop(); // the note's own file name
  const result: BreadcrumbSegment[] = [];
  let acc = '';
  for (const segment of segments) {
    acc = acc === '' ? segment : `${acc}/${segment}`;
    result.push({ name: segment, path: acc });
  }
  return result;
}

/**
 * `/folder/<path>` for a folder screen link (issue #214), each segment
 * percent-encoded on its own — `preact-iso`'s `:path*` route decodes every
 * segment individually before rejoining them with `/`, so a folder name
 * holding a `/`-unsafe character (`#`, `?`, `%`, …) only round-trips when
 * encoded this way rather than as one escaped string.
 */
export function folderHref(path: string): string {
  return `/folder/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Where a folder opens in Google Drive: its `webViewLink`, else its own Drive URL. */
export function driveFolderUrl(file: {
  id: string;
  webViewLink?: string;
}): string {
  return (
    file.webViewLink ?? `https://drive.google.com/drive/folders/${file.id}`
  );
}

/** Where a file opens in Google Drive: its `webViewLink`, else its own Drive URL. */
export function driveFileUrl(file: {
  id: string;
  webViewLink?: string;
}): string {
  return (
    file.webViewLink ??
    `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`
  );
}

/**
 * A folder row's age, as short as the row's right edge allows (the
 * Phone-Folder-Project board): "today", "3 d", "2 w", "4 mo", "1 y".
 */
export function shortAge(iso: string, now: number | Date): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const days = Math.floor(Math.max(0, nowMs - Date.parse(iso)) / DAY_MS);
  if (days === 0) return 'today';
  if (days < 7) return `${days} d`;
  if (days < 30) return `${Math.floor(days / 7)} w`;
  if (days < 365) return `${Math.floor(days / 30)} mo`;
  return `${Math.floor(days / 365)} y`;
}

function findNode(node: TreeNode, path: string): TreeNode | null {
  if (node.path === path) return node;
  for (const folder of node.folders) {
    const found = findNode(folder, path);
    if (found !== null) return found;
  }
  return null;
}

export interface FolderSubfolder {
  path: string;
  name: string;
  /** Notes inside, subfolders included (`folderCounts`). */
  count: number;
  /** Notes and other files inside, subfolders included: a root folder
   * screen's "6 things" (#431). */
  things: number;
  /** The newest `modifiedTime` of anything inside, subfolders included;
   * `undefined` when nothing inside has one (#431). */
  updated: string | undefined;
}

export interface FolderContents {
  path: string;
  name: string;
  /** Direct subfolders, by `sort` (the explorer's order preference). */
  subfolders: FolderSubfolder[];
  /** This folder's own notes (not its subfolders'), newest first. */
  notes: DriveFile[];
  /** This folder's own other files (PDFs, photos, Google Docs…), newest first. */
  files: DriveFile[];
  /** `notes` and `files` together, newest first: the folder screen's list (#349). */
  items: DriveFile[];
  /** Notes anywhere under this folder, subfolders included (the header count). */
  noteCount: number;
  /** Other files anywhere under this folder, subfolders included. */
  fileCount: number;
}

function newestFirst(a: DriveFile, b: DriveFile): number {
  return (
    (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') ||
    compareNames(a.name, b.name)
  );
}

/**
 * A folder's contents for the Folder screen (issue #214): its direct
 * subfolders (each with its own recursive note count, `folderCounts`) and
 * its own notes and other files (#349), always newest first regardless of
 * `sort` — unlike the
 * tree, where "by name" also puts a hub note first. `sort` only orders the
 * subfolders, the same preference as the explorer's tree (`explorerSort`).
 * `null` when `path` does not resolve to a visible folder (deleted, or
 * never existed): the route shows a not-found message.
 *
 * Bower's own files never appear (`buildTree` already excludes them, spec
 * §5.3 — the explorer's separate "Bower's files" group is a tree-only
 * concept, not part of any real folder's contents); hidden files and
 * folders are already out of the index (`vault-index.ts`).
 */
export function folderContents(
  index: VaultIndex,
  path: string,
  sort: TreeSort = 'name',
): FolderContents | null {
  const node = findNode(buildTree(index, sort), path);
  if (node === null) return null;
  const counts = folderCounts(index);
  const subfolders: FolderSubfolder[] = node.folders.map((folder) => {
    const inside = `${folder.path}/`;
    const files = index.files.filter((file) => file.path.startsWith(inside));
    const notes = index.notes.filter(
      (note) =>
        note.path.startsWith(inside) && !isAppFile(note.path, note.name),
    );
    let updated: string | undefined;
    for (const item of [...notes, ...files]) {
      const time = item.modifiedTime;
      if (time !== undefined && (updated === undefined || time > updated)) {
        updated = time;
      }
    }
    const count = counts.get(folder.path) ?? 0;
    return {
      path: folder.path,
      name: folder.name,
      count,
      things: count + files.length,
      updated,
    };
  });
  const notes = [...node.notes].sort(newestFirst);
  const prefix = path === '' ? '' : `${path}/`;
  const under = index.files.filter((file) => file.path.startsWith(prefix));
  const files = under
    .filter((file) => folderOf(file.path) === path)
    .sort(newestFirst);
  return {
    path: node.path,
    name: node.name,
    subfolders,
    notes,
    files,
    items: [...notes, ...files].sort(newestFirst),
    noteCount: counts.get(path) ?? 0,
    fileCount: under.length,
  };
}

export interface FolderEmptyState {
  /** The whole subtree — this folder and every subfolder — has no notes. */
  empty: boolean;
  /**
   * Set when this folder's own note list is empty (`notes.length === 0`)
   * but the subtree is not (`empty` false): the total note count and the
   * subfolder that holds them, for "n notes in <Subfolder>" (#310, 1.9) in
   * place of "Nothing here yet" — that message is for an empty subtree,
   * not a folder whose notes just live one level down.
   */
  elsewhere: { count: number; subfolderName: string } | null;
}

/**
 * What the Folder screen's notes section should say when this folder has
 * no notes of its own (#310, 1.9, 2.14): `folderContents.noteCount` counts
 * the whole subtree, `notes` only this folder's own children, so a folder
 * with notes only in a subfolder had both zero direct notes and a
 * misleading "Nothing here yet" together with a real count in the header.
 * The subfolder named is the first with any notes in its own subtree
 * (`FolderSubfolder.count`, itself recursive) — with more than one such
 * subfolder the name is a "for instance", not a claim every note is there.
 */
export function folderEmptyState(contents: FolderContents): FolderEmptyState {
  // Files count too (#349): a folder holding only a PDF is not empty, and
  // one with only files a level down names them ("2 files in …") when it
  // has no notes to name.
  if (contents.items.length > 0) return { empty: false, elsewhere: null };
  const total =
    contents.noteCount > 0 ? contents.noteCount : contents.fileCount;
  if (total === 0) return { empty: true, elsewhere: null };
  const holder = contents.subfolders.find((folder) => folder.count > 0);
  return {
    empty: false,
    elsewhere: {
      count: total,
      subfolderName: holder?.name ?? contents.subfolders[0]?.name ?? '',
    },
  };
}

export interface Siblings {
  prev: DriveFile | null;
  next: DriveFile | null;
}

/**
 * The previous and next note in the same folder, sorted by name — the
 * same walk the folder screen itself lists (#423): Bower's own files
 * (`isAppFile`) are left out unless `showAppFiles` is on (the current note
 * stays the anchor either way, even if it is itself one of Bower's own
 * files and would otherwise be filtered out).
 */
export function siblings(
  index: VaultIndex,
  id: string,
  showAppFiles = false,
): Siblings {
  const file = index.byId.get(id);
  if (file === undefined) return { prev: null, next: null };
  const folder = folderOf(file.path);
  const inFolder = index.notes
    .filter(
      (note) =>
        folderOf(note.path) === folder &&
        (showAppFiles || note.id === id || !isAppFile(note.path, note.name)),
    )
    .sort((a, b) => compareNames(a.name, b.name));
  const at = inFolder.findIndex((note) => note.id === file.id);
  if (at === -1) return { prev: null, next: null };
  return {
    prev: at > 0 ? (inFolder[at - 1] ?? null) : null,
    next: at < inFolder.length - 1 ? (inFolder[at + 1] ?? null) : null,
  };
}

/**
 * One visible row of the tree, in document order. `depth` is the folder
 * nesting level (0 for a top-level row); `expanded` only applies to a
 * folder row.
 */
export interface TreeRow {
  kind: 'folder' | 'note';
  path: string;
  depth: number;
  expanded?: boolean;
}

/**
 * Where keyboard focus goes next in the tree, given the currently visible
 * `rows` (already reflecting which folders are expanded) and the key
 * pressed. Pure: expanding or collapsing a folder is the caller's job (it
 * changes what rows exist next render); this only ever picks an index.
 *
 * - Up/Down: previous/next visible row, clamped.
 * - Right on an expanded folder: into its first child (next row). On a
 *   collapsed folder or a note: no move (the caller expands instead).
 * - Left on an expanded folder: no move (the caller collapses instead). On
 *   a collapsed folder or a note: up to the enclosing folder's row.
 * - Anything else (e.g. Enter, which opens/toggles instead of moving): no move.
 */
export function nextFocusIndex(
  rows: TreeRow[],
  current: number,
  key: string,
): number {
  if (rows.length === 0) return current;
  const at = Math.min(Math.max(current, 0), rows.length - 1);
  const row = rows[at];
  if (row === undefined) return at;

  if (key === 'ArrowDown') return Math.min(at + 1, rows.length - 1);
  if (key === 'ArrowUp') return Math.max(at - 1, 0);

  if (key === 'ArrowRight') {
    if (row.kind === 'folder' && row.expanded === true) {
      return Math.min(at + 1, rows.length - 1);
    }
    return at;
  }

  if (key === 'ArrowLeft') {
    if (row.kind === 'folder' && row.expanded === true) return at;
    for (let i = at - 1; i >= 0; i--) {
      const candidate = rows[i];
      if (candidate !== undefined && candidate.depth < row.depth) return i;
    }
    return at;
  }

  return at;
}
