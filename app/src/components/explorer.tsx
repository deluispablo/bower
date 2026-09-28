/**
 * The explorer (spec §5.1, §5.2): the user's notes as a tree, with the
 * search field, the Health row and the hidden-files footer. One component,
 * two homes (the phone's top-bar menu opens the folder menu instead,
 * `folder-menu.tsx`, #319):
 *
 * - `variant="sidebar"`: the desktop column (`layout.tsx` wraps it in a
 *   `<nav aria-label="Your notes">` landmark, always open). Shows the mark,
 *   the primary links passed as `nav`, and the account; self-manages its
 *   own sort + Expand/Collapse all tools (one tool only, no sort menu,
 *   #326, C.9) and keeps the Health row near the top.
 * - `variant="page"`: the Notes tab (`routes/notes.tsx`, #317, #353). No
 *   title row of its own (the top bar carries "Notes"), no account row, no
 *   sort; the tree's root folders carry their one-line meaning
 *   (`Tree`'s `rootMeanings`); the Health row and the hidden-files line
 *   sit together at the bottom. Its Expand/Collapse all is one header-bar
 *   button the route itself owns (`collapseKey`/`expandKey` below), since
 *   the actions slot lives in the shell, outside this component.
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
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { getPref, setPref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import {
  findReport,
  healthRowSubtitle,
  isReportNew,
  summarise,
} from '../health-report.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
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

/**
 * The findings count behind the Notes tab's compact Health row subtitle
 * (#353, `healthRowSubtitle`): fetches and parses the latest report the
 * same way the Health screen does (`routes/health.tsx`), but only reads
 * its frontmatter's declared count — never the body's checklist — since
 * this row never shows the findings themselves, only points at the Health
 * screen for them. `undefined` while loading, offline, or before a first
 * report exists; a fetch error is silent here for the same reason (the
 * Health screen is where an error message belongs). `enabled`: the
 * sidebar has no use for this (#326 keeps its Health row plain), so it
 * passes `false` and this never fetches anything there.
 */
export function useHealthFindings(enabled: boolean): number | undefined {
  const { index, getNoteText } = useVault();
  const [findings, setFindings] = useState<number | undefined>(undefined);
  const file = index === null ? undefined : findReport(index);

  useEffect(() => {
    if (!enabled || file === undefined) {
      setFindings(undefined);
      return;
    }
    let cancelled = false;
    getNoteText(file.id)
      .then((text) => {
        if (cancelled) return;
        setFindings(summarise(parseFrontmatter(text))?.findings);
      })
      .catch(() => {
        // Offline, or an unreadable report: leave the subtitle at "not
        // checked yet" rather than guess a count.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, file, getNoteText]);

  return findings;
}

export interface ExplorerProps {
  variant: 'sidebar' | 'page';
  /** The latest health report has not been opened yet: show "New". */
  healthIsNew: boolean;
  /** Primary links, shown under the search field (desktop sidebar). */
  nav?: ComponentChildren;
  /**
   * Page variant only (#353): the Notes route's own header-bar
   * Expand/Collapse all toggle drives the tree from outside. Left out
   * (0) for the sidebar, which keeps its own inline tool instead.
   */
  collapseKey?: number;
  expandKey?: number;
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
  collapseKey: pageCollapseKey = 0,
  expandKey: pageExpandKey = 0,
}: ExplorerProps): JSX.Element {
  const { me, signOut } = useSession();
  const { index } = useVault();
  const { path } = useLocation();
  const [sort, setSort] = useState<ExplorerSortPref>(() =>
    getPref('explorerSort'),
  );
  // Sidebar only: its own inline tool (page's Expand/Collapse all lives in
  // the header bar instead, driven by the `collapseKey`/`expandKey` props).
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
  const findings = useHealthFindings(variant !== 'sidebar');

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

  const hiddenFilesButton = (
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
  );

  const healthRow = (
    <a
      href={HEALTH_PATH}
      class={`explorer-row${variant === 'sidebar' ? '' : ' explorer-health-row'}`}
      aria-current={path === HEALTH_PATH ? 'page' : undefined}
    >
      {variant === 'sidebar' ? (
        <>
          <IconHeart />
          <span class="explorer-row-label">Health</span>
          {healthIsNew && <span class="nav-badge">New</span>}
        </>
      ) : (
        <>
          <span class="explorer-health-icon">
            <IconHeart />
          </span>
          <span class="explorer-health-text">
            <b>
              Health check
              {healthIsNew && <span class="nav-badge">New</span>}
            </b>
            <span class="explorer-health-subtitle">
              {healthRowSubtitle(findings)}
            </span>
          </span>
        </>
      )}
    </a>
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
      {variant === 'sidebar' && (
        <div class="explorer-rows">
          {nav}
          {healthRow}
        </div>
      )}
      {variant === 'sidebar' && index !== null && (
        <PinnedSidebar items={pinned(index)} />
      )}
      {variant === 'sidebar' && (
        <div class="explorer-section">
          <h2 class="explorer-label">Your notes</h2>
          {tools}
        </div>
      )}
      <div class="explorer-tree">
        {index !== null && (
          <Tree
            index={index}
            sort={sort}
            collapseKey={variant === 'sidebar' ? collapseKey : pageCollapseKey}
            expandKey={variant === 'sidebar' ? expandKey : pageExpandKey}
            filter={variant === 'sidebar' ? undefined : filter}
            showAppFiles={showAppFiles}
            linkFolders
            rootMeanings={variant !== 'sidebar'}
          />
        )}
      </div>
      {variant !== 'sidebar' ? (
        <div class="explorer-foot">
          {healthRow}
          {hiddenFilesButton}
        </div>
      ) : (
        hiddenFilesButton
      )}
      {variant === 'sidebar' && me !== undefined && (
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
