/**
 * The explorer (#909, spec §3.3, §3.14, K-1): one Tree in three hosts.
 *
 * - `variant="sidebar"`: the desktop column (`layout.tsx` wraps it in a
 *   `<nav aria-label="Your notes">` landmark). Wordmark, search trigger with
 *   its `Ctrl K` hint, the nav passed as `nav` (#906), PINNED, YOUR FOLDERS
 *   with its three tools, the tree (28 px rows), Answers, Clippings. Health
 *   check is a nav item there (#906), not a row here.
 * - `variant="drawer"`: the phone drawer (`FoldersDrawer`, below). Search
 *   trigger, PINNED, YOUR FOLDERS + tools, the tree (40 px rows), Answers,
 *   Clippings, Health check.
 * - `variant="page"`: the Folders tab (`routes/notes.tsx`): the drawer's
 *   contents at full width with the "Just filed · n" card above Pinned.
 *
 * The three tools on the YOUR FOLDERS row: "Show the open item"
 * (`revealInFolders`), "Sort" (Name / Newest first, the `explorerSort`
 * preference) and "Collapse all folders". No counts, badges or hidden-files
 * footer anywhere: "Bower's own files" is a preference (Folders ⋯, Settings)
 * that adds a group at the bottom of the tree.
 *
 * The search trigger is a slot (`ExplorerSearchSlot`) that #910 fills with
 * the shared search field; until then it is today's trigger, which opens
 * the quick switcher.
 *
 * The sidebar explorer also hosts the phone drawer (portalled to the body,
 * so it lives outside the page `layout.tsx` owns) and the left-edge swipe
 * that pulls it out, on every phone screen but the Folders tab.
 */

