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
 */

import type { JSX, RefCallback } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  appFileGroup,
  buildTree,
  driveFolderUrl,
  filterTree,
  folderCounts,
  folderHref,
  nextFocusIndex,
} from '../navigation.js';
import type { TreeNode, TreeRow, TreeSort } from '../navigation.js';
import type { VaultIndex } from '../vault-index.js';
import {
  IconChevronRight,
  IconExternalLink,
  IconFolder,
  IconNote,
} from './icons.js';

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
            return (
              <li
                key={row.path}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.kind === 'folder' ? row.expanded : undefined}
              >
                {row.kind === 'folder' && linkFolders ? (
                  <span
                    class="tree-row tree-folder"
                    style={{ paddingLeft: `${row.depth * 22 + 8}px` }}
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
                  </span>
                ) : row.kind === 'folder' ? (
                  <button
                    type="button"
                    ref={setRef}
                    class="tree-row tree-folder"
                    style={{ paddingLeft: `${row.depth * 22 + 8}px` }}
                    tabIndex={tabIndex}
                    onClick={() => {
                      toggle(row.path);
                      setFocusIndex(i);
                    }}
                    onKeyDown={(event) => onRowKeyDown(event, i)}
                    onFocus={() => setFocusIndex(i)}
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
                ) : (
                  <a
                    href={`/note/${row.id ?? ''}`}
                    ref={setRef}
                    class="tree-row tree-note"
                    style={{ paddingLeft: `${row.depth * 22 + 8}px` }}
                    tabIndex={tabIndex}
                    onClick={() => onNavigate?.()}
                    onKeyDown={(event) => onRowKeyDown(event, i)}
                    onFocus={() => setFocusIndex(i)}
                  >
                    <IconNote />
                    <span class="tree-name">{row.name}</span>
                  </a>
                )}
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
