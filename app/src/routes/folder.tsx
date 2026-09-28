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
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { isDemo } from '../api.js';
import { loadViewSettings, saveViewSettings } from '../cache.js';
import type { ViewSettings } from '../cache.js';
import { parseCatalogueFiles } from '../companion.js';
import { Bird } from '../components/bird.js';
import {
  IconChat,
  IconDoc,
  IconExternalLink,
  IconFolder,
  IconImage,
  IconNote,
  IconPdf,
  IconPin,
  IconSparkle,
} from '../components/icons.js';
import { BackLink } from '../components/back-link.js';
import { FolderMark } from '../components/folder-mark.js';
import { KeyFacts } from '../components/key-facts.js';
import { KindBadge } from '../components/kind-badge.js';
import { BowerTag, NewTag } from '../components/tags.js';
import { MoreButton } from '../components/more-button.js';
import { NoteMenu } from '../components/note-menu.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useCatalogueOrigins } from '../components/use-catalogue-origins.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH, originOf } from '../file-origin.js';
import {
  FOLDER_SORTS,
  SORT_LABELS,
  buildFolderModel,
  fileLine,
  filterKind,
  groupRows,
  kindOptions,
  lastFiled,
  metaCounts,
  rowsFor,
  sortRows,
  subjectOf,
  whenWords,
} from '../folder-view.js';
import type {
  FolderModel,
  FolderRow,
  FolderSort,
  OriginFilter,
} from '../folder-view.js';
import { keyFactsFor, kindById } from '../kinds.js';
import { loadNoteMeta } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { useNew } from '../use-new.js';
import { folderMeaning, rootFolderHeading } from '../folder-meanings.js';
import { askBowerHref } from '../more-menu.js';
import type { Origin } from '../file-origin.js';
import {
  breadcrumb,
  displayName,
  driveFolderUrl,
  folderContents,
  folderEmptyState,
  folderHref,
  paraKindOf,
  shortAge,
} from '../navigation.js';
import type {
  BreadcrumbSegment,
  FolderContents,
  FolderSubfolder,
} from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { useVault } from '../vault-store.js';
import { FILE_KIND_LABELS, fileKind, fileTitle } from '../vault-index.js';
import type { FileKind } from '../vault-index.js';
import { NotFound } from './not-found.js';
import '../styles/folder.css';

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

/** A row's type icon, coloured by kind (`folder.css`). A note copied from
 * Drive keeps the Drive page icon, as on the board. */
function KindIcon({
  file,
  origin,
  badge = false,
}: {
  file: DriveFile;
  origin: Origin | null;
  /** The grey kind badge in the tile's corner, for everything but a note. */
  badge?: boolean;
}): JSX.Element {
  const kind = fileKind(file);
  let icon: JSX.Element;
  let tone: string;
  if (kind === 'note') {
    icon = origin === 'drive' ? <IconDoc /> : <IconNote />;
    tone = origin === 'drive' ? 'drive' : 'note';
  } else if (kind === 'pdf') {
    icon = <IconPdf />;
    tone = 'pdf';
  } else if (kind === 'photo' || kind === 'image') {
    icon = <IconImage />;
    tone = 'image';
  } else {
    icon = <IconDoc />;
    tone =
      kind === 'doc' || kind === 'sheet' || kind === 'slides'
        ? 'drive'
        : 'note';
  }
  return (
    <span class={`folder-row-icon tone-${tone}`}>
      {icon}
      {badge && kind !== 'note' && <KindBadge kind={kind} file={file} />}
    </span>
  );
}

/** A root folder screen's subfolder second line (#431, Phone-Folder
 * board): "6 things · updated today", "3 things · 5 d". Empty (#502): a
 * subfolder with nothing in it has no `updated` either, and the tree
 * already hides a zero count (#310) rather than say "0 things". */
function subfolderLine(folder: FolderSubfolder, now: number): string {
  if (folder.things === 0) return '';
  const things = plural(folder.things, 'thing');
  if (folder.updated === undefined) return things;
  const age = shortAge(folder.updated, now);
  return `${things} · ${age === 'today' ? 'updated today' : age}`;
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
      <span class="topbar-title">{name}</span>
      <nav class="breadcrumb" aria-label="Folder">
        {ancestors.map((crumb) => (
          <span key={crumb.path}>
            <a href={folderHref(crumb.path)}>{crumb.name}</a>
            <span aria-hidden="true"> / </span>
          </span>
        ))}
        <span class="breadcrumb-current">{name}</span>
      </nav>
    </>
  );
}

