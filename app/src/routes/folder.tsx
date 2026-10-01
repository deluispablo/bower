/**
 * Folder screen (issue #911, spec §4.8–4.11): `/folder/:path*`, one screen
 * for every folder, drawn four ways on the boards: a project folder
 * (PF-Main), a folder list and grid (LI-Main, GR-Main) and a folder of
 * folders (AR-Main, AR-Sub).
 *
 * The PageHeader (#906) carries the title once with ⋯ beside it (the
 * folder's or a root's menu, #907), the meta line "Projects · 7 things ·
 * updated today" (K-31: the sum of the segments) and, for a folder of
 * folders, its purpose line. Under it the tabs "List" | "Compare <n>
 * <things>" when the folder has comparable items (R-TABS-1); the Compare
 * panel is `CompareSlot`, filled by #916. The body (`folder-items.tsx`)
 * is loaded on demand.
 *
 * Back on the phone goes to the parent folder, or for a root to "‹ Your
 * folders" (K-5); the desktop breadcrumb lists the parents, or for a root
 * reads "Your folders" and reveals it in the tree (E-17). From 1200 px the
 * shell's right-hand column is the preview (§3.37), except while Compare
 * shows.
 */

import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';

import { BackLink } from '../components/back-link.js';
import { NoteMenu } from '../components/note-menu.js';
import { PageHeader, crumbsFor } from '../components/page-header.js';
import { QuickLookPane } from '../components/quick-look.js';
import type { PaneItem } from '../components/quick-look.js';
import { openAsk } from '../components/send-to-bower.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useCatalogueOrigins } from '../components/use-catalogue-origins.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { useFolderSummary } from '../components/folder-summary.js';
import { compareKinds, notesOfKind } from '../compare.js';
import type { CompareNote } from '../compare.js';
import { FOLDER_MIME } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH } from '../file-origin.js';
import { folderMeaning, rootFolderHeading } from '../folder-meanings.js';
import { folderHelpTopic, useHelpTopic } from '../help-rows.js';
import { metaLine } from '../meta-line.js';
import {
  breadcrumb,
  displayName,
  folderContents,
  folderHref,
  paraKindOf,
} from '../navigation.js';
import type { FolderContents } from '../navigation.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { pendingByPath } from '../rename-request.js';
import { revealHref, setPreviewed } from '../reveal.js';
import { FOLDERS_LANDMARK } from '../shell-routes.js';
import { useMediaQuery } from '../use-media-query.js';
import { useRequestRows } from '../use-request-rows.js';
import { useTitle } from '../use-title.js';
import { Skeleton } from '../components/system-state.js';
import { useVault } from '../vault-store.js';
import { NotFound } from './not-found.js';
import '../styles/folder.css';

/** From here the folder has the preview column (#614, §3.37). */
export const PANES_QUERY = '(min-width: 1200px)';

type ItemsModule = typeof import('../components/folder-items.js');

// Loaded when a folder is first shown, so the list (filters, pairing, rows)
// stays out of the startup chunk (#41's budget).
let itemsModule: ItemsModule | null = null;

function useFolderItems(): ItemsModule | null {
  const [loaded, setLoaded] = useState<ItemsModule | null>(itemsModule);
  useEffect(() => {
    import('../components/folder-items.js').then(
      (mod) => setLoaded((itemsModule = mod)),
      (err: unknown) => console.error(err),
    );
  }, []);
  return loaded;
}

interface FolderCompare {
  notes: CompareNote[];
  /** "Compare 6 flats": the tab's words. */
  label: string;
}

/** The board says "flats" for rental listings, where the spec's
 * `kind.plural` says "rental listings" (the board wins). */
const TAB_NOUN: Readonly<Record<string, string>> = {
  'rental-listing': 'flats',
};

/** The Compare tab (R-TABS-1): the folder's notes that name a kind, once at
 * least two of one comparable kind are there. */
