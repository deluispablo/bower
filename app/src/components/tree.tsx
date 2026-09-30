/**
 * The one tree (issue #909, spec §3.14, K-1): folders, notes and files as
 * rows, in three hosts that differ only in size.
 *
 * - `sidebar`: the desktop sidebar, rows 28 px, 13 px text.
 * - `drawer`: the phone drawer, rows 40 px, 15 px text.
 * - `page`: the Folders tab, the drawer's tree at full width.
 *
 * Row anatomy: 14 px per level of indent with a 1 px depth guide at each
 * ancestor's chevron centre; the chevron (folders that hold something), then
 * the icon (a root's PARA disc, a subfolder's outline or an item's FileIcon,
 * tinted by its root; the bird on what Bower wrote), then the name with an
 * ellipsis and the full name as `title`. No counts, descriptions, "new" tags
 * or kind badges on any host. The open item's row is selected (tint and a
 * 3 px bar); the folder holding it has its name in its root's colour.
 *
 * Tree pattern (WAI-ARIA): each row's link is the `treeitem` (with
 * `aria-level`, `aria-expanded` on folders, `aria-selected`), in a roving
 * `tabindex`. Up/Down move, Right expands or enters, Left collapses or goes
 * to the parent, Home/End, a printable key jumps to the next row starting
 * with it, Enter opens (the row is a link). A folder's chevron toggles it
 * by pointer; a double click on a folder name toggles it too (desktop).
 *
 * Expanded folders and the scroll offset live in the `treeState` store,
 * shared by every host. Reveal (#591): `revealPath`/`currentId` open the
 * ancestors of the open item, select its row and scroll it into view; a
 * new `revealSeq` (from `revealInFolders`) also moves focus to it.
 *
 * Pinning (spec §14, #216): a row's `contextmenu` (right-click, a long
 * press, the Menu key or Shift+F10) opens the pin sheet.
 */

import { Fragment } from 'preact';
import type { JSX, RefCallback } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { isBowerWritten } from '../bower-written.js';
import { loadNoteMetaEntry, loadTreeState, saveTreeState } from '../cache.js';
import type { DriveFile } from '../drive.js';
import { FOLDER_MIME } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  appFileGroup,
  buildTree,
  displayName as folderDisplayName,
  driveFolderUrl,
  folderHref,
  folderOf,
  nextFocusIndex,
  paraKindOf,
} from '../navigation.js';
import type { ParaKind, TreeNode, TreeRow, TreeSort } from '../navigation.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { ancestorsOf, mergeExpanded } from '../reveal.js';
import { useVault } from '../vault-store.js';
import { fileKind, fileTitle } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { FileIcon } from './file-icon.js';
import { FolderMark } from './folder-mark.js';
import { IconChevronRight } from './icons.js';
import { PinSheet } from './pin-sheet.js';
import { useNoteTitles } from './use-note-titles.js';
import type { VirtualListHandle } from './virtual-list.js';

import '../styles/tree.css';

/** Where the tree is shown: its row height and text size follow. */
export type TreeHost = 'sidebar' | 'drawer' | 'page';

/** Top folders drawn as their own rows under the tree, not inside it. */
export const BELOW_TREE_NAMES: readonly string[] = ['Answers', 'Clippings'];

/** Indent per level, px (board PF-Drawer: the chevron's own width). */
export const TREE_INDENT = 14;

/** The row heights of each host, px (spec §3.14). */
export const TREE_ROW_HEIGHT: Readonly<Record<TreeHost, number>> = {
  sidebar: 28,
  drawer: 40,
  page: 40,
};

interface Row extends TreeRow {
  /** A folder's name as Drive has it (numeric prefix included). */
  name: string;
  /** Set for a note or file row. */
  id?: string;
  /** Set for a file row. */
  file?: DriveFile;
  /** A folder with nothing in it has no chevron. */
  empty?: boolean;
}

/**
 * Past this many visible rows the tree renders only the ones in view
 * (`VirtualList`, #590); below it every row is in the DOM.
 */
