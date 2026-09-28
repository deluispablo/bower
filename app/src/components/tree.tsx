/**
 * The PARA tree: collapsible folders, notes linking to `/note/:id` and files
 * linking to `/file/:id`, all as rows (#588). Used by
 * both explorer variants (`explorer.tsx`) — the desktop sidebar and the
 * Notes tab (#317) — never the phone's own folder menu, which is a
 * separate component with its own rendering (`folder-menu.tsx`, #397).
 *
 * Desktop keyboard support is a roving `tabindex` (only the focused row is
 * in the tab order) driven by `nextFocusIndex` (pure, in `navigation.ts`):
 * arrow up/down move between visible rows, right/left expand/collapse a
 * folder (or, once a folder can't expand/collapse further, move to its
 * first child / its parent). A note row's Enter opens it; a folder row's
 * name is a link to `/folder/<path>` (issue #214), so Enter opens that the
 * same way — the chevron alone still toggles expand/collapse, by its own
 * click or the arrow keys.
 *
 * Row anatomy (v4): a 44 x 44 chevron button of its own ("Expand
 * Projects" / "Collapse Projects", out of the tab order like the row's pin
 * button; the arrow keys do the same), then the name, a link to
 * `/folder/<path>`. The five landmarks wear a `FolderMark` (28 px in the
 * Notes tab, 18 px in the sidebar; `rootMeanings` tells them apart) with
 * their meaning line, then a divider, then the other top folders with a
 * neutral `FolderIcon`; subfolders take their top folder's tint. A file
 * row carries its kind icon and `KindBadge`. `useNew` adds a `NewTag` to
 * new rows and "<n> new" to folders holding some. Expanded folders and the
 * scroll offset live in the `treeState` store, shared by both variants.
 *
 * Each folder row shows its count (`folderCounts`: notes and files,
 * subfolders included). The explorer (`explorer.tsx`) passes the order (`sort`) and a
 * `collapseKey`/`expandKey` pair (its one Expand/Collapse all toggle,
 * #326, #353) that collapses, or expands, every folder whenever either
 * changes.
 *
 * A non-blank `filter` (spec §14; no caller passes one since the Notes
 * tab's search row opens the switcher instead, #433) swaps in
 * `filterTree`'s result and force-expands every folder it kept, so a match
 * is always visible; the tree's own expand/collapse state underneath is
 * untouched and takes back over once the filter is cleared.
 *
 * Pinning (spec §14, issue #216): a hover pin button on every row plus a
 * `contextmenu` (right-click, or the keyboard's Menu key / Shift+F10) menu
 * with the same items as the folder menu's held-row sheet (`pin-sheet.tsx`).
 */

import { Fragment } from 'preact';
import type { JSX, RefCallback } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { loadTreeState, saveTreeState } from '../cache.js';
import { folderMeaning } from '../folder-meanings.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  appFileGroup,
  buildTree,
  displayName as folderDisplayName,
  driveFolderUrl,
  filterTree,
  folderCounts,
  folderHref,
  folderOf,
  nextFocusIndex,
  paraKindOf,
} from '../navigation.js';
import type { ParaKind, TreeNode, TreeRow, TreeSort } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { ancestorsOf, mergeExpanded } from '../reveal.js';
import { useNew } from '../use-new.js';
import { useVault } from '../vault-store.js';
import { fileKind, fileTitle } from '../vault-index.js';
import type { FileKind, VaultIndex } from '../vault-index.js';
import { FolderIcon, FolderMark } from './folder-mark.js';
import {
  IconChevronRight,
  IconDoc,
  IconExternalLink,
  IconFolder,
  IconImage,
  IconNote,
  IconPdf,
  IconPin,
} from './icons.js';
import { KindBadge } from './kind-badge.js';
import { PinSheet } from './pin-sheet.js';
import { NewTag } from './tags.js';
import { useNoteTitles } from './use-note-titles.js';
import type { VirtualListHandle } from './virtual-list.js';

import '../styles/tree.css';

interface Row extends TreeRow {
  /** A folder's name as Drive has it (numeric prefix included). */
  name: string;
  /** Set for a note or file row. */
  id?: string;
  /** Set for a file row. */
  file?: DriveFile;
}

