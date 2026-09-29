/**
 * Folder screen (issue #214, spec §14 "Folder screen"): `/folder/:path*`,
 * one screen for a folder wherever it is reached from — the Home Answers
 * card, a note's breadcrumb, the desktop tree's folder name, or another
 * Folder screen's own subfolder rows. Shows the folder's icon and name, its
 * counts, a chip row (Pinned, Ask Bower about it, Drive), its
 * subfolders (with their own counts) and its own notes and files together,
 * newest first (#349): each row with the type icon, the title and who put
 * it there (`file-origin.ts`). A note opens in the app, any other file on
 * its own screen (`routes/file.tsx`, #350). Any folder but a root one ends
 * with a tip inviting more from Bower (#453, Phone-Folder-Project board).
 *
 * The More menu (#352) is the one a note and a file have
 * (`note-menu.tsx`, `kind="folder"`): its phone trigger in the shell's
 * `actions` slot, its desktop one next to the heading, as on a note.
 *
 * The chips share `styles/layout.css`'s generic `.chip` (also used by the
 * interview's answers). Pinned toggles the folder's own pin (#215, #216:
 * `pinFolder`/`unpinFolder`, through `pin-action.ts`'s shared toast).
 *
 * The header's `back` and `crumb` slots (`shell-slots.ts`) work exactly
 * like a note's (`routes/note.tsx#Crumb`, #144, #318): Back to the parent
 * folder (or Home for a top-level one), then the phone title and the
 * desktop breadcrumb, both always in the markup, `layout.css` showing only
 * the one that fits — except the
 * breadcrumb here also ends in the folder's own name (not a link), since,
 * unlike a note, the folder itself is a valid breadcrumb segment.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';

import { isDemo } from '../api.js';
import { Bird, BowerMark } from '../components/bird.js';
import {
  IconChat,
  IconExternalLink,
  IconFolder,
  IconPin,
  IconSparkle,
} from '../components/icons.js';
import { BackLink } from '../components/back-link.js';
import { FolderMark } from '../components/folder-mark.js';
import { HeaderAction } from '../components/header-action.js';
import { Hint } from '../components/hint.js';
import { MoreButton } from '../components/more-button.js';
import { NoteMenu } from '../components/note-menu.js';
import { QuickLookPane } from '../components/quick-look.js';
import type { PanePreview } from '../components/quick-look.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useCatalogueOrigins } from '../components/use-catalogue-origins.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { compareKinds, notesOfKind } from '../compare.js';
import type { CompareNote } from '../compare.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH } from '../file-origin.js';
import type { Origin } from '../file-origin.js';
import { folderMeaning, rootFolderHeading } from '../folder-meanings.js';
import { openSendToBower } from '../components/send-to-bower.js';
import { askBowerHref } from '../more-menu.js';
import {
  breadcrumb,
  displayName,
  driveFolderUrl,
  folderContents,
  folderEmptyState,
  folderHref,
  paraKindOf,
} from '../navigation.js';
import type { BreadcrumbSegment, FolderContents } from '../navigation.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { useMediaQuery } from '../use-media-query.js';
import { pendingByPath } from '../rename-request.js';
import { useRequestRows } from '../use-request-rows.js';
import { useVault } from '../vault-store.js';
import { NotFound } from './not-found.js';
import '../styles/folder.css';

/** From here the folder has three panes (#614, D13, R-DESK-2). */
export const PANES_QUERY = '(min-width: 1200px)';

/** From here the top bar carries the path and the in-content bar goes
 * (R-FOLD-3, D12). */
export const DESKTOP_QUERY = '(min-width: 900px)';

/** The two questions the suggestion offers (R-FOLD, board Ask-*). */
const ASK_CHIPS: readonly string[] = [
  'Which offer fits me best?',
  'Pull out every closing date',
];

/** "1 note" / "3 notes", "1 folder" / "2 folders" — the header's count line. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The folder that holds projects, whose screen counts them (#431). */
const PROJECTS_PATH = '1-Projects';

/** #555/#364: the demo's fixture ids are not real Drive ids, so the Drive
 * chip is disabled instead of opening a broken Drive page, the same
 * sentence as Add's own greyed Drive door. */
const NOT_IN_DEMO_DRIVE = 'Not in the demo. Run your own Bower to use it.';

/** The header's line under the name, as the Phone-Folder-Project board has
 * it: "1-Projects · 4 files · 2 notes · pinned". Files and folders only
 * when there are any; notes always. 1-Projects itself reads the way the
 * Phone-Folder board has it instead: "2 projects · 9 things" (#431). */