const VIRTUAL_FROM_ROWS = 150;

type VirtualModule = typeof import('./virtual-list.js');

// Loaded the first time a tree passes the threshold, so the virtualiser
// stays out of the startup chunk. Until it arrives the plain list renders.
let virtualModule: VirtualModule | null = null;

/** How long the revealed row's highlight lasts (matches `tree.css`). */
const REVEAL_FLASH_MS = 600;

// The folders open when a tree last changed, kept for the next tree that
// mounts (the drawer and the Folders tab mount a fresh one) so it paints
// open at once instead of collapsed until the stored state is read.
let rememberedExpanded: ReadonlySet<string> | null = null;

/** How long a scroll must rest before its offset is saved. */
const SCROLL_SAVE_MS = 250;

/** How long type-ahead keeps adding keys to one search. */
const TYPE_AHEAD_MS = 700;

/** Whether a top folder is drawn under the tree instead of in it. */
export function isBelowTree(name: string): boolean {
  return BELOW_TREE_NAMES.includes(folderDisplayName(name));
}

function flatten(
  node: TreeNode,
  depth: number,
  expanded: ReadonlySet<string>,
  out: Row[],
): void {
  for (const folder of node.folders) {
    if (depth === 0 && isBelowTree(folder.name)) continue;
    const isExpanded = expanded.has(folder.path);
    const empty = folder.folders.length === 0 && folder.items.length === 0;
    out.push({
      kind: 'folder',
      path: folder.path,
      depth,
      expanded: isExpanded,
      name: folder.name,
      empty,
    });
    if (isExpanded) flatten(folder, depth + 1, expanded, out);
  }
  for (const item of node.items) {
    const isNote = fileKind(item) === 'note';
    out.push({
      kind: isNote ? 'note' : 'file',
      path: item.path,
      depth,
      name: item.name,
      id: item.id,
      ...(isNote ? {} : { file: item }),
    });
  }
}

/**
 * Where type-ahead lands: the first row after `from` (wrapping) whose name
 * starts with `prefix`, case-insensitive; `from` itself when none does.
 */
export function typeAheadIndex(
  names: readonly string[],
  from: number,
  prefix: string,
): number {
  const needle = prefix.toLowerCase();
  if (needle === '' || names.length === 0) return from;
  // A repeated single letter cycles; a longer prefix may match `from` itself.
  const start = needle.length > 1 ? 0 : 1;
  for (let step = start; step <= names.length; step++) {
    const i = (from + step) % names.length;
    if ((names[i] ?? '').toLowerCase().startsWith(needle)) return i;
  }
  return from;
}

/** The nearest ancestor that scrolls, or `null` when the page itself does. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * Brings a row into view by scrolling only its own scroll box (the sidebar
 * column), never the page behind it; the page itself when nothing else
 * scrolls (the Folders tab).
 */
