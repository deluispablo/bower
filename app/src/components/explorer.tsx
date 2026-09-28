/**
 * The explorer (spec §5.1, §5.2): the user's notes as a tree, with the
 * search field, the Health row, the hidden-files footer and the account.
 * One component, two homes (the phone's top-bar menu opens the folder menu
 * instead, `folder-menu.tsx`, #319):
 *
 * - `variant="sidebar"`: the desktop column (`layout.tsx` wraps it in a
 *   `<nav aria-label="Your notes">` landmark, always open). Shows the mark
 *   and the primary links passed as `nav`. One tool only, Expand/Collapse
 *   all: no sort menu (#326, C.9).
 * - `variant="page"`: the Notes tab (`routes/notes.tsx`, #317). No title row
 *   of its own (the top bar carries "Notes"), a live filter field and the
 *   sidebar's section header with the tree tools.
 *
 * The filter field differs per variant (spec §14): the page's is a real
 * text field that narrows the tree in place (`Tree`'s `filter` prop, pure
 * logic in `navigation.ts#filterTree`); the sidebar's stays a button with a
 * `Ctrl K` hint that opens the
 * quick switcher (#142) instead — the switcher is one tap away either way,
 * from Home's search button and `Ctrl/Cmd+K`. The hidden-files footer
 * button toggles the `showAppFiles` preference (spec §5.3), the same one
 * Settings › Advanced has its own switch for.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { getPref, setPref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import { findReport, isReportNew } from '../health-report.js';
import { useSession } from '../session.js';
import { openSwitcher } from '../switcher-store.js';
import { pinned, useVault } from '../vault-store.js';
import {
  IconCollapse,
  IconEye,
  IconEyeOff,
  IconHeart,
  IconSearch,
  IconSort,
} from './icons.js';
import { PinnedSidebar } from './pinned-sidebar.js';
import { Tree } from './tree.js';

export const HEALTH_PATH = '/health';

/**
 * Whether the latest health report has not been opened yet, for the Health
 * row's "New" badge. Re-read on every render: the Health screen updates the
 * pref, and a route change re-renders the caller. No badge while on that
 * screen.
 */
export function useHealthIsNew(): boolean {
  const { index } = useVault();
  const { path } = useLocation();
  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  return (
    path !== HEALTH_PATH && isReportNew(reportTime, getPref('healthSeenAt'))
  );
}

export interface ExplorerProps {
  variant: 'sidebar' | 'page';
  /** The latest health report has not been opened yet: show "New". */
  healthIsNew: boolean;
  /** Primary links, shown under the search field (desktop sidebar). */
  nav?: ComponentChildren;
}

interface ToolsProps {
  /** Left out for the desktop sidebar (#326): no sort menu there. */
  sort?: ExplorerSortPref;
  onSort?: () => void;
  /** Whether the tree is, as far as the toggle knows, fully expanded: the
   * button's own label and next action (#326, #353: "Expand/Collapse all"
   * is one toggle, not two one-way buttons). */
  expanded: boolean;
  onToggleExpand: () => void;
}

function Tools({
  sort,
  onSort,
  expanded,
  onToggleExpand,
}: ToolsProps): JSX.Element {
  const sortLabel = sort === 'name' ? 'Sort by last modified' : 'Sort by name';
  const expandLabel = expanded ? 'Collapse all' : 'Expand all';
  return (
    <div class="explorer-tools">
      {sort !== undefined && onSort !== undefined && (
        <button
          type="button"
          class="icon-button explorer-tool"
          aria-label={sortLabel}
          title={sortLabel}
          onClick={onSort}
        >
          <IconSort />
        </button>
      )}
      <button
        type="button"
        class="icon-button explorer-tool"
        aria-label={expandLabel}
        title={expandLabel}
        onClick={onToggleExpand}
      >
        <IconCollapse />
      </button>
    </div>
  );
}

