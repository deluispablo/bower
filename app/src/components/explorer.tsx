/**
 * The explorer (spec §6.2, §6.12; #589): the user's folders as a tree, with
 * the search field, Pinned, the Health row and the hidden-files footer. One
 * component, two homes:
 *
 * - `variant="sidebar"`: the desktop column (`layout.tsx` wraps it in a
 *   `<nav aria-label="Your notes">` landmark, always open). Search with its
 *   `Ctrl K` hint, the primary links passed as `nav` (Home, Add, Bower), the
 *   Just filed slot, Pinned (a pinned folder with what is new in it), "Your
 *   folders" with the short meaning lines, and the account. Its own
 *   Expand/Collapse all tool sits on the "Your folders" heading.
 * - `variant="page"`: the Notes tab (`routes/notes.tsx`). No title row of
 *   its own (the top bar carries "Notes"), no account row, no sort; search,
 *   the Just filed slot, Pinned (a pinned folder with its count), "Your
 *   folders" with the full meaning lines, then the Health row and the
 *   hidden-files line together. Its Expand/Collapse all is one header-bar
 *   button the route itself owns (`useExpandToggle`), since the actions slot
 *   lives in the shell, outside this component.
 *
 * On a device's very first load the five landmarks render at once as
 * skeletons with a status line (R-NOTES-7); once the index has been cached
 * the tree paints from the cache and never shows them again.
 *
 * The search row opens the quick switcher (#142) in both variants; closing
 * the switcher leaves the person where they were. The hidden-files footer
 * button toggles the `showAppFiles` preference (spec §5.3), the same one
 * Settings › Advanced has its own switch for.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loadTreeState } from '../cache.js';
import { getPref, setPref } from '../prefs.js';
import {
  lastTarget,
  rememberTarget,
  targetFromReveal,
  targetFromRoute,
} from '../reveal.js';
import type { ParaKind } from '../navigation.js';
import {
  checkWhen,
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
} from './icons.js';
import { FolderMark } from './folder-mark.js';
import { JustFiledRow } from './just-filed-row.js';
import { PinnedSidebar } from './pinned-sidebar.js';
import { openSendToBower } from './send-to-bower.js';
import { Tree } from './tree.js';

import '../styles/explorer.css';

export const HEALTH_PATH = '/health';

/** The `?reveal=` value "Show in folders" (#608, `revealHref`) put on `/notes`. */
function revealParam(): string | undefined {
  return new URLSearchParams(window.location.search).get('reveal') ?? undefined;
}

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
   * Page variant only: the Notes route's own header-bar Expand/Collapse all
   * toggle (`useExpandToggle`) drives the tree from outside. Left out (0)
   * for the sidebar, which keeps its own inline tool instead.
   */
  collapseKey?: number;
  expandKey?: number;
  /** The "Just filed · N" row (#616) goes here; left out, the slot stays empty. */
  justFiled?: ComponentChildren;
}

/** The Expand/Collapse all button's labels (`notes.expand`, `notes.collapse`). */
export const EXPAND_LABEL = 'Expand all folders';
export const COLLAPSE_LABEL = 'Collapse all folders';

export interface ExpandToggle {
  /** Whether the next press collapses (some folder is open, as far as known). */
  expanded: boolean;
  collapseKey: number;
  expandKey: number;
  toggle: () => void;
  /** The tree says whether any folder is open, e.g. after a reveal opened
   * some: keeps the label exact ("Collapse all" only when one is open). */
  syncOpen: (anyOpen: boolean) => void;
}

/**
 * The one Expand/Collapse all toggle (R-NOTES-2), for the Notes route's bar
 * and the sidebar's tool. It tracks its own last action, not the tree's real
 * state (a folder opened by hand does not flip it back), but starts from the
 * remembered expansion: any open folder on this device means the first press
 * collapses.
 */