function metaLine(
  contents: FolderContents,
  parentName: string | null,
  pinned: boolean,
): string {
  if (contents.path === PROJECTS_PATH) {
    return `${plural(contents.subfolders.length, 'project')} · ${plural(
      contents.noteCount + contents.fileCount,
      'thing',
    )}`;
  }
  const parts: string[] = [];
  if (parentName !== null) parts.push(parentName);
  if (contents.fileCount > 0) parts.push(plural(contents.fileCount, 'file'));
  parts.push(plural(contents.noteCount, 'note'));
  if (contents.subfolders.length > 0) {
    parts.push(plural(contents.subfolders.length, 'folder'));
  }
  if (pinned) parts.push('pinned');
  return parts.join(' · ');
}

interface FolderCrumbProps {
  /** This folder's ancestors only (`breadcrumb`), nearest last. */
  ancestors: BreadcrumbSegment[];
  /** This folder's own name — the breadcrumb's last, unlinked segment. */
  name: string;
}

/** The shell header's `crumb` slot content, folder version of #144's `Crumb`. */
function FolderCrumb({ ancestors, name }: FolderCrumbProps): JSX.Element {
  return (
    <>
      <span class="topbar-title">{displayName(name)}</span>
      <nav class="breadcrumb" aria-label="Folder">
        {ancestors.map((crumb) => (
          <span key={crumb.path}>
            <a href={folderHref(crumb.path)}>{crumb.name}</a>
            <span aria-hidden="true"> / </span>
          </span>
        ))}
        <span class="breadcrumb-current" aria-current="page">
          {name}
        </span>
      </nav>
    </>
  );
}

type ItemsModule = typeof import('../components/folder-items.js');

// Loaded when a folder is first shown, so the path bar and the list mode
// (filters, pairing, rows) stay out of the startup chunk (#41's budget).
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

/** The Bower box, prefilled to ask for things to be moved into this folder
 * (R-FOLDER-9). */
function moveHereHref(name: string): string {
  return `/bower?text=${encodeURIComponent(`Move things into ${name}: `)}`;
}

type CompareModule = typeof import('../components/compare.js');

interface FolderCompare {
  module: CompareModule;
  notes: CompareNote[];
  /** "Compare 4 flats": the tab's and the desktop button's words. */
  label: string;
}

/** The board says "flats" for rental listings, where the spec's
 * `kind.plural` says "rental listings" (the board wins). */
const TAB_NOUN: Readonly<Record<string, string>> = {
  'rental-listing': 'flats',
};

/** The Compare tab (#612, R-COMP-1): the folder's notes that name a kind,
 * once at least two of one comparable kind are there. Loaded on demand, so
 * the Compare view stays out of the startup chunk. */
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
          module,
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

interface FolderBodyProps {
  contents: FolderContents;
  parentName: string | null;
  /** The `<h1>`: a root folder's name without its numeric prefix
   * ("Projects", #431); any other folder's own name. */
  heading: string;
  /**
   * A root folder's one-line meaning (#348, C.5), from the one table
   * `folder-meanings.ts` — the same words the Notes tab and the
   * "What is Bower" intro use. `undefined` for any other folder.
   */
  meaning: string | undefined;
  /** Who put each file there, from `index.md` (`useCatalogueOrigins`). */
  catalogue: ReadonlyMap<string, Origin>;
  /** The folder's own Drive file, for the Drive chip; always set in
   * practice (`contents` only exists for a folder the index already has). */
  file: DriveFile | undefined;
  /** Whether the folder has a `pinned` timestamp (#215, #216). */
  pinned: boolean;
  /** Pins or unpins the folder; the chip's own label follows `pinned`. */
  onTogglePin: () => void;
  /** True for the two seconds right after a successful toggle, showing the
   * bird's `done` pose on the chip instead of the pin icon. */
  justChanged: boolean;
  onDoneShown: () => void;
  /** Whether the More menu (#352) is open, and its toggle. */
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  /** Three panes (#614): the selection, the keys and the chips. */
  desktop: boolean;
  /** 900 px and wider: no PathBar, and Drive shows in the header. */
  topBarPath: boolean;
  onPreview: (item: PanePreview | null) => void;
  /** The parent folder's address; `undefined` at a top-level folder. */
  upHref: string | undefined;
  onNavigate: (href: string) => void;
}