import type { ComponentChildren, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import {
  closeFoldersDrawer,
  dragFoldersDrawer,
  openFoldersDrawer,
  useFoldersDrawer,
} from '../folders-drawer.js';
import { findReport, summarise } from '../health-report.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { displayName, folderHref, folderOf } from '../navigation.js';
import { hubNotePath } from '../folder-statuses.js';
import {
  close as closeOverlay,
  open as openOverlay,
  OVERLAY_PRIORITY,
} from '../overlay-queue.js';
import { getPref, setPref, subscribePref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import {
  lastTarget,
  previewed,
  rememberTarget,
  revealInFolders,
  revealRequest,
  subscribePreviewed,
  subscribeReveal,
  targetFromReveal,
  targetFromRoute,
} from '../reveal.js';
import type { RevealTarget } from '../reveal.js';
import { useEdgeSwipe } from '../use-edge-swipe.js';
import { useMediaQuery } from '../use-media-query.js';
import { pinned, useVault } from '../vault-store.js';
import type { PinnedItem } from '../vault-store.js';
import type { VaultIndex } from '../vault-index.js';
import { FileIcon } from './file-icon.js';
import {
  IconClose,
  IconCollapse,
  IconHeart,
  IconLocate,
  IconSort,
} from './icons.js';
import { JustFiledRow } from './just-filed-row.js';
import { Overlay, useBackCloses } from './overlay.js';
import { PinnedSidebar } from './pinned-sidebar.js';
import { SearchField } from './search-field.js';
import { openAsk } from './send-to-bower.js';
import { BELOW_TREE_NAMES, Tree } from './tree.js';
import type { TreeAskSubject, TreeHost } from './tree.js';

import '../styles/explorer.css';

export const HEALTH_PATH = '/health';

/** The Folders tab's route (the label is "Folders"; the route stays). */
export const FOLDERS_PATH = '/notes';

/** The window width from which the desktop sidebar shows. */
export const DESKTOP_QUERY = '(min-width: 900px)';

/** The tools' names (one name per tool, A-4). */
export const SHOW_OPEN_LABEL = 'Show the open item';
export const SORT_LABEL = 'Sort your folders';
export const COLLAPSE_LABEL = 'Collapse all folders';

/** The drawer's width, px (max 88 vw in CSS). */
export const DRAWER_WIDTH = 324;

/**
 * The pinned rows as the explorer lists them: a pinned hub note (X/X.md)
 * stands for its folder, so it shows the folder outline in its root's
 * colour (#920 DA-9, DB-5). A folder already pinned is listed once.
 */
export function pinnedRows(items: readonly PinnedItem[]): PinnedItem[] {
  const folders = new Set(
    items.flatMap((item) => (item.kind === 'folder' ? [item.path] : [])),
  );
  const out: PinnedItem[] = [];
  for (const item of items) {
    if (item.kind !== 'note') {
      out.push(item);
      continue;
    }
    const folder = folderOf(item.file.path);
    if (folder === '' || item.file.path !== hubNotePath(folder)) {
      out.push(item);
      continue;
    }
    if (folders.has(folder)) continue;
    folders.add(folder);
    out.push({
      kind: 'folder',
      path: folder,
      file: item.file,
      pinnedAt: item.pinnedAt,
    });
  }
  return out;
}

/** The `?reveal=` value "Show in folders" (#608, `revealHref`) put on `/notes`. */
function revealParam(): string | undefined {
  return new URLSearchParams(window.location.search).get('reveal') ?? undefined;
}

/**
 * The findings count of the latest report (Home's Health card reads it):
 * reads only the report's frontmatter. `undefined` while loading, offline or
 * before a first report; `enabled: false` never fetches.
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
      .catch((err: unknown) => {
        // Offline, or an unreadable report: no count rather than a guess.
        console.warn('Could not read the health report', err);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, file, getNoteText]);

  return findings;
}

// "Show Bower's own files" (the `showAppFiles` preference): the Folders ⋯
// or Settings flips it, every explorer on screen follows (`subscribePref`).

/** Shows or hides Bower's own files in every explorer. */
export function setShowAppFiles(on: boolean): void {
  setPref('showAppFiles', on);
}

/** The `showAppFiles` preference, following every `setPref` of it. */
export function useShowAppFiles(): boolean {
  const [on, setOn] = useState(() => getPref('showAppFiles'));
  // `setPref` signals every change (Settings writes it directly), and the
  // storage event brings another tab's (#920 T-14).
  useEffect(
    () =>
      subscribePref('showAppFiles', () => {
        setOn(getPref('showAppFiles'));
      }),
    [],
  );
  return on;
}

/** The pin menu's "Ask Bower about this": the Ask sheet about that row,
 * a folder or a note or file, with its own icon (#910). */
function askAbout(subject: TreeAskSubject): void {
  openAsk({ name: subject.name, kind: subject.kind, icon: subject.icon });
}

/**
 * The search trigger (#910): the shared search field. The sidebar draws the
 * desktop size with the Ctrl K hint; the drawer closes before Search opens.
 */
export function ExplorerSearchSlot({ host }: { host: TreeHost }): JSX.Element {
  return (
    <div class="explorer-search-slot" data-slot="explorer-search">
      <SearchField
        variant="trigger"
        size={host === 'sidebar' ? 'desktop' : 'phone'}
        shortcut={host === 'sidebar'}
        {...(host === 'drawer' && { onOpen: closeFoldersDrawer })}
      />
    </div>
  );
}

const SORT_MENU_ID = 'explorer-sort';

const SORT_CHOICES: readonly { value: ExplorerSortPref; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Newest first' },
];

function SortMenu({
  current,
  onPick,
  onClose,
}: {
  current: ExplorerSortPref;
  onPick: (value: ExplorerSortPref) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <Overlay kind="menu" label="Sort your folders" onClose={onClose}>
      <div
        class="explorer-sort-menu"
        role="menu"
        aria-label="Sort your folders"
      >
        {SORT_CHOICES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            class="explorer-sort-item"
            aria-checked={current === value}
            onClick={() => {
              onPick(value);
              onClose();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </Overlay>
  );
}

interface ToolsProps {
  canShowOpen: boolean;
  onShowOpen: () => void;
  onSort: () => void;
  onCollapse: () => void;
}

function Tools({
  canShowOpen,
  onShowOpen,
  onSort,
  onCollapse,
}: ToolsProps): JSX.Element {
  return (
    <div class="explorer-tools">
      <button
        type="button"
        class="explorer-tool"
        aria-label={SHOW_OPEN_LABEL}
        title={SHOW_OPEN_LABEL}
        aria-disabled={!canShowOpen || undefined}
        onClick={() => {
          if (canShowOpen) onShowOpen();
        }}
      >
        <IconLocate />
      </button>
      <button
        type="button"
        class="explorer-tool"
        aria-label={SORT_LABEL}
        title={SORT_LABEL}
        aria-haspopup="menu"
        onClick={onSort}
      >
        <IconSort />
      </button>
      <button
        type="button"
        class="explorer-tool"
        aria-label={COLLAPSE_LABEL}
        title={COLLAPSE_LABEL}
        onClick={onCollapse}
      >
        <IconCollapse />
      </button>
    </div>
  );
}

/** Six 12 px bars while the first listing is on its way (R-EXP-10). */
function TreeSkeleton(): JSX.Element {
  return (
    <ul class="explorer-skeleton" aria-hidden="true">
      {[72, 58, 80, 50, 66, 44].map((width) => (
        <li key={width} class="explorer-skeleton-row">
          <span class="explorer-skeleton-bar" style={{ width: `${width}%` }} />
        </li>
      ))}
    </ul>
  );
}

export interface ExplorerProps {
  variant: TreeHost;
  /** Primary links, under the search field (desktop sidebar, #906). */
  nav?: ComponentChildren;
  /** The "Just filed · N" card (Folders tab); left out, today's row. */
  justFiled?: ComponentChildren;
  /** Called when a row is chosen (the drawer closes). */
  onNavigate?: () => void;
}

/** The current open item: the route on desktop, else the last one kept. */
function useTarget(
  variant: TreeHost,
  index: VaultIndex | null,
): RevealTarget | null {
  const { path } = useLocation();
  const routeTarget = targetFromRoute(path, index);
  useEffect(() => {
    rememberTarget(routeTarget);
  }, [routeTarget?.kind, routeTarget?.path]);
  if (variant === 'sidebar') return routeTarget;
  if (variant === 'page') {
    return targetFromReveal(revealParam(), index) ?? lastTarget();
  }
  // Add's open item is the inbox: the drawer opens on it (#920 DB-4).
  if (path === '/add') {
    const inbox = index?.folders.find(
      (file) => !file.path.includes('/') && displayName(file.name) === 'Inbox',
    );
    if (inbox !== undefined) return { kind: 'folder', path: inbox.path };
  }
  return routeTarget ?? lastTarget();
}

/** The folder page's previewed row (`setPreviewed`), kept current. */
function usePreviewed(): ReturnType<typeof previewed> {
  const [item, setItem] = useState(previewed);
  useEffect(() => subscribePreviewed(() => setItem(previewed())), []);
  return item;
}

/** The `revealInFolders` request, re-read whenever a new one comes. */
function useRevealRequest(): ReturnType<typeof revealRequest> {
  const [request, setRequest] = useState(revealRequest);
  useEffect(() => subscribeReveal(() => setRequest(revealRequest())), []);
  return request;
}

export function Explorer({
  variant,
  nav,
  justFiled,
  onNavigate,
}: ExplorerProps): JSX.Element {
  const { index, status, refresh } = useVault();
  const { path } = useLocation();
  const target = useTarget(variant, index);
  const request = useRevealRequest();
  const previewedItem = usePreviewed();
  // A `revealInFolders` request made on this screen wins over the route
  // until the person goes somewhere else.
  const fresh = request !== null && request.at === path ? request : null;
  const revealPath = fresh?.path ?? target?.path;
  const currentId = fresh === null ? target?.id : fresh.id;
  const [sort, setSort] = useState<ExplorerSortPref>(() =>
    getPref('explorerSort'),
  );
  const [collapseKey, setCollapseKey] = useState(0);
  const showAppFiles = useShowAppFiles();
  // The phone hosts' Health check row says when there is no report yet.
  const healthFindings = useHealthFindings(variant !== 'sidebar');

  // R-NOTES-7: no index yet and the first listing still on its way.
  const firstLoad = index === null && status === 'loading';
  const failed = index === null && status === 'error';

  function openSort(): void {
    openOverlay({
      id: SORT_MENU_ID,
      priority: OVERLAY_PRIORITY.own,
      render: () => (
        <SortMenu
          current={getPref('explorerSort')}
          onPick={(value) => {
            setPref('explorerSort', value);
            setSort(value);
          }}
          onClose={() => closeOverlay(SORT_MENU_ID)}
        />
      ),
    });
  }

  const current = target;
  const below =
    index === null
      ? []
      : BELOW_TREE_NAMES.flatMap((name) => {
          const folder = index.folders.find(
            (file) =>
              !file.path.includes('/') && displayName(file.name) === name,
          );
          return folder === undefined ? [] : [{ name, path: folder.path }];
        });

  return (
    <div class={`explorer explorer-${variant}`}>
      {variant === 'sidebar' && (
        <a href="/" class="brand explorer-brand" aria-label="Bower home">
          <span class="brand-word">Bower</span>
        </a>
      )}
      <ExplorerSearchSlot host={variant} />
      {variant === 'sidebar' && nav !== undefined && (
        <div class="explorer-rows">{nav}</div>
      )}
      {variant === 'page' && (
        <div class="explorer-just-filed" data-slot="just-filed">
          {justFiled ?? <JustFiledRow variant="page" />}
        </div>
      )}
      {index !== null && (
        <PinnedSidebar
          items={pinnedRows(pinned(index))}
          variant={variant}
          onNavigate={onNavigate}
        />
      )}
      <div
        class="explorer-section explorer-section-tools"
        data-tour={variant === 'sidebar' ? 'notes' : undefined}
      >
        <h2 class="explorer-label">Your folders</h2>
        <Tools
          canShowOpen={current !== null}
          onShowOpen={() => {
            if (current !== null) revealInFolders(current.path, current.id);
          }}
          onSort={openSort}
          onCollapse={() => setCollapseKey((key) => key + 1)}
        />
      </div>
      <div class="explorer-tree">
        {firstLoad && <TreeSkeleton />}
        {failed && (
          <p class="explorer-error" role="alert">
            Could not load your folders.{' '}
            <button
              type="button"
              class="explorer-retry"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </p>
        )}
        {index !== null && (
          <Tree
            index={index}
            host={variant}
            onAsk={askAbout}
            onNavigate={onNavigate}
            sort={sort}
            collapseKey={collapseKey}
            showAppFiles={showAppFiles}
            revealPath={revealPath}
            currentId={currentId}
            previewed={previewedItem}
            revealSeq={fresh?.seq ?? 0}
            topOnTabTap={variant === 'page'}
          />
        )}
      </div>
      {(below.length > 0 || variant !== 'sidebar') && (
        <div class={`explorer-below explorer-host-rows-${variant}`}>
          {below.map(({ name, path: folderPath }) => (
            <a
              key={folderPath}
              href={folderHref(folderPath)}
              class="explorer-item"
              aria-current={
                path === folderHref(folderPath) ? 'page' : undefined
              }
              onClick={() => onNavigate?.()}
            >
              <span class="explorer-item-spacer" aria-hidden="true" />
              <FileIcon
                item={{
                  name,
                  mimeType: 'application/vnd.google-apps.folder',
                  path: folderPath,
                }}
                size={16}
              />
              <span class="explorer-item-label">{name}</span>
            </a>
          ))}
          {variant !== 'sidebar' && (
            <a
              href={HEALTH_PATH}
              class="explorer-item explorer-health"
              aria-current={path === HEALTH_PATH ? 'page' : undefined}
              onClick={() => onNavigate?.()}
            >
              <span class="explorer-item-spacer" aria-hidden="true" />
              <IconHeart />
              <span class="explorer-item-label">Health check</span>
              {healthFindings === undefined && (
                <span class="explorer-item-meta">Not checked yet</span>
              )}
            </a>
          )}
        </div>
      )}
      {variant === 'sidebar' && <FoldersDrawerHost />}
    </div>
  );
}

/**
 * The phone drawer "Your folders" (spec §3.14, R-EXP-8): 324 px (at most
 * 88 vw), over any screen but the Folders tab. Opens by the files button
 * (`openFoldersDrawer`) or a left-edge swipe, following the finger; closes
 * by ✕, a swipe left, the scrim, Esc, or choosing an item.
 */
export function FoldersDrawer(): JSX.Element | null {
  const { open, drag } = useFoldersDrawer();
  const { path } = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [closingDrag, setClosingDrag] = useState<number | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);

  useEdgeSwipe({
    enabled: !open && path !== FOLDERS_PATH,
    onDrag: (px) => dragFoldersDrawer(Math.min(px, DRAWER_WIDTH)),
    onOpen: openFoldersDrawer,
    onCancel: () => dragFoldersDrawer(null),
  });

  // Back closes it and stays on the page (#920 T-3).
  useBackCloses(closeFoldersDrawer, open);

  // Any route change (choosing an item) closes it.
  useEffect(() => {
    closeFoldersDrawer();
  }, [path]);

  // Focus moves in on open and back to the opener on close; Esc closes;
  // Tab stays inside while it is open.
  // Before any row inside takes focus (a reveal focuses its row).
  const openedAt = useRef(path);
  const pathRef = useRef(path);
  pathRef.current = path;
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    openedAt.current = path;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A reveal may have focused its row inside already.
    if (!(panel.current?.contains(document.activeElement) ?? false)) {
      panel.current?.focus();
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFoldersDrawer();
        return;
      }
      if (event.key !== 'Tab' || panel.current === null) return;
      const items = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex="0"]',
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Choosing an item leaves focus to the new page's heading (#920
      // T-21, `focusNewPage`); any other close hands it back.
      if (pathRef.current === openedAt.current) opener.current?.focus();
    };
  }, [open]);

  const swipeOn = !open && path !== FOLDERS_PATH;
  // A 16 px strip on the left edge with `touch-action: none`: without it a
  // real browser claims the horizontal move for itself and cancels the
  // pointer, so the swipe never reaches `useEdgeSwipe`.
  const edge = swipeOn ? (
    <div class="folders-edge" aria-hidden="true" data-edge-swipe="" />
  ) : null;

  if (!open && drag === null) {
    return edge === null ? null : createPortal(edge, document.body);
  }

  // Pulled out by a finger (opening), or pushed back (closing).
  const shown = open
    ? DRAWER_WIDTH + Math.min(0, closingDrag ?? 0)
    : (drag ?? 0);
  const following = (!open && drag !== null) || closingDrag !== null;
  const style = following
    ? {
        transform: `translateX(${String(shown - DRAWER_WIDTH)}px)`,
        transition: 'none',
      }
    : undefined;

  function onPointerDown(
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ): void {
    if (event.pointerType === 'mouse') return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerMove(
    event: JSX.TargetedPointerEvent<HTMLDivElement>,
  ): void {
    const start = swipe.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (closingDrag === null && Math.abs(dy) > Math.abs(dx)) {
      swipe.current = null;
      return;
    }
    if (dx < -6) setClosingDrag(dx);
  }

  function onPointerEnd(): void {
    const dx = closingDrag;
    swipe.current = null;
    setClosingDrag(null);
    if (dx !== null && dx <= -24) closeFoldersDrawer();
  }

  return createPortal(
    <div class="folders-drawer-layer">
      <div
        class="folders-drawer-scrim"
        aria-hidden="true"
        style={
          following ? { opacity: String(shown / DRAWER_WIDTH) } : undefined
        }
        onClick={closeFoldersDrawer}
      />
      <div
        ref={panel}
        class="folders-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Your folders"
        tabIndex={-1}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div class="folders-drawer-head">
          <h2 class="folders-drawer-title">Your folders</h2>
          <button
            type="button"
            class="icon-button folders-drawer-close"
            aria-label="Close your folders"
            onClick={closeFoldersDrawer}
          >
            <IconClose />
          </button>
        </div>
        <Explorer variant="drawer" onNavigate={closeFoldersDrawer} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Mounts the drawer on the phone. The sidebar explorer renders it, since
 * that is the one explorer every signed-in screen has.
 */
export function FoldersDrawerHost(): JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return desktop ? null : <FoldersDrawer />;
}