export function useExpandToggle(): ExpandToggle {
  const [collapseKey, setCollapseKey] = useState(0);
  const [expandKey, setExpandKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadTreeState()
      .then((state) => {
        if (!cancelled && state !== undefined && state.expanded.length > 0) {
          setExpanded(true);
        }
      })
      .catch((err: unknown) => {
        console.error('Could not read the tree state', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    expanded,
    collapseKey,
    expandKey,
    syncOpen: setExpanded,
    toggle: () => {
      if (expanded) setCollapseKey((key) => key + 1);
      else setExpandKey((key) => key + 1);
      setExpanded((was) => !was);
    },
  };
}

const LANDMARKS: readonly { kind: ParaKind; name: string }[] = [
  { kind: 'inbox', name: 'Inbox' },
  { kind: 'projects', name: 'Projects' },
  { kind: 'areas', name: 'Areas' },
  { kind: 'resources', name: 'Resources' },
  { kind: 'archives', name: 'Archives' },
];

/** The five landmarks before the index exists: marks and names, skeleton lines. */
function LandmarkSkeleton({ markSize }: { markSize: 18 | 28 }): JSX.Element {
  return (
    <ul class="explorer-skeleton" aria-hidden="true">
      {LANDMARKS.map(({ kind, name }) => (
        <li key={kind} class="explorer-skeleton-row">
          <span class="explorer-skeleton-chevron" />
          <FolderMark kind={kind} size={markSize} />
          <span class="explorer-skeleton-text">
            <span class="tree-name">{name}</span>
            {markSize === 28 && (
              <span class="explorer-skeleton-bar explorer-skeleton-line" />
            )}
          </span>
          <span class="explorer-skeleton-bar explorer-skeleton-count" />
        </li>
      ))}
    </ul>
  );
}

interface ToolsProps {
  /** Whether the tree is, as far as the toggle knows, fully expanded: the
   * button's own label and next action (one toggle, not two one-way buttons). */
  expanded: boolean;
  onToggleExpand: () => void;
}

function Tools({ expanded, onToggleExpand }: ToolsProps): JSX.Element {
  const expandLabel = expanded ? COLLAPSE_LABEL : EXPAND_LABEL;
  return (
    <div class="explorer-tools">
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

/** The pin menu's "Ask Bower about this": the send-to-Bower sheet. */
function askAbout(name: string): void {
  openSendToBower({
    mode: 'ask',
    about: name,
    buildText: (value) => `About ${name}: ${value}`,
  });
}

export function Explorer({
  variant,
  healthIsNew,
  nav,
  collapseKey: pageCollapseKey = 0,
  expandKey: pageExpandKey = 0,
  justFiled,
}: ExplorerProps): JSX.Element {
  const { me, signOut } = useSession();
  const { index, status } = useVault();
  const { path } = useLocation();
  // Reveal (#591): the desktop sidebar follows the route and keeps the last
  // target; the Notes tab, opened later, reveals that one (or the one a
  // "Show in folders" link names).
  const routeTarget =
    variant === 'sidebar' ? targetFromRoute(path, index) : null;
  const target =
    variant === 'sidebar'
      ? routeTarget
      : (targetFromReveal(revealParam(), index) ?? lastTarget());
  useEffect(() => {
    rememberTarget(routeTarget);
  }, [routeTarget?.kind, routeTarget?.path]);
  // The order is the saved preference; no control on this screen changes it.
  const sort = getPref('explorerSort');
  // Sidebar only: its own inline tool (page's Expand/Collapse all lives in
  // the header bar instead, driven by the `collapseKey`/`expandKey` props).
  const sidebarToggle = useExpandToggle();
  const [showAppFiles, setShowAppFiles] = useState(() =>
    getPref('showAppFiles'),
  );
  const findings = useHealthFindings(variant !== 'sidebar');
  // Same calendar day (#447's `reportDayStart`) the Home card and the
  // Health screen's own bubble read, so the three never disagree (#496).
  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const healthWhen =
    reportTime === undefined ? 'Sunday' : checkWhen(reportTime, Date.now());

  function toggleAppFiles(): void {
    const next = !showAppFiles;
    setPref('showAppFiles', next);
    setShowAppFiles(next);
  }

  const tools = (
    <Tools
      expanded={sidebarToggle.expanded}
      onToggleExpand={sidebarToggle.toggle}
    />
  );

  // R-NOTES-7: no index yet and the first listing still on its way.
  const firstLoad = index === null && status === 'loading';

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
              {healthRowSubtitle(findings, healthWhen)}
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
      <button
        type="button"
        class="explorer-filter"
        onClick={() => {
          openSwitcher();
        }}
      >
        <IconSearch />
        {variant === 'sidebar' ? (
          <>
            <span class="explorer-filter-label">Search</span>
            <span class="explorer-filter-kbd" aria-hidden="true">
              Ctrl K
            </span>
          </>
        ) : (
          <span class="explorer-filter-label">
            Search folders, notes and files
          </span>
        )}
      </button>
      {variant === 'sidebar' && (
        <div class="explorer-rows">
          {nav}
          {healthRow}
        </div>
      )}
      <div class="explorer-just-filed" data-slot="just-filed">
        {justFiled ?? <JustFiledRow variant={variant} />}
      </div>
      {index !== null && (
        <PinnedSidebar items={pinned(index)} variant={variant} />
      )}
      <div class="explorer-section">
        <h2 class="explorer-label">Your folders</h2>
        {variant === 'sidebar' && tools}
      </div>
      {firstLoad && variant === 'page' && (
        <p class="explorer-first-load" role="status">
          Reading your Bower folder for the first time on this phone. Next time
          it opens at once.
        </p>
      )}
      <div class="explorer-tree">
        {firstLoad && (
          <LandmarkSkeleton markSize={variant === 'sidebar' ? 18 : 28} />
        )}
        {index !== null && (
          <Tree
            index={index}
            onAsk={askAbout}
            sort={sort}
            collapseKey={
              variant === 'sidebar'
                ? sidebarToggle.collapseKey
                : pageCollapseKey
            }
            expandKey={
              variant === 'sidebar' ? sidebarToggle.expandKey : pageExpandKey
            }
            showAppFiles={showAppFiles}
            rootMeanings={variant !== 'sidebar'}
            revealPath={target?.path}
            currentId={target?.id}
            onOpenChange={
              variant === 'sidebar' ? sidebarToggle.syncOpen : undefined
            }
            topOnTabTap={variant === 'page'}
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