export function Explorer({
  variant,
  healthIsNew,
  nav,
}: ExplorerProps): JSX.Element {
  const { me, signOut } = useSession();
  const { index } = useVault();
  const { path } = useLocation();
  const [sort, setSort] = useState<ExplorerSortPref>(() =>
    getPref('explorerSort'),
  );
  const [collapseKey, setCollapseKey] = useState(0);
  const [expandKey, setExpandKey] = useState(0);
  // Tracks the toggle's own last action, not the tree's real state (a
  // folder a person expands or collapses by hand doesn't flip it back):
  // simple on purpose, same as the old one-way Collapse all it replaces.
  const [treeExpanded, setTreeExpanded] = useState(false);
  const [showAppFiles, setShowAppFiles] = useState(() =>
    getPref('showAppFiles'),
  );
  // Page only: the live filter text (spec §14); the sidebar has no field
  // of its own to hold, its button opens the switcher instead.
  const [filter, setFilter] = useState('');

  function toggleSort(): void {
    const next: ExplorerSortPref = sort === 'name' ? 'modified' : 'name';
    setPref('explorerSort', next);
    setSort(next);
  }

  function toggleAppFiles(): void {
    const next = !showAppFiles;
    setPref('showAppFiles', next);
    setShowAppFiles(next);
  }

  function toggleExpandCollapse(): void {
    if (treeExpanded) setCollapseKey((key) => key + 1);
    else setExpandKey((key) => key + 1);
    setTreeExpanded((was) => !was);
  }

  const tools = (
    <Tools
      sort={variant === 'sidebar' ? undefined : sort}
      onSort={variant === 'sidebar' ? undefined : toggleSort}
      expanded={treeExpanded}
      onToggleExpand={toggleExpandCollapse}
    />
  );

  return (
    <div class={`explorer explorer-${variant}`}>
      {variant === 'sidebar' && (
        <a href="/" class="brand explorer-brand" aria-label="Bower home">
          <span class="brand-word">Bower</span>
        </a>
      )}
      {variant !== 'sidebar' ? (
        <div class="explorer-filter">
          <IconSearch />
          <input
            type="text"
            class="explorer-filter-input"
            placeholder="Filter your notes"
            aria-label="Filter your notes"
            value={filter}
            onInput={(event) => {
              setFilter((event.target as HTMLInputElement).value);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          class="explorer-filter"
          onClick={() => {
            openSwitcher();
          }}
        >
          <IconSearch />
          <span class="explorer-filter-label">Search or jump to a note</span>
          <span class="explorer-filter-kbd" aria-hidden="true">
            Ctrl K
          </span>
        </button>
      )}
      <div class="explorer-rows">
        {nav}
        <a
          href={HEALTH_PATH}
          class="explorer-row"
          aria-current={path === HEALTH_PATH ? 'page' : undefined}
        >
          <IconHeart />
          <span class="explorer-row-label">Health</span>
          {healthIsNew && <span class="nav-badge">New</span>}
        </a>
      </div>
      {variant === 'sidebar' && index !== null && (
        <PinnedSidebar items={pinned(index)} />
      )}
      <div class="explorer-section">
        <h2 class="explorer-label">Your notes</h2>
        {tools}
      </div>
      <div class="explorer-tree">
        {index !== null && (
          <Tree
            index={index}
            sort={sort}
            collapseKey={collapseKey}
            expandKey={expandKey}
            filter={variant === 'sidebar' ? undefined : filter}
            showAppFiles={showAppFiles}
            linkFolders
          />
        )}
      </div>
      <button
        type="button"
        class="explorer-hidden"
        aria-pressed={showAppFiles}
        onClick={toggleAppFiles}
      >
        {showAppFiles ? <IconEye /> : <IconEyeOff />}
        <span>
          Bower's own files and dot-folders: {showAppFiles ? 'shown' : 'hidden'}
        </span>
      </button>
      {me !== undefined && (
        <div class="explorer-account">
          <span class="explorer-email">{me.email}</span>
          <button
            type="button"
            class="explorer-signout"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
