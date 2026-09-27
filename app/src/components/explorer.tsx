/**
 * The explorer (spec §5.1, §5.2): the user's notes as a tree, with the
 * search field, the Health row, the hidden-files footer and the account.
 * One component, two homes:
 *
 * - `variant="sidebar"`: the desktop column (`layout.tsx` wraps it in a
 *   `<nav aria-label="Your notes">` landmark, always open). Shows the mark
 *   and the primary links passed as `nav`.
 * - `variant="drawer"`: inside `ExplorerDrawer`, the phone's modal dialog
 *   opened from the top bar's menu button. Shows a title row with a close
 *   button; following any link inside closes it.
 *
 * The filter field differs per variant (spec §14): the drawer's is a real
 * text field that narrows the tree in place (`Tree`'s `filter` prop, pure
 * logic in `navigation.ts#filterTree`), so the drawer stays open while
 * typing; the sidebar's stays a button with a `Ctrl K` hint that opens the
 * quick switcher (#142) instead — the switcher is one tap away either way,
 * from Home's search button and `Ctrl/Cmd+K`. The hidden-files footer
 * button toggles the `showAppFiles` preference (spec §5.3), the same one
 * Settings › Advanced has its own switch for.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { getPref, setPref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import { useSession } from '../session.js';
import { openSwitcher } from '../switcher-store.js';
import { useVault } from '../vault-store.js';
import {
  IconClose,
  IconCollapse,
  IconEye,
  IconEyeOff,
  IconHeart,
  IconSearch,
  IconSort,
} from './icons.js';
import { Tree } from './tree.js';
import { useFocusTrap } from './use-focus-trap.js';

export const HEALTH_PATH = '/health';

export interface ExplorerProps {
  variant: 'sidebar' | 'drawer';
  /** The latest health report has not been opened yet: show "New". */
  healthIsNew: boolean;
  /** Primary links, shown under the search field (desktop sidebar). */
  nav?: ComponentChildren;
  /** Drawer only: close it (close button, a followed link, sign out). */
  onClose?: () => void;
}

interface ToolsProps {
  sort: ExplorerSortPref;
  onSort: () => void;
  onCollapse: () => void;
}

function Tools({ sort, onSort, onCollapse }: ToolsProps): JSX.Element {
  const sortLabel = sort === 'name' ? 'Sort by last modified' : 'Sort by name';
  return (
    <div class="explorer-tools">
      <button
        type="button"
        class="icon-button explorer-tool"
        aria-label={sortLabel}
        title={sortLabel}
        onClick={onSort}
      >
        <IconSort />
      </button>
      <button
        type="button"
        class="icon-button explorer-tool"
        aria-label="Collapse all"
        title="Collapse all"
        onClick={onCollapse}
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
  onClose,
}: ExplorerProps): JSX.Element {
  const { me, signOut } = useSession();
  const { index } = useVault();
  const { path } = useLocation();
  const [sort, setSort] = useState<ExplorerSortPref>(() =>
    getPref('explorerSort'),
  );
  const [collapseKey, setCollapseKey] = useState(0);
  const [showAppFiles, setShowAppFiles] = useState(() =>
    getPref('showAppFiles'),
  );
  // Drawer only: the live filter text (spec §14); the sidebar has no field
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

  function collapseAll(): void {
    setCollapseKey((key) => key + 1);
  }

  const tools = (
    <Tools sort={sort} onSort={toggleSort} onCollapse={collapseAll} />
  );

  return (
    <div class={`explorer explorer-${variant}`}>
      {variant === 'drawer' ? (
        <div class="explorer-head">
          <h2 class="explorer-title">Your notes</h2>
          {tools}
          <button
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
      ) : (
        <a href="/" class="brand explorer-brand" aria-label="Bower home">
          <span class="brand-word">Bower</span>
        </a>
      )}
      {variant === 'drawer' ? (
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
          onClick={onClose}
        >
          <IconHeart />
          <span class="explorer-row-label">Health</span>
          {healthIsNew && <span class="nav-badge">New</span>}
        </a>
      </div>
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
            collapseKey={collapseKey}
            filter={variant === 'drawer' ? filter : undefined}
            onNavigate={onClose}
            showAppFiles={showAppFiles}
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
              onClose?.();
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

interface ExplorerDrawerProps {
  healthIsNew: boolean;
  onClose: () => void;
}

/**
 * The phone's explorer: a modal dialog over the page. Focus is trapped
 * inside while it is open; Escape, the close button and a tap on the
 * backdrop close it, and focus then goes back to the menu button.
 */
export function ExplorerDrawer({
  healthIsNew,
  onClose,
}: ExplorerDrawerProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  return (
    <div class="drawer">
      <div class="drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        class="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Your notes"
        tabIndex={-1}
      >
        <Explorer
          variant="drawer"
          healthIsNew={healthIsNew}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
