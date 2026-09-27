/**
 * The PARA tree: collapsible folders, notes linking to `/note/:id`. Desktop
 * keyboard support is a roving `tabindex` (only the focused row is in the
 * tab order) driven by `nextFocusIndex` (pure, in `navigation.ts`): arrow
 * up/down move between visible rows, right/left expand/collapse a folder
 * (or, once a folder can't expand/collapse further, move to its first
 * child / its parent). A note row's Enter opens it; a folder row's Enter
 * either toggles it (the phone drawer) or opens `/folder/<path>` (the
 * desktop sidebar, `linkFolders` — issue #214), matching what its click
 * already does.
 *
 * Each folder row shows its note count (`folderCounts`, subfolders
 * included). The explorer (`explorer.tsx`) passes the order (`sort`) and a
 * `collapseKey` that collapses every folder whenever it changes.
 *
 * A non-blank `filter` (the drawer's live filter, spec §14) swaps in
 * `filterTree`'s result and force-expands every folder it kept, so a match
 * is always visible; the tree's own expand/collapse state underneath is
 * untouched and takes back over once the filter is cleared.
 *
 * Icons are generic (folder / note, from `icons.tsx`): a per-type icon
 * from the first frontmatter tag was in scope, but the index built in
 * `vault-index.ts` has no note text, only Drive metadata, so no tag is
 * available here. Left out; see the PR.
 *
 * `linkFolders` also gates the desktop-only pin entry points (spec §14,
 * issue #216): a hover pin button on every row plus a `contextmenu`
 * (right-click, or the keyboard's Menu key / Shift+F10) menu with the same
 * items as the drawer's held-row sheet (`pin-sheet.tsx`). The drawer itself
 * (`linkFolders` false) gets that sheet from a long press instead
 * (`use-long-press.ts`) — never both at once, since a phone never has
 * `linkFolders` set and a desktop tree never receives pointer holds long
 * enough to matter.
 */

import type { JSX, RefCallback } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import {
  appFileGroup,
  buildTree,
  driveFolderUrl,
  filterTree,
  folderCounts,
  folderHref,
  folderOf,
  nextFocusIndex,
} from '../navigation.js';
import type { TreeNode, TreeRow, TreeSort } from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { useVault } from '../vault-store.js';
import type { VaultIndex } from '../vault-index.js';
import {
  IconChevronRight,
  IconExternalLink,
  IconFolder,
  IconNote,
  IconPin,
} from './icons.js';
import { PinSheet } from './pin-sheet.js';
import { useLongPress } from './use-long-press.js';
import { useNoteTitles } from './use-note-titles.js';

interface Row extends TreeRow {
  name: string;
  /** Set for a note row only. */
  id?: string;
}

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
  for (const note of node.notes) {
    out.push({
      kind: 'note',
      path: note.path,
      depth,
      name: note.name,
      id: note.id,
    });
  }
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
  /** Every change collapses all folders (the explorer's Collapse all). */
  collapseKey?: number;
  /**
   * Show the "Bower's files" group after the tree (the `showAppFiles`
   * preference). Off by default: the tree is the user's notes only.
   */
  showAppFiles?: boolean;
  /**
   * The drawer's live filter (spec §14): narrows the tree to name matches,
   * force-expanding their parent folders. Blank or left out: the tree
   * behaves as before, with its own expand/collapse state.
   */
  filter?: string;
  /**
   * Desktop sidebar only (issue #214): a folder row's name opens
   * `/folder/<path>` (the chevron still toggles, click or Enter). The
   * phone drawer keeps the whole row as a toggle — it is for browsing to a
   * note, not a navigation destination of its own.
   */
  linkFolders?: boolean;
}