/**
 * Past this many visible rows the tree renders only the ones in view
 * (`VirtualList`, #590); below it every row is in the DOM, as before.
 */
const VIRTUAL_FROM_ROWS = 150;

type VirtualModule = typeof import('./virtual-list.js');

// Loaded the first time a tree passes the threshold, so the virtualiser and
// TanStack Virtual stay out of the startup chunk. Until it arrives the plain
// list renders.
let virtualModule: VirtualModule | null = null;

/** A row's height in px before it is measured: the 44 px row plus its gap. */
const ROW_ESTIMATE = 46;

/** How long the revealed row's highlight lasts (matches `tree.css`). */
const REVEAL_FLASH_MS = 600;

// The folders open when this tree last changed, kept for the next tree that
// mounts (the phone's Notes tab mounts a fresh one on every visit) so it
// paints open at once instead of collapsed until the stored state is read.
let rememberedExpanded: ReadonlySet<string> | null = null;

/** How long a scroll must rest before its offset is saved. */
const SCROLL_SAVE_MS = 250;

function flatten(
  node: TreeNode,
  depth: number,
  expanded: ReadonlySet<string>,
  out: Row[],
): void {
  for (const folder of node.folders) {
    const isExpanded = expanded.has(folder.path);
    out.push({
      kind: 'folder',
      path: folder.path,
      depth,
      expanded: isExpanded,
      name: folder.name,
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

/** The nearest ancestor that scrolls, or `null` when the page itself does. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

function currentScroll(el: HTMLElement | null): number {
  return scrollParentOf(el)?.scrollTop ?? window.scrollY;
}

function FileRowIcon({ kind }: { kind: FileKind }): JSX.Element {
  let icon: JSX.Element;
  if (kind === 'pdf') icon = <IconPdf />;
  else if (kind === 'photo' || kind === 'image' || kind === 'heic') {
    icon = <IconImage />;
  } else icon = <IconDoc />;
  return (
    <span class="tree-kind-icon" aria-hidden="true">
      {icon}
    </span>
  );
}

/** Every folder path in `node`, so a filtered tree can be shown fully open. */
function allFolderPaths(node: TreeNode, out: Set<string>): void {
  for (const folder of node.folders) {
    out.add(folder.path);
    allFolderPaths(folder, out);
  }
}

interface TreeProps {
  index: VaultIndex;
  /** Called when a note link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
  /** The explorer's order; by name when left out. */
  sort?: TreeSort;
  /** Every change collapses all folders (the explorer's Expand/Collapse all). */
  collapseKey?: number;
  /** Every change expands all folders (the explorer's Expand/Collapse all). */
  expandKey?: number;
  /**
   * Show the "Bower's files" group after the tree (the `showAppFiles`
   * preference). Off by default: the tree is the user's notes only.
   */
  showAppFiles?: boolean;
  /**
   * A live filter (spec §14; unused since #433): narrows the tree to name matches,
   * force-expanding their parent folders. Blank or left out: the tree
   * behaves as before, with its own expand/collapse state.
   */
  filter?: string;
  /**
   * The Notes tab (phone) variant: marks 28 px and the full meaning line
   * under a top folder's name. Off (the desktop sidebar): marks 18 px and
   * the short meaning line. Both come from `folder-meanings.ts`.
   */
  rootMeanings?: boolean;
  /**
   * Reveal (#591): the vault path of the open note, file or folder. Its
   * ancestors are added to the open folders (none is ever closed), its row is
   * marked current, highlighted for a moment and scrolled into view.
   */
  revealPath?: string;
  /** Reveal (#591): the open note or file's id; left out for a folder. */
  currentId?: string;
  /** Called with whether any folder is open, whenever that changes. */
  onOpenChange?: (anyOpen: boolean) => void;
  /**
   * The Notes tab (phone): tapping the Notes tab again while on `/notes`
   * scrolls the tree to the top (R-REVEAL-2).
   */
  topOnTabTap?: boolean;
}

export function Tree({
  index,
  onNavigate,
  sort = 'name',
  collapseKey = 0,
  expandKey = 0,
  showAppFiles = false,
  filter = '',
  rootMeanings = false,
  revealPath,
  currentId,
  onOpenChange,
  topOnTabTap = false,
}: TreeProps): JSX.Element {
  const { pinNote, unpinNote, pinFolder, unpinFolder } = useVault();
  // The one row (folder or note) whose pin sheet/menu is open, or `null`.
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const tree = useMemo(() => buildTree(index, sort), [index, sort]);
  // #425: files and notes together, the same total the folder screen
  // itself lists ("n files · n notes") — the Notes tab and the desktop
  // sidebar (`components/explorer.tsx`) share this one `Tree`.
  const counts = useMemo(() => folderCounts(index, true), [index]);
  const group = useMemo(() => appFileGroup(index), [index]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    mergeExpanded(
      rememberedExpanded ?? new Set<string>(),
      revealPath === undefined ? [] : ancestorsOf(revealPath),
    ),
  );
  // The path whose row is still to be scrolled to and highlighted.
  const pendingReveal = useRef<string | null>(revealPath ?? null);
  const revealRef = useRef(revealPath);
  revealRef.current = revealPath;
  const [flashPath, setFlashPath] = useState<string | null>(null);
  const newState = useNew();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Nothing is saved until the stored state has been read, so a fresh mount
  // never overwrites it with an empty set.
  const restored = useRef(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    let cancelled = false;
    void loadTreeState()
      .then((state) => {
        if (cancelled) return;
        restored.current = true;
        if (state === undefined) return;
        // The stored folders, plus the ancestors of what is being revealed:
        // a reveal that ran before the state arrived keeps its folders.
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
  }, [revealPath, currentId]);

  // R-REVEAL-2: the Notes tab tapped again while on it scrolls to the top.
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

  const filtering = filter.trim() !== '';
  const displayTree = useMemo(
    () => (filtering ? filterTree(tree, filter) : tree),
    [tree, filtering, filter],
  );
  const displayExpanded = useMemo(() => {
    if (!filtering) return expanded;
    const paths = new Set<string>();
    allFolderPaths(displayTree, paths);
    return paths;
  }, [filtering, displayTree, expanded]);
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
    flatten(displayTree, 0, displayExpanded, out);
    return out;
  }, [displayTree, displayExpanded]);
  const noteFiles = useMemo(
    () =>
      rows
        .filter((row) => row.kind === 'note' && row.id !== undefined)
        .map((row) => index.byId.get(row.id ?? ''))
        .filter((file): file is DriveFile => file !== undefined),
    [rows, index],
  );
  const titles = useNoteTitles(noteFiles);

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
    if (target === null || filtering) return;
    if (wantsVirtual && loaded === null) return;
    const at = rows.findIndex((row) =>
      currentId !== undefined
        ? row.id === currentId
        : row.kind === 'folder' && row.path === target,
    );
    if (at === -1) return;
    pendingReveal.current = null;
    const el = rowRefs.current[at];
    if (el) {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    } else if (listHandle.current !== null) {
      listHandle.current.scrollToIndex(at, { align: 'auto' });
    }
    setFlashPath(target);
  }, [rows, currentId, filtering, wantsVirtual, loaded]);

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

  function onRowKeyDown(
    event: JSX.TargetedKeyboardEvent<HTMLElement>,
    i: number,
  ): void {
    const row = rows[i];
    if (row === undefined) return;
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight'
    ) {
      return;
    }
    event.preventDefault();
    if (
      event.key === 'ArrowRight' &&
      row.kind === 'folder' &&
      row.expanded !== true
    ) {
      toggle(row.path);
      return;
    }
    if (
      event.key === 'ArrowLeft' &&
      row.kind === 'folder' &&
      row.expanded === true
    ) {
      toggle(row.path);
      return;
    }
    focusAt(nextFocusIndex(rows, i, event.key));
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

  /** A note row's resolved title (`useNoteTitles`, falling back to
   * `noteTitle`'s file-name reading while the cache hasn't answered yet),
   * or a folder's own name. Used for the sheet's dialog name and its "Ask
   * Bower" wording, and for the row's own label. */
  function displayName(row: Row): string {
    if (row.kind === 'folder') return folderDisplayName(row.name);
    if (row.kind === 'file') return fileTitle(row.name);
    return (
      (row.id !== undefined ? titles.get(row.id) : undefined) ?? noteTitle(row)
    );
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
        tellHref={`/bower?text=${encodeURIComponent(
          row.kind === 'note' ? `[[${name}]] ` : `${name} `,
        )}`}
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

  const emptyText = filtering ? 'No matches.' : 'Nothing here yet.';

  if (rows.length === 0 && !showGroup) {
    return <p class="tree-empty">{emptyText}</p>;
  }

  const markSize = rootMeanings ? 28 : 18;
  // The divider sits before the first top folder that is not a landmark,
  // once a landmark has been shown.
  let landmarkSeen = false;
  let dividerBefore = -1;
  rows.forEach((row, i) => {
    if (row.kind !== 'folder' || row.depth !== 0) return;
    if (paraKindOf(row.name) !== null) landmarkSeen = true;
    else if (landmarkSeen && dividerBefore === -1) dividerBefore = i;
  });

  /** Whether `row` is the open note, file or folder. */
  function isCurrent(row: Row): boolean {
    if (revealPath === undefined) return false;
    return currentId !== undefined
      ? row.id === currentId
      : row.kind === 'folder' && row.path === revealPath;
  }

  /** The highlight class while the revealed row's flash lasts. */
  function revealClass(row: Row): string {
    return flashPath !== null && isCurrent(row) ? ' tree-row-reveal' : '';
  }

  function folderRow(row: Row, i: number): JSX.Element {
    const name = displayName(row);
    const setRef = rowRef(i);
    const top = row.path.split('/')[0] ?? '';
    const landmark: ParaKind | null = paraKindOf(top);
    const meaning =
      row.depth === 0
        ? folderMeaning(row.path, rootMeanings ? 'full' : 'short')
        : undefined;
    const fresh = newState.newCountIn(row.path);
    const count = counts.get(row.path) ?? 0;
    const nameEl =
      meaning === undefined ? (
        <span class="tree-name">{name}</span>
      ) : (
        <span class="tree-name-group">
          <span class="tree-name">{name}</span>
          <span class="tree-meaning">{meaning}</span>
        </span>
      );
    return (
      <span
        class={`tree-row tree-folder tree-row-pinnable${revealClass(row)}`}
        style={{
          paddingLeft: `${row.depth * 16 + 4}px`,
          position: 'relative',
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpenRow(row);
        }}
      >
        <button
          type="button"
          class={`tree-chevron${row.expanded === true ? ' tree-chevron-open' : ''}`}
          tabIndex={-1}
          aria-label={`${row.expanded === true ? 'Collapse' : 'Expand'} ${name}`}
          onClick={() => toggle(row.path)}
        >
          <IconChevronRight />
        </button>
        <a
          href={folderHref(row.path)}
          ref={setRef}
          class="tree-folder-link"
          aria-current={isCurrent(row) ? 'page' : undefined}
          tabIndex={i === focusIndex ? 0 : -1}
          onClick={() => onNavigate?.()}
          onKeyDown={(event) => onRowKeyDown(event, i)}
          onFocus={() => setFocusIndex(i)}
        >
          {row.depth === 0 && landmark !== null ? (
            <FolderMark kind={landmark} size={markSize} />
          ) : (
            <FolderIcon
              tint={row.depth === 0 ? undefined : (landmark ?? undefined)}
            />
          )}
          {nameEl}
          {fresh > 0 && <NewTag count={fresh} />}
          {count > 0 && <span class="tree-count">{count}</span>}
        </a>
        <button
          type="button"
          class="tree-pin"
          aria-label={`${isPinned(row) ? 'Unpin' : 'Pin'} ${name}`}
          aria-pressed={isPinned(row)}
          // Out of the roving tab order, like the chevron above: a keyboard
          // user reaches the same toggle through the row's own menu
          // (Shift+F10 / the Menu key).
          tabIndex={-1}
          onClick={() => void togglePin(row)}
        >
          <IconPin />
        </button>
        {openRow?.path === row.path && pinSheetFor(row)}
      </span>
    );
  }

  function leafRow(row: Row, i: number): JSX.Element {
    const name = displayName(row);
    const isFile = row.kind === 'file';
    const setRef = rowRef(i);
    return (
      <span
        class={`tree-row ${isFile ? 'tree-file' : 'tree-note'}${isFile ? '' : ' tree-row-pinnable'}${revealClass(row)}`}
        style={{
          paddingLeft: `${row.depth * 16 + 4}px`,
          position: 'relative',
        }}
        onContextMenu={
          isFile
            ? undefined
            : (event) => {
                event.preventDefault();
                setOpenRow(row);
              }
        }
      >
        <span class="tree-spacer" aria-hidden="true" />
        <a
          href={`${isFile ? '/file/' : '/note/'}${row.id ?? ''}`}
          ref={setRef}
          class="tree-note-link"
          aria-current={isCurrent(row) ? 'page' : undefined}
          tabIndex={i === focusIndex ? 0 : -1}
          onClick={() => onNavigate?.()}
          onKeyDown={(event) => onRowKeyDown(event, i)}
          onFocus={() => setFocusIndex(i)}
        >
          {row.file !== undefined ? (
            <FileRowIcon kind={fileKind(row.file)} />
          ) : (
            <IconNote />
          )}
          <span class="tree-name">{name}</span>
          {row.file !== undefined && (
            <KindBadge kind={fileKind(row.file)} file={row.file} />
          )}
          {row.id !== undefined && newState.isNew(row.id) && <NewTag />}
        </a>
        {!isFile && (
          <button
            type="button"
            class="tree-pin"
            aria-label={`${isPinned(row) ? 'Unpin' : 'Pin'} ${name}`}
            aria-pressed={isPinned(row)}
            tabIndex={-1}
            onClick={() => void togglePin(row)}
          >
            <IconPin />
          </button>
        )}
        {openRow?.path === row.path && !isFile && pinSheetFor(row)}
      </span>
    );
  }

  const VirtualList = loaded?.VirtualList;

  return (
    <div class="tree-wrap" ref={wrapRef}>
      {rows.length === 0 ? (
        <p class="tree-empty">{emptyText}</p>
      ) : wantsVirtual && VirtualList !== undefined ? (
        <VirtualList
          as="ul"
          rowAs="li"
          class="tree"
          role="tree"
          items={rows}
          estimateSize={() => ROW_ESTIMATE}
          gap={2}
          overscan={10}
          keepIndex={focusIndex}
          handleRef={listHandle}
          getKey={(row) => row.path}
          rowProps={(row, i) => ({
            role: 'treeitem',
            'aria-level': row.depth + 1,
            'aria-expanded': row.kind === 'folder' ? row.expanded : undefined,
            style:
              i === dividerBefore
                ? { borderTop: '1px solid var(--color-border)' }
                : undefined,
          })}
          renderRow={(row, i) =>
            row.kind === 'folder' ? folderRow(row, i) : leafRow(row, i)
          }
        />
      ) : (
        <ul class="tree" role="tree">
          {rows.map((row, i) => (
            <Fragment key={row.path}>
              {i === dividerBefore && (
                <li
                  role="presentation"
                  class="tree-divider"
                  aria-hidden="true"
                />
              )}
              <li
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.kind === 'folder' ? row.expanded : undefined}
              >
                {row.kind === 'folder' ? folderRow(row, i) : leafRow(row, i)}
              </li>
            </Fragment>
          ))}
        </ul>
      )}
      {showGroup && (
        <>
          <div class="tree-app-divider" aria-hidden="true" />
          <ul class="tree tree-app-group" aria-label="Bower's files">
            {group.files.map(({ file, label }) => (
              <li key={file.id}>
                <a
                  href={`/note/${file.id}`}
                  class="tree-row tree-note tree-app"
                  onClick={() => onNavigate?.()}
                >
                  <IconNote />
                  <span class="tree-name">{label}</span>
                  <span class="tag-app">app</span>
                </a>
              </li>
            ))}
            {group.instructionNotesCount > 0 && (
              <li>
                <span class="tree-row tree-app-summary">
                  <IconNote />
                  <span class="tree-name">
                    Instruction notes ({group.instructionNotesCount})
                  </span>
                  <span class="tag-app">app</span>
                </span>
              </li>
            )}
            {group.agentSettings && (
              <li>
                <a
                  href={driveFolderUrl(group.agentSettings.file)}
                  target="_blank"
                  rel="noopener"
                  class="tree-row tree-note tree-app"
                >
                  <IconFolder />
                  <span class="tree-name">{group.agentSettings.label}</span>
                  <IconExternalLink />
                  <span class="tag-app">app</span>
                </a>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