function scrollRowIntoView(el: HTMLElement): void {
  const parent = scrollParentOf(el);
  if (parent === null) {
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  const row = el.getBoundingClientRect();
  const box = parent.getBoundingClientRect();
  if (row.top < box.top) parent.scrollTop += row.top - box.top;
  else if (row.bottom > box.bottom) parent.scrollTop += row.bottom - box.bottom;
}

function currentScroll(el: HTMLElement | null): number {
  return scrollParentOf(el)?.scrollTop ?? window.scrollY;
}

/** Every folder path in `node`. */
function allFolderPaths(node: TreeNode, out: Set<string>): void {
  for (const folder of node.folders) {
    out.add(folder.path);
    allFolderPaths(folder, out);
  }
}

/** The root a path sits under, or `null` outside the five. */
function rootOf(path: string): ParaKind | null {
  return paraKindOf(path.split('/')[0] ?? '');
}

/**
 * Which of `files` Bower wrote, from the cached frontmatter only (no network
 * call, like `useNoteTitles`): a note not read yet shows the document glyph
 * until a folder screen has cached it.
 */
function useBowerWritten(files: readonly DriveFile[]): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const key = files.map((file) => file.id).join(',');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      files.map(async (file) => {
        const entry = await loadNoteMetaEntry<{ meta?: NoteMeta }>(file.id);
        return isBowerWritten(entry?.meta) ? file.id : null;
      }),
    ).then((found) => {
      if (cancelled) return;
      const next = new Set(found.filter((id): id is string => id !== null));
      setIds((prev) =>
        prev.size === next.size && [...next].every((id) => prev.has(id))
          ? prev
          : next,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return ids;
}

export interface TreeProps {
  index: VaultIndex;
  /** The host: row height and text size (spec §3.14). */
  host?: TreeHost;
  /** Called when a row's link is activated, e.g. to close the drawer. */
  onNavigate?: () => void;
  /** The explorer's order; by name when left out. */
  sort?: TreeSort;
  /** Every change collapses all folders ("Collapse all folders"). */
  collapseKey?: number;
  /** Every change expands all folders. */
  expandKey?: number;
  /** Adds the "Bower's own files" group at the bottom (`showAppFiles`). */
  showAppFiles?: boolean;
  /** Reveal (#591): the vault path of the open note, file or folder. */
  revealPath?: string;
  /** Reveal (#591): the open note or file's id; left out for a folder. */
  currentId?: string;
  /** A new value (from `revealInFolders`) also moves focus to the row. */
  revealSeq?: number;
  /** Called with whether any folder is open, whenever that changes. */
  onOpenChange?: (anyOpen: boolean) => void;
  /** The Folders tab: tapping its tab again scrolls to the top (R-REVEAL-2). */
  topOnTabTap?: boolean;
  /** "Ask Bower about this" in the pin menu; the host opens the sheet. */
  onAsk?: (name: string) => void;
}

export function Tree({
  index,
  host = 'sidebar',
  onNavigate,
  sort = 'name',
  collapseKey = 0,
  expandKey = 0,
  showAppFiles = false,
  revealPath,
  currentId,
  revealSeq = 0,
  onOpenChange,
  topOnTabTap = false,
  onAsk,
}: TreeProps): JSX.Element {
  const { pinNote, unpinNote, pinFolder, unpinFolder } = useVault();
  // The one row whose pin sheet is open, or `null`.
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const tree = useMemo(() => buildTree(index, sort), [index, sort]);
  const group = useMemo(() => appFileGroup(index), [index]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    mergeExpanded(
      rememberedExpanded ?? new Set<string>(),
      revealPath === undefined ? [] : ancestorsOf(revealPath),
    ),
  );
  // The path whose row is still to be scrolled to and highlighted.
  const pendingReveal = useRef<string | null>(revealPath ?? null);
  const pendingRevealFocus = useRef(false);
  const revealRef = useRef(revealPath);
  revealRef.current = revealPath;
  const [flashPath, setFlashPath] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Nothing is saved until the stored state has been read, so a fresh mount
  // never overwrites it with an empty set.
  const restored = useRef(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const typed = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => {
    let cancelled = false;
    void loadTreeState()
      .then((state) => {
        if (cancelled) return;
        restored.current = true;
        if (state === undefined) return;
        const target = revealRef.current;
        setExpanded(
          mergeExpanded(
            new Set(state.expanded),
            target === undefined ? [] : ancestorsOf(target),
          ),
        );
        // A reveal scrolls to its own row; the stored offset would undo it.
        if (state.scroll > 0 && revealPath === undefined) {
          requestAnimationFrame(() => {
            const parent = scrollParentOf(wrapRef.current);
            if (parent !== null) parent.scrollTop = state.scroll;
            else window.scrollTo(0, state.scroll);
          });
        }
      })
      .catch((err: unknown) => {
        restored.current = true;
        console.error('Could not read the tree state', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(): void {
    if (!restored.current) return;
    void saveTreeState({
      expanded: [...expandedRef.current],
      scroll: currentScroll(wrapRef.current),
    }).catch((err: unknown) =>
      console.error('Could not save the tree state', err),
    );
  }

  useEffect(() => {
    rememberedExpanded = expanded;
    persist();
  }, [expanded]);

  const anyOpen = expanded.size > 0;
  useEffect(() => {
    onOpenChange?.(anyOpen);
  }, [anyOpen]);

  // R-REVEAL-1: a new target opens its ancestors, then waits for its row.
  useEffect(() => {
    if (revealPath === undefined) return;
    pendingReveal.current = revealPath;
    setExpanded((prev) => mergeExpanded(prev, ancestorsOf(revealPath)));
  }, [revealPath, currentId, revealSeq]);

  useEffect(() => {
    if (revealSeq > 0) pendingRevealFocus.current = true;
  }, [revealSeq]);

  // R-REVEAL-2: the Folders tab tapped again while on it scrolls to the top.
  useEffect(() => {
    if (!topOnTabTap) return;
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('a[href="/notes"]') === null) return;
      if (window.location.pathname !== '/notes') return;
      const parent = scrollParentOf(wrapRef.current);
      if (parent !== null) parent.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [topOnTabTap]);

  useEffect(() => {
    const parent: HTMLElement | Window =
      scrollParentOf(wrapRef.current) ?? window;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (): void => {
      clearTimeout(timer);
      timer = setTimeout(persist, SCROLL_SAVE_MS);
    };
    parent.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      parent.removeEventListener('scroll', onScroll);
    };
  }, []);

  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLElement | null>>([]);
  // A row that was off screen when focus was sent to it: focused as soon as
  // the virtual list has rendered it.
  const pendingFocus = useRef<number | null>(null);
  const [loaded, setLoaded] = useState<VirtualModule | null>(virtualModule);
  const listHandle = useRef<VirtualListHandle | null>(null);
  const lastCollapseKey = useRef(collapseKey);
  const lastExpandKey = useRef(expandKey);

  useEffect(() => {
    if (collapseKey === lastCollapseKey.current) return;
    lastCollapseKey.current = collapseKey;
    setExpanded(new Set<string>());
    setFocusIndex(0);
  }, [collapseKey]);

  useEffect(() => {
    if (expandKey === lastExpandKey.current) return;
    lastExpandKey.current = expandKey;
    const all = new Set<string>();
    allFolderPaths(tree, all);
    setExpanded(all);
    setFocusIndex(0);
  }, [expandKey, tree]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    flatten(tree, 0, expanded, out);
    return out;
  }, [tree, expanded]);
  const noteFiles = useMemo(
    () =>
      rows
        .filter((row) => row.kind === 'note' && row.id !== undefined)
        .map((row) => index.byId.get(row.id ?? ''))
        .filter((file): file is DriveFile => file !== undefined),
    [rows, index],
  );
  const titles = useNoteTitles(noteFiles);
  const bowerIds = useBowerWritten(noteFiles);

  const wantsVirtual = rows.length > VIRTUAL_FROM_ROWS;
  useEffect(() => {
    if (!wantsVirtual || loaded !== null) return;
    let cancelled = false;
    void import('./virtual-list.js')
      .then((mod) => {
        virtualModule = mod;
        if (!cancelled) setLoaded(mod);
      })
      .catch((err: unknown) =>
        console.error('Could not load the long-list support', err),
      );
    return () => {
      cancelled = true;
    };
  }, [wantsVirtual, loaded]);

  // Scrolls to the revealed row once it is in the list, and lights it up.
  useEffect(() => {
    const target = pendingReveal.current;
    if (target === null) return;
    if (wantsVirtual && loaded === null) return;
    const at = rows.findIndex((row) =>
      currentId !== undefined
        ? row.id === currentId
        : row.kind === 'folder' && row.path === target,
    );
    if (at === -1) return;
    pendingReveal.current = null;
    setFocusIndex(at);
    const el = rowRefs.current[at];
    if (el) {
      scrollRowIntoView(el);
      // Again once the rows above have settled (titles, pins, the stored
      // expansion arriving), so the row is still in view.
      requestAnimationFrame(() => {
        if (el.isConnected) scrollRowIntoView(el);
      });
      if (pendingRevealFocus.current) el.focus();
    } else if (listHandle.current !== null) {
      if (pendingRevealFocus.current) pendingFocus.current = at;
      listHandle.current.scrollToIndex(at, { align: 'auto' });
    }
    pendingRevealFocus.current = false;
    setFlashPath(target);
  }, [rows, currentId, revealSeq, wantsVirtual, loaded]);

  useEffect(() => {
    if (flashPath === null) return;
    const timer = setTimeout(() => setFlashPath(null), REVEAL_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashPath]);

  function toggle(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function focusAt(i: number): void {
    setFocusIndex(i);
    const el = rowRefs.current[i];
    if (el) {
      el.focus();
    } else if (listHandle.current !== null) {
      pendingFocus.current = i;
      listHandle.current.scrollToIndex(i, { align: 'auto' });
    }
  }

  /** The ref of row `i`: keeps it findable and answers a pending focus. */
  function rowRef(i: number): RefCallback<HTMLElement> {
    return (el) => {
      rowRefs.current[i] = el;
      if (el !== null && pendingFocus.current === i) {
        pendingFocus.current = null;
        el.focus();
      }
    };
  }

  /** A note row's resolved title, a file's title or a folder's own name. */
  function displayName(row: Row): string {
    if (row.kind === 'folder') return folderDisplayName(row.name);
    if (row.kind === 'file') return fileTitle(row.name);
    return (
      (row.id !== undefined ? titles.get(row.id) : undefined) ?? noteTitle(row)
    );
  }

  function onRowKeyDown(
    event: JSX.TargetedKeyboardEvent<HTMLElement>,
    i: number,
  ): void {
    const row = rows[i];
    if (row === undefined) return;
    const { key } = event;
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      focusAt(key === 'Home' ? 0 : rows.length - 1);
      return;
    }
    if (
      key.length === 1 &&
      key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const text =
        now - typed.current.at < TYPE_AHEAD_MS ? typed.current.text + key : key;
      typed.current = { text, at: now };
      const at = typeAheadIndex(rows.map(displayName), i, text);
      if (at !== i) {
        event.preventDefault();
        focusAt(at);
      }
      return;
    }
    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return;
    }
    event.preventDefault();
    if (
      key === 'ArrowRight' &&
      row.kind === 'folder' &&
      row.expanded !== true &&
      row.empty !== true
    ) {
      toggle(row.path);
      return;
    }
    if (key === 'ArrowLeft' && row.kind === 'folder' && row.expanded === true) {
      toggle(row.path);
      return;
    }
    focusAt(nextFocusIndex(rows, i, key));
  }

  function isPinned(row: Row): boolean {
    return row.kind === 'note'
      ? index.notePinnedAt.has(row.id ?? '')
      : index.folderPinnedAt.has(row.path);
  }

  async function togglePin(row: Row): Promise<void> {
    const already = isPinned(row);
    const message = already ? 'Unpinned' : 'Pinned to Home';
    if (row.kind === 'note') {
      const id = row.id ?? '';
      await runPinAction(
        () => (already ? unpinNote(id) : pinNote(id)),
        message,
      );
    } else {
      await runPinAction(
        () => (already ? unpinFolder(row.path) : pinFolder(row.path)),
        message,
      );
    }
  }

  function pinSheetFor(row: Row): JSX.Element {
    const name = displayName(row);
    const driveHref =
      row.kind === 'note'
        ? (() => {
            const file = index.byId.get(row.id ?? '');
            return file === undefined ? '' : driveViewUrl(file);
          })()
        : (() => {
            const file = index.byPath.get(row.path);
            return file === undefined ? '' : driveFolderUrl(file);
          })();
    return (
      <PinSheet
        kind={row.kind === 'folder' ? 'folder' : 'note'}
        name={name}
        pinned={isPinned(row)}
        openHref={folderHref(
          row.kind === 'note' ? folderOf(row.path) : row.path,
        )}
        onAsk={() => onAsk?.(name)}
        driveHref={driveHref}
        onTogglePin={() => void togglePin(row)}
        onClose={() => setOpenRow(null)}
      />
    );
  }

  const showGroup =
    showAppFiles &&
    (group.files.length > 0 ||
      group.instructionNotesCount > 0 ||
      group.agentSettings !== null);

  if (rows.length === 0 && !showGroup) {
    return <p class="tree-empty">Nothing here yet.</p>;
  }

  /** Whether `row` is the open note, file or folder. */
  function isCurrent(row: Row): boolean {
    if (revealPath === undefined) return false;
    return currentId !== undefined
      ? row.id === currentId
      : row.kind === 'folder' && row.path === revealPath;
  }

  // The folder open in the main area: the one holding the open item, or the
  // open folder itself. Its name wears its root's colour (G-22).
  const openFolder =
    revealPath === undefined
      ? undefined
      : currentId !== undefined
        ? folderOf(revealPath)
        : revealPath;

  function guides(depth: number): JSX.Element[] {
    return Array.from({ length: depth }, (_, k) => (
      <span
        key={k}
        class="tree-guide"
        aria-hidden="true"
        style={{ left: `${10 + k * TREE_INDENT}px` }}
      />
    ));
  }

  function rowClass(row: Row, extra: string): string {
    const parts = ['tree-row', extra];
    if (row.depth === 0 && row.kind === 'folder') parts.push('tree-root');
    if (isCurrent(row)) parts.push('tree-row-selected');
    if (flashPath !== null && isCurrent(row)) parts.push('tree-row-reveal');
    if (row.kind === 'folder' && row.path === openFolder) {
      parts.push('tree-row-open');
    }
    return parts.join(' ');
  }

  function rowLink(
    row: Row,
    i: number,
    href: string,
    icon: JSX.Element,
  ): JSX.Element {
    const name = displayName(row);
    const root = rootOf(row.path);
    return (
      <a
        href={href}
        ref={rowRef(i)}
        role="treeitem"
        class="tree-link"
        aria-level={row.depth + 1}
        aria-expanded={
          row.kind === 'folder' && row.empty !== true ? row.expanded : undefined
        }
        aria-selected={isCurrent(row)}
        aria-current={isCurrent(row) ? 'page' : undefined}
        title={name}
        tabIndex={i === focusIndex ? 0 : -1}
        style={
          row.kind === 'folder' && row.path === openFolder && root !== null
            ? { color: `var(--color-para-${root})` }
            : undefined
        }
        onClick={() => onNavigate?.()}
        onDblClick={
          row.kind === 'folder' && row.empty !== true
            ? () => toggle(row.path)
            : undefined
        }
        onKeyDown={(event) => onRowKeyDown(event, i)}
        onFocus={() => setFocusIndex(i)}
      >
        {icon}
        <span class="tree-name">{name}</span>
      </a>
    );
  }

  function folderRow(row: Row, i: number): JSX.Element {
    const name = displayName(row);
    const landmark = rootOf(row.path);
    const icon =
      row.depth === 0 && landmark !== null ? (
        <FolderMark kind={landmark} size={18} />
      ) : (
        <FileIcon
          item={{ name: row.name, mimeType: FOLDER_MIME, path: row.path }}
          size={16}
        />
      );
    return (
      <span
        class={rowClass(row, 'tree-folder')}
        style={{ paddingLeft: `${row.depth * TREE_INDENT + 4}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpenRow(row);
        }}
      >
        {guides(row.depth)}
        {row.empty === true ? (
          <span class="tree-spacer" aria-hidden="true" />
        ) : (
          <button
            type="button"
            class={`tree-chevron${row.expanded === true ? ' tree-chevron-open' : ''}`}
            tabIndex={-1}
            aria-label={`${row.expanded === true ? 'Collapse' : 'Expand'} ${name}`}
            onClick={() => toggle(row.path)}
          >
            <IconChevronRight />
          </button>
        )}
        {rowLink(row, i, folderHref(row.path), icon)}
        {openRow?.path === row.path && pinSheetFor(row)}
      </span>
    );
  }

  function leafRow(row: Row, i: number): JSX.Element {
    const isFile = row.kind === 'file';
    const file =
      row.file ?? (row.id === undefined ? undefined : index.byId.get(row.id));
    const icon = (
      <FileIcon
        item={{
          name: row.name,
          mimeType: file?.mimeType ?? 'text/markdown',
          path: row.path,
          bowerWritten: row.id !== undefined && bowerIds.has(row.id),
        }}
        size={16}
      />
    );
    return (
      <span
        class={rowClass(row, isFile ? 'tree-file' : 'tree-note')}
        style={{ paddingLeft: `${row.depth * TREE_INDENT + 4}px` }}
        onContextMenu={
          isFile
            ? undefined
            : (event) => {
                event.preventDefault();
                setOpenRow(row);
              }
        }
      >
        {guides(row.depth)}
        <span class="tree-spacer" aria-hidden="true" />
        {rowLink(
          row,
          i,
          `${isFile ? '/file/' : '/note/'}${row.id ?? ''}`,
          icon,
        )}
        {openRow?.path === row.path && !isFile && pinSheetFor(row)}
      </span>
    );
  }

  const VirtualList = loaded?.VirtualList;
  const rowHeight = TREE_ROW_HEIGHT[host];

  return (
    <div class={`tree-wrap tree-host-${host}`} ref={wrapRef}>
      {rows.length === 0 ? (
        <p class="tree-empty">Nothing here yet.</p>
      ) : wantsVirtual && VirtualList !== undefined ? (
        <VirtualList
          as="ul"
          rowAs="li"
          class="tree"
          role="tree"
          aria-label="Your folders"
          items={rows}
          estimateSize={() => rowHeight}
          gap={0}
          overscan={10}
          keepIndex={focusIndex}
          handleRef={listHandle}
          getKey={(row) => row.path}
          rowProps={() => ({ role: 'none' })}
          renderRow={(row, i) =>
            row.kind === 'folder' ? folderRow(row, i) : leafRow(row, i)
          }
        />
      ) : (
        <ul class="tree" role="tree" aria-label="Your folders">
          {rows.map((row, i) => (
            <Fragment key={row.path}>
              <li role="none">
                {row.kind === 'folder' ? folderRow(row, i) : leafRow(row, i)}
              </li>
            </Fragment>
          ))}
        </ul>
      )}
      {showGroup && (
        <div class="tree-app-group">
          <h3 class="tree-app-label">Bower's own files</h3>
          <ul class="tree" aria-label="Bower's own files">
            {group.files.map(({ file, label }) => (
              <li key={file.id}>
                <a
                  href={`/note/${file.id}`}
                  class="tree-row tree-app"
                  onClick={() => onNavigate?.()}
                >
                  <span class="tree-spacer" aria-hidden="true" />
                  <FileIcon item={{ ...file, bowerWritten: true }} size={16} />
                  <span class="tree-name">{label}</span>
                </a>
              </li>
            ))}
            {group.instructionNotesCount > 0 && (
              <li>
                <span class="tree-row tree-app">
                  <span class="tree-spacer" aria-hidden="true" />
                  <FileIcon
                    item={{
                      name: 'Instruction notes',
                      mimeType: 'text/markdown',
                      bowerWritten: true,
                    }}
                    size={16}
                  />
                  <span class="tree-name">
                    Instruction notes ({group.instructionNotesCount})
                  </span>
                </span>
              </li>
            )}
            {group.agentSettings && (
              <li>
                <a
                  href={driveFolderUrl(group.agentSettings.file)}
                  target="_blank"
                  rel="noopener"
                  class="tree-row tree-app"
                >
                  <span class="tree-spacer" aria-hidden="true" />
                  <FileIcon item={group.agentSettings.file} size={16} />
                  <span class="tree-name">{group.agentSettings.label}</span>
                </a>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