function useFolderCompare(notes: readonly DriveFile[]): FolderCompare | null {
  const [found, setFound] = useState<FolderCompare | null>(null);
  const key = notes
    .map((note) => `${note.id}:${note.modifiedTime ?? ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (notes.length < 2) {
          if (!cancelled) setFound(null);
          return;
        }
        const module = await import('../components/compare.js');
        const loaded = await module.loadCompareNotes(notes);
        if (cancelled) return;
        const kind = compareKinds(loaded)[0];
        if (kind === undefined) {
          setFound(null);
          return;
        }
        const count = notesOfKind(loaded, kind).length;
        setFound({
          notes: loaded,
          label: `Compare ${count} ${TAB_NOUN[kind.id] ?? kind.plural}`,
        });
      } catch (err) {
        console.error('Could not read the notes for Compare', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return found;
}

/** What the Compare panel receives (frozen for #916, which fills it). */
export interface CompareSlotProps {
  /** The folder's notes with their properties (`loadCompareNotes`). */
  notes: readonly CompareNote[];
  folderPath: string;
  /** The tab's words, "Compare 6 flats", naming the panel. */
  label: string;
  /** The id of the tab that labels this panel. */
  tabId: string;
}

type CompareModule = typeof import('../components/compare.js');

/** The Compare tab's panel: the cards or the table (#916), loaded with the
 * notes' properties by `useFolderCompare`. */
export function CompareSlot({
  notes,
  folderPath,
  label,
  tabId,
}: CompareSlotProps): JSX.Element {
  const [module, setModule] = useState<CompareModule | null>(null);
  useEffect(() => {
    let live = true;
    import('../components/compare.js').then(
      (loaded) => {
        if (live) setModule(loaded);
      },
      (err: unknown) => {
        console.error('Could not load Compare', err);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <div
      class="compare-slot"
      role="tabpanel"
      id="folder-panel-compare"
      aria-labelledby={tabId}
      data-label={label}
    >
      {module !== null && (
        <module.CompareView notes={notes} folderPath={folderPath} />
      )}
    </div>
  );
}

interface FolderTabsProps {
  label: string;
  comparing: boolean;
  onChange: (comparing: boolean) => void;
}

/** "List" | "Compare <n> <things>" (§3.24): only on a folder with a
 * comparison; switching never moves the header above. ARIA tabs: the arrow
 * keys, Home and End move between them and select (T-15). */
function FolderTabs({
  label,
  comparing,
  onChange,
}: FolderTabsProps): JSX.Element {
  const onKeyDown = (event: KeyboardEvent): void => {
    let next: boolean | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      next = !comparing;
    } else if (event.key === 'Home') {
      next = false;
    } else if (event.key === 'End') {
      next = true;
    }
    if (next === undefined) return;
    event.preventDefault();
    if (next !== comparing) onChange(next);
    document
      .getElementById(next ? 'folder-tab-compare' : 'folder-tab-list')
      ?.focus();
  };
  return (
    <div
      class="folder-tabs"
      role="tablist"
      aria-label="Folder views"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        role="tab"
        id="folder-tab-list"
        class="folder-tab"
        aria-selected={!comparing}
        aria-controls="folder-panel-list"
        tabIndex={comparing ? -1 : 0}
        onClick={() => onChange(false)}
      >
        List
      </button>
      <button
        type="button"
        role="tab"
        id="folder-tab-compare"
        class="folder-tab"
        aria-selected={comparing}
        aria-controls="folder-panel-compare"
        tabIndex={comparing ? 0 : -1}
        onClick={() => onChange(true)}
      >
        {label}
      </button>
    </div>
  );
}

/** A root folder's phone Back: "‹ Your folders", which opens the Folders
 * tab with this root revealed (K-5, E-17). */
function RootBackLink({ path }: { path: string }): JSX.Element {
  return (
    <BackLink
      href={revealHref({ kind: 'folder', path })}
      label={FOLDERS_LANDMARK}
      name="Back to your folders"
      named
    />
  );
}

interface FolderBodyProps {
  contents: FolderContents;
  root: boolean;
  file: DriveFile | undefined;
  pinned: boolean;
  onTogglePin: () => void;
  desktop: boolean;
  onPreview: (item: PaneItem | null) => void;
  /** The Compare tab is chosen: kept in the URL (`?view=compare`), so Back
   * from a crumb returns to Compare as it was left (T-16). */
  comparing: boolean;
  onComparing: (comparing: boolean) => void;
  upHref: string | undefined;
  onNavigate: (href: string) => void;
}

function FolderBody({
  contents,
  root,
  file,
  pinned,
  onTogglePin,
  desktop,
  onPreview,
  comparing,
  onComparing,
  upHref,
  onNavigate,
}: FolderBodyProps): JSX.Element {
  const now = Date.now();
  const titles = useNoteTitles(contents.notes);
  const { index, getNoteText } = useVault();
  const catalogue = useCatalogueOrigins(
    index?.byPath.get(CATALOGUE_PATH),
    getNoteText,
  );
  const items = useFolderItems();
  const requestRows = useRequestRows();
  const waiting = useMemo(() => pendingByPath(requestRows), [requestRows]);
  const compare = useFolderCompare(contents.notes);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [contents.path]);
  const showCompare = comparing && compare !== null;

  const topName = contents.path.split('/')[0] ?? '';
  const para = paraKindOf(topName);
  const title = root ? rootFolderHeading(contents.path) : contents.name;
  const folderOfFolders = root && contents.subfolders.length > 0;
  // The meta's count from the folder's own data (K-31, `folderCount`), the
  // same for List and Compare whichever shows first (#920).
  const summary = useFolderSummary(contents, catalogue, folderOfFolders);
  const meta = metaLine(
    {
      name: contents.name,
      mimeType: FOLDER_MIME,
      root: para,
      rootName: topName,
      count: summary.count,
      countUnit: summary.unit,
      ...(summary.lifecycle !== undefined && {
        lifecycle: summary.lifecycle,
      }),
      ...(summary.updated !== undefined && { updated: summary.updated }),
    },
    { view: 'title', now },
  );
  const ask = (): void =>
    openAsk({
      name: displayName(contents.name),
      kind: 'folder',
      icon: { name: contents.name, mimeType: FOLDER_MIME, path: contents.path },
    });
  const purpose = root ? folderMeaning(contents.path) : undefined;
  useHelpTopic(folderHelpTopic(title, folderOfFolders, compare?.label));

  return (
    <section class="folder-view">
      <PageHeader
        title={title}
        kind="folder"
        {...(root
          ? { rootPath: contents.path }
          : { crumbs: crumbsFor(contents.path) })}
        {...(file !== undefined && {
          more: {
            expanded: menuOpen,
            onClick: () => setMenuOpen((o) => !o),
            name: title,
          },
        })}
        meta={meta}
        {...(purpose !== undefined && { purpose })}
        {...(compare !== null && {
          tabs: (
            <FolderTabs
              label={compare.label}
              comparing={showCompare}
              onChange={onComparing}
            />
          ),
        })}
      />
      {menuOpen && file !== undefined && (
        <NoteMenu
          kind="folder"
          file={file}
          title={contents.name}
          typeLabel="Folder"
          askName={contents.name}
          pinned={pinned}
          onTogglePin={onTogglePin}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {showCompare && compare !== null ? (
        <CompareSlot
          notes={compare.notes}
          folderPath={contents.path}
          label={compare.label}
          tabId="folder-tab-compare"
        />
      ) : (
        <div
          id="folder-panel-list"
          {...(compare !== null && {
            role: 'tabpanel',
            'aria-labelledby': 'folder-tab-list',
          })}
        >
          {items !== null && (
            <items.FolderItems
              contents={contents}
              titles={titles}
              catalogue={catalogue}
              now={now}
              desktop={desktop}
              folderOfFolders={folderOfFolders}
              waiting={waiting}
              onPreview={onPreview}
              onAsk={ask}
              onUp={upHref === undefined ? undefined : () => onNavigate(upHref)}
              onOpen={onNavigate}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function Folder(): JSX.Element {
  const { params } = useRoute();
  const path = params.path ?? '';
  const { index, pinFolder, unpinFolder } = useVault();

  const contents = useMemo(
    () =>
      index === null
        ? null
        : folderContents(index, path, getPref('explorerSort')),
    [index, path],
  );
  useTitle(contents === null ? null : displayName(contents.name));
  const ancestors = useMemo(() => breadcrumb(path), [path]);
  const parent = ancestors[ancestors.length - 1];
  const { route, path: here, query } = useLocation();
  const comparing = query.view === 'compare';
  const wide = useMediaQuery(PANES_QUERY);
  const [preview, setPreview] = useState<PaneItem | null>(null);
  const onPreview = useCallback(
    (item: PaneItem | null) => setPreview(item),
    [],
  );
  // Replaces this page's history entry, so Back after a crumb comes back
  // to the tab as it was left; the sort and columns are kept per folder.
  const onComparing = useCallback(
    (on: boolean) => {
      route(on ? `${here}?view=compare` : here, true);
    },
    [route, here],
  );

  // The phone top bar's Back (K-5): the parent folder, or for a root
  // "‹ Your folders".
  const backContent = useMemo(
    () =>
      parent === undefined ? (
        <RootBackLink path={path} />
      ) : (
        <BackLink href={folderHref(parent.path)} label={parent.name} named />
      ),
    [parent, path],
  );
  useShellSlot('back', backContent);

  // The preview column (§3.37): the shell's right-hand column.
  const asideContent = useMemo(
    () => (wide && !comparing ? <QuickLookPane item={preview} /> : null),
    [wide, preview, comparing],
  );
  useShellSlot('aside', asideContent);

  // The previewed row also wears the selection in the sidebar tree
  // (R-EXP-3/4); only while the preview column is on screen.
  const shown = wide && !comparing ? preview : null;
  const previewedKey =
    shown === null
      ? null
      : shown.type === 'folder'
        ? shown.path
        : shown.file.id;
  useEffect(() => {
    setPreviewed(
      shown === null
        ? null
        : shown.type === 'folder'
          ? { path: shown.path }
          : { id: shown.file.id },
    );
    // Keyed on the row, not the item object, which is rebuilt per render.
  }, [previewedKey]);
  useEffect(() => () => setPreviewed(null), []);

  if (index === null) {
    return (
      <section>
        <Skeleton shape="rows" count={6} />
      </section>
    );
  }

  if (contents === null) {
    return <NotFound kind="folder" />;
  }

  const folderPath = contents.path;
  const pinned = index.folderPinnedAt.has(folderPath);

  async function handleTogglePin(): Promise<void> {
    await runPinAction(
      () => (pinned ? unpinFolder(folderPath) : pinFolder(folderPath)),
      pinned ? 'Unpinned' : 'Pinned to Home',
    );
  }

  return (
    <FolderBody
      contents={contents}
      root={parent === undefined}
      file={index.byPath.get(contents.path)}
      pinned={pinned}
      onTogglePin={() => void handleTogglePin()}
      desktop={wide}
      onPreview={onPreview}
      comparing={comparing}
      onComparing={onComparing}
      onNavigate={route}
      upHref={parent === undefined ? undefined : folderHref(parent.path)}
    />
  );
}
