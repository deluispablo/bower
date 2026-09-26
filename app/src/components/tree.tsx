/**
 * The PARA tree: collapsible folders, notes linking to `/note/:id`. Desktop
 * keyboard support is a roving `tabindex` (only the focused row is in the
 * tab order) driven by `nextFocusIndex` (pure, in `navigation.ts`): arrow
 * up/down move between visible rows, right/left expand/collapse a folder
 * (or, once a folder can't expand/collapse further, move to its first
 * child / its parent), Enter opens a note or toggles a folder.
 *
 * Icons are generic (folder / note): a per-type icon from the first
 * frontmatter tag was in scope, but the index built in `vault-index.ts` has
 * no note text, only Drive metadata, so no tag is available here. Left out;
 * see the PR.
 */

import type { JSX, RefCallback } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { buildTree, nextFocusIndex } from '../navigation.js';
import type { TreeNode, TreeRow } from '../navigation.js';
import type { VaultIndex } from '../vault-index.js';

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

/** `#folder=<path>` from a Home shortcut (e.g. "Answers"); expand and reveal it once. */
function folderFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const match = /^#folder=(.+)$/.exec(window.location.hash);
  return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
}

function FolderIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function NoteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M9 12h6M9 16h6"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}

interface TreeProps {
  index: VaultIndex;
  /** Called when a note link is activated, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
}

export function Tree({ index, onNavigate }: TreeProps) {
  const tree = useMemo(() => buildTree(index), [index]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLElement | null>>([]);
  const revealedHash = useRef(false);

  const rows = useMemo(() => {
    const out: Row[] = [];
    flatten(tree, 0, expanded, out);
    return out;
  }, [tree, expanded]);

  // Deep-link from Home's "Answers" shortcut: expand that top-level folder
  // once notes have loaded, no route of its own (kept minimal, see the PR).
  useEffect(() => {
    if (revealedHash.current || rows.length === 0) return;
    const folder = folderFromHash();
    if (folder === null) return;
    if (!expanded.has(folder)) {
      setExpanded((prev) => new Set(prev).add(folder));
      return;
    }
    revealedHash.current = true;
    const at = rows.findIndex((row) => row.path === folder);
    rowRefs.current[at]?.scrollIntoView({ block: 'center' });
  }, [rows, expanded]);

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
    if (event.key === 'Enter' && row.kind === 'folder') {
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

  if (rows.length === 0) {
    return <p class="tree-empty">Nothing here yet.</p>;
  }

  return (
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
            {row.kind === 'folder' ? (
              <button
                type="button"
                ref={setRef}
                class="tree-row tree-folder"
                style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
                tabIndex={tabIndex}
                onClick={() => {
                  toggle(row.path);
                  setFocusIndex(i);
                }}
                onKeyDown={(event) => onRowKeyDown(event, i)}
                onFocus={() => setFocusIndex(i)}
              >
                <FolderIcon />
                <span class="tree-name">{row.name}</span>
              </button>
            ) : (
              <a
                href={`/note/${row.id ?? ''}`}
                ref={setRef}
                class="tree-row tree-note"
                style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
                tabIndex={tabIndex}
                onClick={() => onNavigate?.()}
                onKeyDown={(event) => onRowKeyDown(event, i)}
                onFocus={() => setFocusIndex(i)}
              >
                <NoteIcon />
                <span class="tree-name">{row.name}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