/** Past this many rows the list renders only the ones in view (`VirtualList`,
 * #590/#611); below it every row is in the DOM. */
const VIRTUAL_FROM_ROWS = 150;

/** A row's and a date heading's height in px before they are measured. */
const ROW_ESTIMATE = 62;
const GROUP_ESTIMATE = 34;

/** How many notes' frontmatter are read at once. */
const META_BATCH = 8;

type VirtualModule = typeof import('../components/virtual-list.js');

// Loaded the first time a folder passes the threshold, as the tree does, so
// the virtualiser stays out of the startup chunk.
let virtualModule: VirtualModule | null = null;

interface FolderViewState {
  sort: FolderSort;
  kind: FileKind | null;
  origin: OriginFilter;
}

const DEFAULT_VIEW: FolderViewState = {
  sort: 'newest',
  kind: null,
  origin: 'all',
};

/** The folder's `viewSettings` record. `folderSort` is the exact sort (the
 * shared `sort` only knows name and modified); `compareColumns` is Compare's
 * and is kept whenever this screen writes. */
type StoredView = ViewSettings & {
  folderSort?: FolderSort;
  compareColumns?: string[];
};

function readView(stored: StoredView | undefined): FolderViewState {
  if (stored === undefined) return DEFAULT_VIEW;
  const sort =
    FOLDER_SORTS.find((candidate) => candidate === stored.folderSort) ??
    (stored.sort === 'name' ? 'name' : 'newest');
  const origin: OriginFilter =
    stored.originFilter === 'originals' || stored.originFilter === 'bower'
      ? stored.originFilter
      : 'all';
  const kind =
    typeof stored.kindFilter === 'string'
      ? (stored.kindFilter as FileKind)
      : null;
  return { sort, kind, origin };
}