function FolderBody({
  contents,
  parentName,
  heading,
  meaning,
  catalogue,
  file,
  pinned,
  onTogglePin,
  justChanged,
  onDoneShown,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  desktop,
  topBarPath,
  onPreview,
  upHref,
  onNavigate,
}: FolderBodyProps): JSX.Element {
  // "About <folder>: " and nothing else from the folder (#354), through
  // the same `/bower?text=` link the More menu's rows use.
  const tellHref = askBowerHref('folder', contents.name);
  const now = Date.now();
  const titles = useNoteTitles(contents.notes);
  const emptyState = folderEmptyState(contents);
  const items = useFolderItems();
  const requestRows = useRequestRows();
  const waiting = useMemo(() => pendingByPath(requestRows), [requestRows]);
  const compare = useFolderCompare(contents.notes);
  const [tab, setTab] = useState<'everything' | 'compare'>('everything');
  useEffect(() => setTab('everything'), [contents.path]);
  // The mark is still, so the chip's confirmation ends on a timer, after
  // the two seconds the `done` pose used to take.
  useEffect(() => {
    if (!justChanged) return;
    const timer = setTimeout(onDoneShown, 2000);
    return () => clearTimeout(timer);
  }, [justChanged, onDoneShown]);
  const comparing = tab === 'compare' && compare !== null;
  // The board's header (#611) for a folder with things in it; a root folder
  // and an empty one keep the counts line they have always had.
  const paraOfFolder = paraKindOf(contents.path.split('/')[0] ?? '');
  const boardHeader = parentName !== null && contents.items.length > 0;

  return (
    <section class="folder-view">
      {items !== null && !topBarPath && <items.PathBar path={contents.path} />}
      <div class="folder-head">
        {paraOfFolder === null ? (
          <IconFolder />
        ) : (
          <FolderMark kind={paraOfFolder} size={28} />
        )}
        <div class="folder-head-text">
          <h1>{heading}</h1>
          {!boardHeader && (
            <p class="folder-meta">{metaLine(contents, parentName, pinned)}</p>
          )}
        </div>
        {file !== undefined && (
          <div class="note-header-actions folder-head-actions">
            <MoreButton
              class="note-header-more"
              expanded={menuOpen}
              onClick={onToggleMenu}
            />
            {menuOpen && (
              <NoteMenu
                kind="folder"
                file={file}
                title={contents.name}
                typeLabel="Folder"
                askName={contents.name}
                pinned={pinned}
                onTogglePin={onTogglePin}
                onClose={onCloseMenu}
              />
            )}
          </div>
        )}
      </div>

      {meaning !== undefined && <p class="folder-explainer">{meaning}</p>}

      <div class="folder-chips">
        <HeaderAction
          icon={justChanged ? <BowerMark size={16} /> : <IconPin />}
          pressed={pinned}
          onClick={onTogglePin}
        >
          {pinned ? 'Pinned' : 'Pin to Home'}
        </HeaderAction>
        <HeaderAction icon={<IconChat />} href={tellHref}>
          Ask Bower about it
        </HeaderAction>
        {file !== undefined && topBarPath && !isDemo() && (
          <HeaderAction
            icon={<IconExternalLink />}
            href={driveFolderUrl(file)}
            external
          >
            Open in Drive
          </HeaderAction>
        )}
        {file !== undefined && topBarPath && isDemo() && (
          <HeaderAction
            icon={<IconExternalLink />}
            disabled
            title={NOT_IN_DEMO_DRIVE}
          >
            Open in Drive
          </HeaderAction>
        )}
      </div>

      {parentName !== null && !comparing && (
        <Hint
          id="folder-ask"
          variant="suggestion"
          icon={<IconSparkle />}
          actions={ASK_CHIPS.map((question) => (
            <button
              key={question}
              type="button"
              class="chip"
              onClick={() =>
                openSendToBower({
                  mode: 'ask',
                  about: contents.name,
                  ...(paraOfFolder !== null && { aboutKind: paraOfFolder }),
                  initialText: question,
                  buildText: (value) => `About ${contents.name}: ${value}`,
                })
              }
            >
              {question}
            </button>
          ))}
        >
          Try asking. Your question waits in the inbox for the next tidy-up.
        </Hint>
      )}

      {compare !== null && (
        <div
          class={`folder-tabs${comparing ? ' is-compare' : ''}`}
          role="tablist"
          aria-label="Folder content"
        >
          <button
            type="button"
            role="tab"
            class="folder-tab"
            aria-selected={!comparing}
            onClick={() => setTab('everything')}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            class="folder-tab"
            aria-selected={comparing}
            onClick={() => setTab('compare')}
          >
            {compare.label}
          </button>
        </div>
      )}

      {comparing && (
        <compare.module.CompareView
          notes={compare.notes}
          folderPath={contents.path}
        />
      )}

      {comparing ? null : contents.items.length === 0 ? (
        <div class="folder-section">
          {items !== null && (
            <items.SubfolderList
              contents={contents}
              now={now}
              detailed={parentName === null}
            />
          )}
          {emptyState.elsewhere !== null ? (
            <p class="folder-elsewhere">
              {plural(
                emptyState.elsewhere.count,
                contents.noteCount > 0 ? 'note' : 'file',
              )}{' '}
              in {emptyState.elsewhere.subfolderName ?? 'its folders'}
            </p>
          ) : (
            <div class="folder-empty">
              <Bird state="idle" size={40} />
              <p class="folder-empty-title">Nothing in {contents.name} yet</p>
              <p class="folder-empty-text">
                Add tickets, bookings or ideas and Bower files them here at the
                next tidy-up.
              </p>
              <a class="button" href="/add">
                Add something
              </a>
              <a class="folder-empty-ask" href={moveHereHref(contents.name)}>
                Ask Bower to move things here
              </a>
            </div>
          )}
        </div>
      ) : (
        items !== null && (
          <items.FolderItems
            contents={contents}
            titles={titles}
            catalogue={catalogue}
            now={now}
            desktop={desktop}
            waiting={waiting}
            onPreview={onPreview}
            onUp={upHref === undefined ? undefined : () => onNavigate(upHref)}
            onOpen={onNavigate}
            {...(compare !== null && {
              compare: {
                label: compare.label,
                onOpen: () => setTab('compare'),
              },
            })}
          />
        )
      )}
    </section>
  );
}