export function Tree({
  index,
  onNavigate,
  sort = 'name',
  collapseKey = 0,
  showAppFiles = false,
  filter = '',
  linkFolders = false,
}: TreeProps): JSX.Element {
  const { pinNote, unpinNote, pinFolder, unpinFolder } = useVault();
  // The one row (folder or note) whose pin sheet/menu is open, or `null`.
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const tree = useMemo(() => buildTree(index, sort), [index, sort]);
  const counts = useMemo(() => folderCounts(index), [index]);
  const group = useMemo(() => appFileGroup(index), [index]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

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
  const lastCollapseKey = useRef(collapseKey);

  useEffect(() => {
    if (collapseKey === lastCollapseKey.current) return;
    lastCollapseKey.current = collapseKey;
    setExpanded(new Set<string>());
    setFocusIndex(0);
  }, [collapseKey]);

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
    rowRefs.current[i]?.focus();
  }

  function onRowKeyDown(
    event: JSX.TargetedKeyboardEvent<HTMLElement>,
    i: number,
  ): void {
    const row = rows[i];
    if (row === undefined) return;
    // `linkFolders`: the row is a link now (`/folder/<path>`), so Enter's
    // default action already opens it, same as a note row; only the phone
    // drawer still toggles on Enter.
    if (event.key === 'Enter' && row.kind === 'folder' && !linkFolders) {
      event.preventDefault();
      toggle(row.path);
      return;
    }
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
    if (row.kind !== 'note') return row.name;
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
        kind={row.kind}
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

  // One instance for every drawer row (`useLongPress`'s own doc comment):
  // resolves the row from the `data-row-path` the pressed element carries,
  // since calling the hook once per row inside `rows.map` below would break
  // the Rules of Hooks (rows come and go as folders expand and collapse).
  const longPress = useLongPress((target) => {
    const path = target.dataset.rowPath;
    const found = rows.find((candidate) => candidate.path === path);
    if (found !== undefined) setOpenRow(found);
  });

  const showGroup =
    showAppFiles &&
    (group.files.length > 0 ||
      group.instructionNotesCount > 0 ||
      group.agentSettings !== null);

  const emptyText = filtering ? 'No matches.' : 'Nothing here yet.';

  if (rows.length === 0 && !showGroup) {
    return <p class="tree-empty">{emptyText}</p>;
  }

  return (
    <>
      {rows.length === 0 ? (
        <p class="tree-empty">{emptyText}</p>
      ) : (
        <ul class="tree" role="tree">
          {rows.map((row, i) => {
            const setRef: RefCallback<HTMLElement> = (el) => {
              rowRefs.current[i] = el;
            };
            const tabIndex = i === focusIndex ? 0 : -1;
            const pinLabel = `${isPinned(row) ? 'Unpin' : 'Pin'} ${displayName(row)}`;
            const sheetOpen = openRow?.path === row.path;
            return (
              <li
                key={row.path}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.kind === 'folder' ? row.expanded : undefined}
              >
                {row.kind === 'folder' && linkFolders ? (
                  <span
                    class="tree-row tree-folder tree-row-pinnable"
                    style={{
                      paddingLeft: `${row.depth * 22 + 8}px`,
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
                      aria-hidden="true"
                      onClick={() => toggle(row.path)}
                    >
                      <IconChevronRight />
                    </button>
                    <a
                      href={folderHref(row.path)}
                      ref={setRef}
                      class="tree-folder-link"
                      tabIndex={tabIndex}
                      onClick={() => onNavigate?.()}
                      onKeyDown={(event) => onRowKeyDown(event, i)}
                      onFocus={() => setFocusIndex(i)}
                    >
                      <IconFolder />
                      <span class="tree-name">{row.name}</span>
                      <span class="tree-count">
                        {counts.get(row.path) ?? 0}
                      </span>
                    </a>
                    <button
                      type="button"
                      class="tree-pin"
                      aria-label={pinLabel}
                      aria-pressed={isPinned(row)}
                      // Out of the roving tab order, like the chevron above:
                      // a keyboard user reaches the same toggle through the
                      // row's own menu (Shift+F10 / the Menu key).
                      tabIndex={-1}
                      onClick={() => void togglePin(row)}
                    >
                      <IconPin />
                    </button>
                    {sheetOpen && pinSheetFor(row)}
                  </span>
                ) : row.kind === 'folder' ? (
                  <button
                    type="button"
                    ref={setRef}
                    class="tree-row tree-folder"
                    style={{ paddingLeft: `${row.depth * 22 + 8}px` }}
                    tabIndex={tabIndex}
                    data-row-path={row.path}
                    onClick={() => {
                      if (longPress.consumeLongPress()) return;
                      toggle(row.path);
                      setFocusIndex(i);
                    }}
                    onKeyDown={(event) => onRowKeyDown(event, i)}
                    onFocus={() => setFocusIndex(i)}
                    onPointerDown={longPress.onPointerDown}
                    onPointerMove={longPress.onPointerMove}
                    onPointerUp={longPress.onPointerUp}
                    onPointerCancel={longPress.onPointerCancel}
                    onContextMenu={longPress.onContextMenu}
                  >
                    <span
                      class={`tree-chevron${row.expanded === true ? ' tree-chevron-open' : ''}`}
                    >
                      <IconChevronRight />
                    </span>
                    <IconFolder />
                    <span class="tree-name">{row.name}</span>
                    <span class="tree-count">{counts.get(row.path) ?? 0}</span>
                  </button>
                ) : linkFolders ? (
                  <span
                    class="tree-row tree-note tree-row-pinnable"
                    style={{
                      paddingLeft: `${row.depth * 22 + 8}px`,
                      position: 'relative',
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setOpenRow(row);
                    }}
                  >
                    <a
                      href={`/note/${row.id ?? ''}`}
                      ref={setRef}
                      class="tree-note-link"
                      tabIndex={tabIndex}
                      onClick={() => onNavigate?.()}
                      onKeyDown={(event) => onRowKeyDown(event, i)}
                      onFocus={() => setFocusIndex(i)}
                    >
                      <IconNote />
                      <span class="tree-name">{displayName(row)}</span>
                    </a>
                    <button
                      type="button"
                      class="tree-pin"
                      aria-label={pinLabel}
                      aria-pressed={isPinned(row)}
                      tabIndex={-1}
                      onClick={() => void togglePin(row)}
                    >
                      <IconPin />
                    </button>
                    {sheetOpen && pinSheetFor(row)}
                  </span>
                ) : (
                  <a
                    href={`/note/${row.id ?? ''}`}
                    ref={setRef}
                    class="tree-row tree-note"
                    style={{ paddingLeft: `${row.depth * 22 + 8}px` }}
                    tabIndex={tabIndex}
                    data-row-path={row.path}
                    onClick={(event) => {
                      if (longPress.consumeLongPress()) {
                        event.preventDefault();
                        return;
                      }
                      onNavigate?.();
                    }}
                    onKeyDown={(event) => onRowKeyDown(event, i)}
                    onFocus={() => setFocusIndex(i)}
                    onPointerDown={longPress.onPointerDown}
                    onPointerMove={longPress.onPointerMove}
                    onPointerUp={longPress.onPointerUp}
                    onPointerCancel={longPress.onPointerCancel}
                    onContextMenu={longPress.onContextMenu}
                  >
                    <IconNote />
                    <span class="tree-name">{displayName(row)}</span>
                  </a>
                )}
                {!linkFolders && sheetOpen && pinSheetFor(row)}
              </li>
            );
          })}
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
    </>
  );
}