/** Sort, kind filter and origin filter, remembered per folder (#582). */
function useFolderView(
  path: string,
): [FolderViewState, (patch: Partial<FolderViewState>) => void] {
  const [view, setView] = useState<FolderViewState>(DEFAULT_VIEW);

  useEffect(() => {
    let cancelled = false;
    setView(DEFAULT_VIEW);
    loadViewSettings(path).then(
      (stored) => {
        if (!cancelled) setView(readView(stored));
      },
      (err: unknown) => console.error(err),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  function update(patch: Partial<FolderViewState>): void {
    const next = { ...view, ...patch };
    setView(next);
    loadViewSettings(path)
      .then((stored) => {
        const base: StoredView = stored ?? {
          sort: 'modified',
          kindFilter: null,
          originFilter: null,
          layout: 'list',
        };
        const record: StoredView = {
          ...base,
          sort:
            next.sort === 'name' || next.sort === 'kind' ? 'name' : 'modified',
          folderSort: next.sort,
          kindFilter: next.kind,
          originFilter: next.origin === 'all' ? null : next.origin,
        };
        return saveViewSettings(path, record);
      })
      .catch((err: unknown) => console.error(err));
  }

  return [view, update];
}

function versionKey(notes: readonly DriveFile[]): string {
  return notes.map((note) => `${note.id}:${note.modifiedTime ?? ''}`).join('|');
}

/** The frontmatter of the folder's notes, read lazily a few at a time: rows
 * render first and their key facts follow. */
function useNoteMetas(
  notes: readonly DriveFile[],
): ReadonlyMap<string, NoteMeta> {
  const [metas, setMetas] = useState<ReadonlyMap<string, NoteMeta>>(
    () => new Map(),
  );
  const key = versionKey(notes);
  const latest = useRef(notes);
  latest.current = notes;

  useEffect(() => {
    let cancelled = false;
    const read = new Map<string, NoteMeta>();
    void (async () => {
      const all = latest.current;
      for (let at = 0; at < all.length && !cancelled; at += META_BATCH) {
        await Promise.all(
          all.slice(at, at + META_BATCH).map(async (note) => {
            try {
              read.set(note.id, await loadNoteMeta(note));
            } catch (err) {
              console.error(err);
            }
          }),
        );
        if (!cancelled) setMetas(new Map(read));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return metas;
}

/** `index.md`'s file-to-note rows (`parseCatalogueFiles`), for pairing. */
function useCatalogueFiles(
  catalogue: DriveFile | undefined,
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, string> {
  const [files, setFiles] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const id = catalogue?.id;
  const version = catalogue?.modifiedTime;

  useEffect(() => {
    if (id === undefined) {
      setFiles(new Map());
      return;
    }
    let cancelled = false;
    getNoteText(id).then(
      (text) => {
        if (!cancelled) setFiles(parseCatalogueFiles(text));
      },
      (err: unknown) => {
        console.error(err);
        if (!cancelled) setFiles(new Map());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version, getNoteText]);

  return files;
}

/** The first line of each answer's text, read only when By Bower shows it. */
function useFirstLines(
  notes: readonly DriveFile[],
  getNoteText: (id: string) => Promise<string>,
): ReadonlyMap<string, string> {
  const [lines, setLines] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const key = versionKey(notes);
  const latest = useRef(notes);
  latest.current = notes;

  useEffect(() => {
    let cancelled = false;
    const read = new Map<string, string>();
    void (async () => {
      for (const note of latest.current) {
        if (cancelled) return;
        try {
          const { body } = parseFrontmatter(await getNoteText(note.id));
          const first = body
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .find((line) => line !== '' && !line.startsWith('#'));
          if (first !== undefined) read.set(note.id, first);
        } catch (err) {
          console.error(err);
        }
      }
      if (!cancelled) setLines(new Map(read));
    })();
    return () => {
      cancelled = true;
    };
  }, [key, getNoteText]);

  return lines;
}

/** The path bar (R-FOLDER-1): the PARA mark, each segment a link, the
 * current one bold. */
function PathBar({ path }: { path: string }): JSX.Element {
  const segments = path.split('/').filter(Boolean);
  const para = paraKindOf(segments[0] ?? '');
  let acc = '';
  return (
    <nav class="folder-path" aria-label="You are in">
      {para !== null && <FolderMark kind={para} size={18} />}
      {segments.map((segment, at) => {
        acc = acc === '' ? segment : `${acc}/${segment}`;
        const last = at === segments.length - 1;
        return (
          <span key={acc} class="folder-path-part">
            {at > 0 && (
              <span class="folder-path-sep" aria-hidden="true">
                ›
              </span>
            )}
            {last ? (
              <b aria-current="page">{displayName(segment)}</b>
            ) : (
              <a href={folderHref(acc)}>{displayName(segment)}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const FILTER_LABELS: Readonly<Record<OriginFilter, string>> = {
  all: 'All',
  originals: 'Originals',
  bower: 'By Bower',
};

const TIP_LIST =
  'marks what Bower wrote. Everything else is yours: what you added or wrote. An original and the note Bower wrote about it share one row.';
const TIP_BOWER =
  'Only what Bower wrote, with its key facts, so you can skim a folder without opening the originals. Tap All to see them again.';

/** What a row says under its title. */
function RowDetail({
  row,
  view,
  model,
  catalogue,
  pages,
  now,
  firstLine,
}: {
  row: FolderRow;
  view: FolderViewState;
  model: FolderModel;
  catalogue: ReadonlyMap<string, Origin>;
  pages: ReadonlyMap<string, number>;
  now: number;
  firstLine: string | undefined;
}): JSX.Element {
  const meta = model.metas.get(row.file.id);
  if (!row.bower) {
    return (
      <span class="folder-row-detail">
        {fileLine(
          row.file,
          originOf(row.file, catalogue),
          pages.get(row.file.id),
        )}
      </span>
    );
  }
  const inBower = view.origin === 'bower';
  if (row.answer) {
    const when = row.modified === '' ? 'undated' : whenWords(row.modified, now);
    return (
      <>
        <span class="folder-row-detail">
          <BowerTag />{' '}
          {inBower ? `answer · ${when}` : 'answer to your question'}
        </span>
        {inBower && firstLine !== undefined && (
          <span class="folder-row-lead">{firstLine}</span>
        )}
      </>
    );
  }
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  const facts =
    kind === undefined || meta === undefined
      ? []
      : keyFactsFor(kind, meta.fields);
  const about =
    row.original === undefined ? 'note' : `note on the ${subjectOf(meta)}`;
  const original = row.original === undefined ? '' : FILE_KIND_LABELS[row.kind];
  const dot = facts.length > 0 ? ' ·' : '';
  return (
    <>
      <span class="folder-row-detail">
        <BowerTag /> {about}
        {original !== '' && ` ${inBower ? original : `${original}${dot}`}`}
        {!inBower && facts.length > 0 && (
          <>
            {' '}
            <KeyFacts facts={facts} inline />
          </>
        )}
      </span>
      {inBower && facts.length > 0 && <KeyFacts facts={facts} />}
    </>
  );
}

interface FolderItemsProps {
  contents: FolderContents;
  model: FolderModel;
  view: FolderViewState;
  onView: (patch: Partial<FolderViewState>) => void;
  titles: ReadonlyMap<string, string>;
  catalogue: ReadonlyMap<string, Origin>;
  getNoteText: (id: string) => Promise<string>;
  now: number;
}

type Entry = { type: 'group'; label: string } | { type: 'row'; row: FolderRow };

function entryKey(entry: Entry): string {
  return entry.type === 'group' ? `g:${entry.label}` : entry.row.key;
}

/** The list mode of the folder screen (issue #611): origin filter, tool row,
 * date groups and rows, with pairs as one row. */
function FolderItems({
  contents,
  model,
  view,
  onView,
  titles,
  catalogue,
  getNoteText,
  now,
}: FolderItemsProps): JSX.Element {
  const fresh = useNew();
  const [loaded, setLoaded] = useState<VirtualModule | null>(virtualModule);

  const titleOf = (row: FolderRow): string =>
    fileKind(row.file) === 'note'
      ? (titles.get(row.file.id) ?? noteTitle(row.file))
      : fileTitle(row.file.name);

  const originRows = useMemo(
    () => rowsFor(model, view.origin),
    [model, view.origin],
  );
  const options = useMemo(() => kindOptions(originRows), [originRows]);
  const kind = options.some((option) => option.kind === view.kind)
    ? view.kind
    : null;
  const rows = useMemo(
    () => sortRows(filterKind(originRows, kind), view.sort, titleOf),
    // `titleOf` follows `titles`.
    [originRows, kind, view.sort, titles],
  );
  const entries = useMemo<Entry[]>(() => {
    if (view.sort === 'name' || view.sort === 'kind') {
      return rows.map((row): Entry => ({ type: 'row', row }));
    }
    return groupRows(rows, now).flatMap((group): Entry[] => [
      { type: 'group', label: group.label },
      ...group.rows.map((row): Entry => ({ type: 'row', row })),
    ]);
  }, [rows, view.sort, now]);

  const pages = useMemo(() => {
    const map = new Map<string, number>();
    for (const [noteId, original] of model.pairs) {
      const count = model.metas.get(noteId)?.pages;
      if (count !== undefined) map.set(original.id, count);
    }
    return map;
  }, [model]);

  const answers = useMemo(
    () =>
      view.origin === 'bower'
        ? rows.filter((row) => row.answer).map((row) => row.file)
        : [],
    [rows, view.origin],
  );
  const firstLines = useFirstLines(answers, getNoteText);

  const wantsVirtual = rows.length > VIRTUAL_FROM_ROWS;
  useEffect(() => {
    if (!wantsVirtual || loaded !== null) return;
    let cancelled = false;
    void import('../components/virtual-list.js')
      .then((mod) => {
        virtualModule = mod;
        if (!cancelled) setLoaded(mod);
      })
      .catch((err: unknown) =>
        console.error('Could not load the long-list support', err),
      );
    return () => {
      cancelled = true;
    };
  }, [wantsVirtual, loaded]);

  const showTime = view.sort === 'name' || view.sort === 'kind';

  function renderEntry(entry: Entry): JSX.Element {
    if (entry.type === 'group') {
      return <h3 class="folder-group">{entry.label}</h3>;
    }
    const { row } = entry;
    const isNote = fileKind(row.file) === 'note';
    const href = isNote ? `/note/${row.file.id}` : `/file/${row.file.id}`;
    const isNew =
      fresh.isNew(row.file.id) ||
      (row.original !== undefined && fresh.isNew(row.original.id));
    return (
      <a class="folder-row folder-item" href={href}>
        <KindIcon
          file={row.original ?? row.file}
          origin={originOf(row.file, catalogue)}
          badge
        />
        <span class="folder-row-text">
          <span class="folder-row-title">
            <span class="folder-row-name">{titleOf(row)}</span>
            {isNew && <NewTag />}
          </span>
          <RowDetail
            row={row}
            view={view}
            model={model}
            catalogue={catalogue}
            pages={pages}
            now={now}
            firstLine={firstLines.get(row.file.id)}
          />
        </span>
        {showTime && row.file.modifiedTime !== undefined && (
          <time class="folder-row-meta" dateTime={row.file.modifiedTime}>
            {shortAge(row.file.modifiedTime, now)}
          </time>
        )}
      </a>
    );
  }

  const VirtualList = loaded?.VirtualList;
  const counts: Record<OriginFilter, number | null> = {
    all: null,
    originals: model.originals.length,
    bower: model.bower.length,
  };

  return (
    <div class="folder-section">
      <div class="folder-seg" role="group" aria-label="Show">
        {(['all', 'originals', 'bower'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            class="folder-seg-btn"
            aria-pressed={view.origin === filter}
            onClick={() => onView({ origin: filter, kind: null })}
          >
            {FILTER_LABELS[filter]}
            {counts[filter] !== null && (
              <span class="folder-seg-count"> {counts[filter]}</span>
            )}
          </button>
        ))}
      </div>
      <div class="folder-tools">
        <select
          class="folder-select"
          aria-label="Sort"
          value={view.sort}
          onChange={(event) =>
            onView({ sort: event.currentTarget.value as FolderSort })
          }
        >
          {FOLDER_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
        <select
          class="folder-select"
          aria-label="Kind"
          value={kind ?? ''}
          onChange={(event) =>
            onView({
              kind:
                event.currentTarget.value === ''
                  ? null
                  : (event.currentTarget.value as FileKind),
            })
          }
        >
          <option value="">All kinds</option>
          {options.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label} {option.count}
            </option>
          ))}
        </select>
        {/* The List/Grid toggle sits here (#613). */}
        <span class="folder-view-slot" />
      </div>
      {rows.length === 0 ? (
        <p class="folder-elsewhere">
          {view.origin === 'bower'
            ? `Bower has not written anything in ${contents.name} yet.`
            : 'Nothing of that kind here.'}
        </p>
      ) : wantsVirtual && VirtualList !== undefined ? (
        <VirtualList
          as="ul"
          rowAs="li"
          class="folder-list folder-virtual"
          items={entries}
          estimateSize={(at) =>
            entries[at]?.type === 'group' ? GROUP_ESTIMATE : ROW_ESTIMATE
          }
          overscan={10}
          getKey={entryKey}
          renderRow={renderEntry}
        />
      ) : (
        <ul class="folder-list">
          {entries.map((entry) => (
            <li key={entryKey(entry)}>{renderEntry(entry)}</li>
          ))}
        </ul>
      )}
      <p class="folder-tip folder-list-tip">
        {view.origin === 'bower' ? (
          <span>{TIP_BOWER}</span>
        ) : (
          <span>
            <BowerTag /> {TIP_LIST}
          </span>
        )}
      </p>
    </div>
  );
}

interface FolderBodyProps {
  contents: FolderContents;
  parentName: string | null;
  /** The `<h1>`: a root folder's name without its numeric prefix
   * ("Projects", #431); any other folder's own name. */
  heading: string;
  /**
   * A root folder's one-line meaning (#348, C.5), from the one table
   * `folder-meanings.ts` — the same words the folder menu (#319) and the
   * "What is Bower" intro use. `undefined` for any other folder.
   */
  meaning: string | undefined;
  /** Who put each file there, from `index.md` (`useCatalogueOrigins`). */
  catalogue: ReadonlyMap<string, Origin>;
  /** The folder's own Drive file, for the Drive chip; always set in
   * practice (`contents` only exists for a folder the index already has). */
  file: DriveFile | undefined;
  /** The vault's notes and files by path, for pairing an original with its
   * note, and the catalogue's own Drive file (`index.md`). */
  byPath: ReadonlyMap<string, DriveFile>;
  catalogueFile: DriveFile | undefined;
  getNoteText: (id: string) => Promise<string>;
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
}

function FolderBody({
  contents,
  parentName,
  heading,
  meaning,
  catalogue,
  file,
  byPath,
  catalogueFile,
  getNoteText,
  pinned,
  onTogglePin,
  justChanged,
  onDoneShown,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
}: FolderBodyProps): JSX.Element {
  // "About <folder>: " and nothing else from the folder (#354), through
  // the same `/bower?text=` link the More menu's rows use.
  const tellHref = askBowerHref('folder', contents.name);
  const now = Date.now();
  const titles = useNoteTitles(contents.notes);
  const emptyState = folderEmptyState(contents);
  const [view, onView] = useFolderView(contents.path);
  const metas = useNoteMetas(contents.notes);
  const catalogueFiles = useCatalogueFiles(catalogueFile, getNoteText);
  const model = useMemo(
    () =>
      buildFolderModel({
        items: contents.items,
        byPath,
        metas,
        origins: catalogue,
        catalogueFiles,
      }),
    [contents.items, byPath, metas, catalogue, catalogueFiles],
  );
  // The board's header (#611) for a folder with things in it; a root folder
  // and an empty one keep the counts line they have always had.
  const boardHeader = parentName !== null && contents.items.length > 0;
  const filed = boardHeader ? lastFiled(contents.items, now) : null;

  return (
    <section class="folder-view">
      <PathBar path={contents.path} />
      <div class="folder-head">
        <IconFolder />
        <div class="folder-head-text">
          <h1>{heading}</h1>
          {boardHeader ? (
            <>
              <p class="folder-counts">{metaCounts(model)}</p>
              {filed !== null && <p class="folder-filed">{filed}</p>}
            </>
          ) : (
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
        <button
          type="button"
          class="chip"
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          {justChanged ? (
            <Bird state="done" size={16} onDone={onDoneShown} />
          ) : (
            <IconPin />
          )}
          {pinned ? 'Pinned' : 'Pin to Home'}
        </button>
        <a class="chip" href={tellHref}>
          <IconChat />
          Ask Bower about it
        </a>
        {file !== undefined && !isDemo() && (
          <a
            class="chip"
            href={driveFolderUrl(file)}
            target="_blank"
            rel="noopener"
          >
            <IconExternalLink />
            Drive
          </a>
        )}
        {file !== undefined && isDemo() && (
          <button type="button" class="chip" disabled aria-disabled>
            <IconExternalLink />
            Drive
          </button>
        )}
      </div>
      {file !== undefined && isDemo() && (
        <p class="folder-demo-note">{NOT_IN_DEMO_DRIVE}</p>
      )}

      {contents.subfolders.length > 0 && (
        <div class="folder-section">
          <h2 class="folder-label">Folders</h2>
          <ul class="folder-list">
            {contents.subfolders.map((folder) => {
              const detail = subfolderLine(folder, now);
              return (
                <li key={folder.path}>
                  <a class="folder-row" href={folderHref(folder.path)}>
                    <IconFolder />
                    {parentName === null ? (
                      <span class="folder-row-text">
                        <span class="folder-row-name">{folder.name}</span>
                        {detail !== '' && (
                          <span class="folder-row-detail">{detail}</span>
                        )}
                      </span>
                    ) : (
                      <>
                        <span class="folder-row-name">{folder.name}</span>
                        {folder.things > 0 && (
                          <span class="folder-row-count">{folder.things}</span>
                        )}
                      </>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {contents.items.length === 0 ? (
        <div class="folder-section">
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
              <p>Nothing here yet.</p>
              <a class="button" href="/add">
                Add
              </a>
            </div>
          )}
        </div>
      ) : (
        <FolderItems
          contents={contents}
          model={model}
          view={view}
          onView={onView}
          titles={titles}
          catalogue={catalogue}
          getNoteText={getNoteText}
          now={now}
        />
      )}

      {parentName !== null && (
        <p class="folder-tip folder-more-tip">
          <IconSparkle />
          <span>
            Want more from this folder? Ask Bower: &ldquo;Compare what I saved
            here&rdquo; or &ldquo;From now on, pull the dates out of everything
            in this folder&rdquo;.
          </span>
        </p>
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
      byPath={index.byPath}
      catalogueFile={index.byPath.get(CATALOGUE_PATH)}
      getNoteText={getNoteText}
      pinned={pinned}
      onTogglePin={() => void handleTogglePin()}
      justChanged={justChanged}
      onDoneShown={() => setJustChanged(false)}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onCloseMenu={() => setMenuOpen(false)}
    />
  );
}