export function Folder(): JSX.Element {
  const { params } = useRoute();
  const path = params.path ?? '';
  const { index, pinFolder, unpinFolder, getNoteText } = useVault();
  const [justChanged, setJustChanged] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const contents = useMemo(
    () =>
      index === null
        ? null
        : folderContents(index, path, getPref('explorerSort')),
    [index, path],
  );
  const ancestors = useMemo(() => breadcrumb(path), [path]);
  const parent = ancestors[ancestors.length - 1];
  const { route } = useLocation();
  const wide = useMediaQuery(PANES_QUERY);
  const topBarPath = useMediaQuery(DESKTOP_QUERY);
  const [preview, setPreview] = useState<PanePreview | null>(null);

  // The phone top bar's Back (#318): the parent folder, or Home for a
  // top-level one.
  const backContent = useMemo(
    () =>
      parent === undefined ? (
        <BackLink href="/" label="Home" />
      ) : (
        <BackLink href={folderHref(parent.path)} label={parent.name} />
      ),
    [parent],
  );
  useShellSlot('back', backContent);

  const crumbContent = useMemo(() => {
    if (contents === null) return null;
    return <FolderCrumb ancestors={ancestors} name={contents.name} />;
  }, [contents, ancestors]);
  useShellSlot('crumb', crumbContent);

  // The phone's More trigger (#352), in the shell's `actions` slot like a
  // note's; only once the folder's own Drive entry is known.
  const hasFile =
    contents !== null && index?.byPath.get(contents.path) !== undefined;
  const actionsContent = useMemo(
    () =>
      hasFile ? (
        <MoreButton
          expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        />
      ) : null,
    [hasFile, menuOpen],
  );
  useShellSlot('actions', actionsContent);

  // The preview pane (#614): the shell's right-hand column, as on a note.
  const asideContent = useMemo(
    () => (wide ? <QuickLookPane item={preview} /> : null),
    [wide, preview],
  );
  useShellSlot('aside', asideContent);

  const catalogue = useCatalogueOrigins(
    index?.byPath.get(CATALOGUE_PATH),
    getNoteText,
  );

  if (index === null) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (contents === null) {
    return <NotFound kind="folder" />;
  }

  const folderPath = contents.path;
  const pinned = index.folderPinnedAt.has(folderPath);

  async function handleTogglePin(): Promise<void> {
    const ok = await runPinAction(
      () => (pinned ? unpinFolder(folderPath) : pinFolder(folderPath)),
      pinned ? 'Unpinned' : 'Pinned to Home',
    );
    if (ok) setJustChanged(true);
  }

  return (
    <FolderBody
      contents={contents}
      parentName={parent === undefined ? null : parent.name}
      heading={
        parent === undefined ? rootFolderHeading(contents.path) : contents.name
      }
      meaning={parent === undefined ? folderMeaning(contents.path) : undefined}
      catalogue={catalogue}
      file={index.byPath.get(contents.path)}
      pinned={pinned}
      onTogglePin={() => void handleTogglePin()}
      justChanged={justChanged}
      onDoneShown={() => setJustChanged(false)}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onCloseMenu={() => setMenuOpen(false)}
      desktop={wide}
      topBarPath={topBarPath}
      onPreview={setPreview}
      onNavigate={route}
      upHref={parent === undefined ? undefined : folderHref(parent.path)}
    />
  );
}
