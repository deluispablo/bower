import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { AboutPanel } from '../components/about-panel.js';
import { isBowerWritten } from '../bower-written.js';
import { originalDisplayName, resolveOriginal } from '../companion.js';
import { kindById, statusLabel } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { statusOptionLabel } from '../compare.js';
import { changeStatusWithHistory } from '../history.js';
import { IconChat, IconFile, IconNote } from '../components/icons.js';
import {
  applyLinkOf,
  MadeFrom,
  madeFromSources,
} from '../components/made-from.js';
import { showToast } from '../toast-store.js';
import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { BackLink } from '../components/back-link.js';
import {
  BowerNoteBox,
  splitOpening,
  takeCheckSection,
} from '../components/bower-note-box.js';
import { FolderMark } from '../components/folder-mark.js';
import { MoreButton } from '../components/more-button.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { NoteMenu } from '../components/note-menu.js';
import { PendingRequestLine } from '../components/pending-request-line.js';
import type { NoteFolderLink } from '../components/note-properties.js';
import { useShellSlot } from '../components/shell-slots.js';
import { BowerTag } from '../components/tags.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { isProtectedNote } from '../drive.js';
import type { DriveFile, SaveOptions } from '../drive.js';
import { propertiesFor } from '../markdown/frontmatter.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import {
  breadcrumb,
  displayName,
  folderHref,
  folderOf,
  paraKindOf,
} from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
import { loadNoteMeta, noteMetaFrom, recordNoteMeta } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle as computeNoteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import { markSeen } from '../seen.js';
import { siblingNames } from '../rename-request.js';
import { useRequestRows } from '../use-request-rows.js';
import { isAppFile } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import { NotFound } from './not-found.js';
import '../styles/about-panel.css';
import '../styles/markdown.css';
import '../styles/note-header.css';

interface CrumbProps {
  crumbs: BreadcrumbSegment[];
}

/** The phone top bar's Back (#318): the immediate parent folder, or Home
 * for a top-level note. */
function Back({ crumbs }: { crumbs: BreadcrumbSegment[] }): JSX.Element {
  const parent = crumbs[crumbs.length - 1];
  return parent === undefined ? (
    <BackLink href="/" label="Home" />
  ) : (
    <BackLink href={folderHref(parent.path)} label={parent.name} named />
  );
}

/**
 * The shell header's `crumb` slot content (spec §6 row Note, issues #144,
 * #318): the desktop breadcrumb. The phone bar has Back only (#704); the
 * title is on the page.
 */
function Crumb({ crumbs }: CrumbProps): JSX.Element {
  return (
    <>
      {crumbs.length > 0 && (
        <nav class="breadcrumb" aria-label="Folder">
          {crumbs.map((crumb, at) => (
            <span key={crumb.path}>
              {at > 0 && <span aria-hidden="true"> / </span>}
              <a href={folderHref(crumb.path)}>{crumb.name}</a>
            </span>
          ))}
        </nav>
      )}
    </>
  );
}

/** The note's containing folder as a link (issue #307's "Properties"): its
 * name and folder-screen href, or `undefined` for a top-level note (there
 * is nothing to link to — the breadcrumb's own "Home" already covers it). */
function folderLinkFor(path: string): NoteFolderLink | undefined {
  const parent = folderOf(path);
  if (parent === '') return undefined;
  const name = displayName(parent.slice(parent.lastIndexOf('/') + 1));
  return { name, href: folderHref(parent) };
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "28 Sep" for an ISO date (`2026-09-28`, with or without a time), the
 * text as it is for anything else, `''` for nothing. */
export function shortDay(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month === undefined ? value : `${String(Number(match[3]))} ${month}`;
}

/** Bower wrote this note (`isBowerWritten`, spec R-NOTE-1). */
export function isBowerNote(meta: NoteMeta): boolean {
  return isBowerWritten(meta);
}

/** A note's score or fit (0 to 100), `null` when it has neither. */
export function noteScore(
  fields: Record<string, unknown> | undefined,
): number | null {
  for (const key of ['score', 'fit']) {
    const raw = fields?.[key];
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)
          ? Number(raw)
          : Number.NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  }
  return null;
}

/** The pager counts only notes of the note's own kind (R-NOTE-4): a job
 * offer's neighbours are the other offers, not the CV and the letters
 * written for them. `metas` is what is known of the folder's notes. */
export interface SameKind {
  kind: string;
  metas: ReadonlyMap<string, NoteMeta>;
  /** Best score first, as the offers are ranked. */
  byScore: boolean;
}

/** "3 of 4 offers, by score" for a note with a kind; "2 of 5" without one. */
export function pagerCount(
  position: number,
  total: number,
  kind: Kind | undefined,
  byScore: boolean,
): string {
  const place = `${String(position)} of ${String(total)}`;
  if (kind === undefined) return place;
  const last = kind.name.split(' ').pop() ?? kind.name;
  const noun = last.endsWith('s') ? last : `${last}s`;
  return `${place} ${noun}${byScore ? ', by score' : ''}`;
}

/** The pager's accessible name: "Offers in this folder", "Notes in this folder". */
export function pagerLabel(kind: Kind | undefined): string {
  if (kind === undefined) return 'Notes in this folder';
  const last = kind.name.split(' ').pop() ?? kind.name;
  const noun = last.endsWith('s') ? last : `${last}s`;
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} in this folder`;
}

export interface FolderWalk {
  prev: DriveFile | null;
  next: DriveFile | null;
  /** 1-based place of the note among the folder's notes. */
  position: number;
  total: number;
}

/**
 * The previous and next note in the note's folder, in the folder's current
 * sort (`explorerSort`: by name, or newest first), with its place ("n of
 * m"). The same notes the folder screen lists: Bower's own files stay out
 * unless `showAppFiles` is on (the current note is always in the walk).
 */
export function walkFolder(
  index: VaultIndex,
  id: string,
  showAppFiles: boolean,
  sort: ExplorerSortPref,
  sameKind?: SameKind,
): FolderWalk {
  const none: FolderWalk = { prev: null, next: null, position: 0, total: 0 };
  const file = index.byId.get(id);
  if (file === undefined) return none;
  const folder = folderOf(file.path);
  const byName = (a: DriveFile, b: DriveFile): number =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  const inFolder = index.notes
    .filter(
      (note) =>
        folderOf(note.path) === folder &&
        (showAppFiles || note.id === id || !isAppFile(note.path, note.name)) &&
        (sameKind === undefined ||
          note.id === id ||
          sameKind.metas.get(note.id)?.kind === sameKind.kind),
    )
    .sort((a, b) => {
      if (sameKind?.byScore === true) {
        const scoreA = noteScore(sameKind.metas.get(a.id)?.fields);
        const scoreB = noteScore(sameKind.metas.get(b.id)?.fields);
        if (scoreA !== scoreB) {
          if (scoreA === null) return 1;
          if (scoreB === null) return -1;
          return scoreB - scoreA;
        }
        return byName(a, b);
      }
      return sort === 'modified'
        ? (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') ||
            a.name.localeCompare(b.name, undefined, { numeric: true })
        : byName(a, b);
    });
  const at = inFolder.findIndex((note) => note.id === id);
  if (at === -1) return none;
  return {
    prev: at > 0 ? (inFolder[at - 1] ?? null) : null,
    next: at < inFolder.length - 1 ? (inFolder[at + 1] ?? null) : null,
    position: at + 1,
    total: inFolder.length,
  };
}

/** The kind chip's name (R-NOTE-2): the kind's own, "Answer" for an answer,
 * "Summary" for any other note that names no kind (lead ruling on #758). */
export function kindChipLabel(meta: NoteMeta): string {
  if (meta.type === 'answer') return 'Answer';
  const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
  if (kind === undefined) return 'Summary';
  return kind.name.charAt(0).toUpperCase() + kind.name.slice(1);
}

/** A note's status select (R-NOTE-2): only for a kind that has statuses. */
function StatusSelect({
  kind,
  meta,
  value,
  onChange,
}: {
  kind: Kind;
  meta: NoteMeta;
  value: string;
  onChange: (status: string) => void;
}): JSX.Element {
  const options =
    kind.statuses.includes(value) || value === ''
      ? kind.statuses
      : [...kind.statuses, value];
  const shown = statusLabel(kind, { ...meta.fields, status: value });
  return (
    <select
      class="note-status"
      aria-label={
        shown === '' ? 'Status: none. Change' : `Status: ${shown}. Change`
      }
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    >
      {value === '' && <option value="">No status</option>}
      {options.map((status) => (
        <option key={status} value={status}>
          {status === value && shown !== '' ? shown : statusOptionLabel(status)}
        </option>
      ))}
    </select>
  );
}

/** What a text copy of a document shows in place of a kind (R-NOTE-8). */
export interface TextCopy {
  /** The original's file name: "CV 2026.docx". */
  original: string;
  /** The original's base name, the page's title: "CV 2026". */
  title: string;
  /** The kind chip: "Word document, as text". */
  label: string;
}

function documentWord(fileName: string): string {
  const ext = /\.([^./]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'html' || ext === 'htm') return 'Web page';
  if (ext === 'epub') return 'Book';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'Word document';
  return 'Document';
}

/**
 * The text copy of a document of no listed kind (R-NOTE-8, D21): a note that
 * names a file that is not a note as its `original`, and has no kind. `null`
 * for anything else. Its title is the original's base name, never a heading.
 */
export function textCopyOf(meta: NoteMeta): TextCopy | null {
  if (meta.kind !== undefined || meta.type === 'answer') return null;
  if (meta.original === undefined) return null;
  const original = originalDisplayName(meta.original);
  if (original === '' || /\.md$/i.test(original)) return null;
  return {
    original,
    title: original.replace(/\.[^./]+$/, ''),
    label: `${documentWord(original)}, as text`,
  };
}

/**
 * Splits a rendered note at the runner's "The document" heading: what comes
 * before it, and the document's text after it (the heading itself goes; the
 * page draws its own divider). `null` when the note has no such heading.
 */
export function splitDocument(
  html: string,
): { before: string; after: string } | null {
  const template = document.createElement('template');
  template.innerHTML = html;
  const children = Array.from(template.content.children);
  const at = children.findIndex(
    (child) =>
      /^H[1-6]$/.test(child.tagName) &&
      (child.textContent ?? '').trim().toLowerCase() === 'the document',
  );
  if (at === -1) return null;
  const join = (nodes: Element[]): string =>
    nodes.map((child) => child.outerHTML).join('\n');
  return {
    before: join(children.slice(0, at)),
    after: join(children.slice(at + 1)),
  };
}

/** The divider before a text copy's document. */
function DocumentDivider({ original }: { original: string }): JSX.Element {
  return (
    <h2 class="note-document-divider">
      <span>The document</span>
      <span aria-hidden="true">·</span>
      <span class="note-document-caption">
        {`the text of ${original}, unchanged`}
      </span>
    </h2>
  );
}

/** The kind row of a note Bower wrote: kind chip, By Bower tag, status. */
function KindRow({
  meta,
  status,
  onStatus,
  copy,
}: {
  meta: NoteMeta;
  status: string;
  onStatus: (status: string) => void;
  copy: TextCopy | null;
}): JSX.Element {
  const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
  return (
    <div class="note-kind-row">
      <span class="note-kind-chip">
        <span class="note-kind-icon" aria-hidden="true">
          {copy !== null ? (
            <IconFile />
          ) : meta.type === 'answer' ? (
            <IconChat />
          ) : (
            <IconNote />
          )}
        </span>
        {copy !== null ? copy.label : kindChipLabel(meta)}
      </span>
      <BowerTag />
      {kind !== undefined && kind.statuses.length > 0 && (
        <StatusSelect
          kind={kind}
          meta={meta}
          value={status}
          onChange={onStatus}
        />
      )}
    </div>
  );
}

/** Under the title of a note Bower wrote: the folder with its PARA mark, and
 * "Filed {date}" when it was made from something, else "Written {date}". */
function MetaLine({
  file,
  meta,
  created,
  folder,
}: {
  file: DriveFile;
  meta: NoteMeta;
  created: string | undefined;
  folder: NoteFolderLink | undefined;
}): JSX.Element | null {
  const date = shortDay(created ?? file.modifiedTime);
  const top = file.path.split('/')[0] ?? '';
  const para = file.path.includes('/') ? paraKindOf(top) : null;
  if (date === '' && folder === undefined) return null;
  const verb = meta.original === undefined ? 'Written' : 'Filed';
  return (
    <p class="note-meta-line">
      {folder !== undefined && (
        <a class="note-props-folder" href={folder.href}>
          {para !== null && <FolderMark kind={para} size={18} />}
          {folder.name}
        </a>
      )}
      {folder !== undefined && date !== '' && <span aria-hidden="true">·</span>}
      {date !== '' && <span>{`${verb} ${date}`}</span>}
    </p>
  );
}

function PropsLine({
  file,
  tags,
  created,
  folder,
}: {
  file: DriveFile;
  tags: string[];
  created: string | undefined;
  folder: NoteFolderLink | undefined;
}): JSX.Element | null {
  const date = shortDay(created ?? file.modifiedTime);
  const top = file.path.split('/')[0] ?? '';
  const para = file.path.includes('/') ? paraKindOf(top) : null;
  if (tags.length === 0 && date === '' && folder === undefined) {
    return null;
  }
  return (
    <p class="note-props">
      {tags.map((tag) => (
        <a
          key={tag}
          class="tag"
          href={`/search?q=${encodeURIComponent(`#${tag}`)}`}
        >
          #{tag}
        </a>
      ))}
      {date !== '' && <span>{date}</span>}
      {folder !== undefined && (
        <a class="note-props-folder" href={folder.href}>
          {para !== null && <FolderMark kind={para} size={18} />}
          {folder.name}
        </a>
      )}
    </p>
  );
}

/**
 * What is known of `notes`' frontmatter (kind, score), read through the
 * note-meta cache (`loadNoteMeta`, the folder screen reads the same). A note
 * that cannot be read is left out; the map fills in as they come.
 */
function useNoteMetas(
  notes: readonly DriveFile[],
): ReadonlyMap<string, NoteMeta> {
  const [metas, setMetas] = useState<ReadonlyMap<string, NoteMeta>>(
    () => new Map(),
  );
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const key = notes
    .map((note) => `${note.id}@${note.modifiedTime ?? ''}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      notesRef.current.map(async (note): Promise<[string, NoteMeta] | null> => {
        try {
          return [note.id, await loadNoteMeta(note)];
        } catch (error: unknown) {
          if (!(error instanceof OfflineError)) console.error(error);
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setMetas(
        new Map(
          entries.filter(
            (entry): entry is [string, NoteMeta] => entry !== null,
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return metas;
}

type NoteLoad =
  | { status: 'loading' }
  // `text` is the note's raw text, kept alongside `rendered` only so the
  // header can resolve `noteTitle`'s frontmatter/heading fallback without
  // re-fetching it.
  | { status: 'ready'; id: string; text: string; rendered: RenderedNote }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/** The editor open on note `id`; a different note shows its rendered view. */
interface Editing {
  id: string;
  note: EditableNote;
}

export function Note() {
  const { params } = useRoute();
  const id = params.id ?? '';
  const {
    index,
    getNoteText,
    appendToNote,
    openNoteForEdit,
    saveEditedNote,
    pinNote,
    unpinNote,
  } = useVault();
  const [load, setLoad] = useState<NoteLoad>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);
  /** The status just chosen, shown until the save comes back (or fails). */
  const [statusPick, setStatusPick] = useState<string | null>(null);
  const requests = useRequestRows();

  // Leaving a note (after confirming, if there were unsaved changes) drops
  // its edit, so coming back shows the note rather than a stale editor.
  useEffect(() => {
    setEditing(null);
    setEditError(null);
    setMenuOpen(false);
    setAppendOpen(false);
    setStatusPick(null);
  }, [id]);

  const file = index?.byId.get(id);

  // Opening a note marks it seen on this device (#587): the "New" tag goes.
  useEffect(() => {
    if (file === undefined) return;
    markSeen(id).catch((err: unknown) => {
      console.error(err);
    });
  }, [id, file === undefined]);

  // A folder row pairs an original with its Bower note and links to the note,
  // so opening the note also counts as opening the original (#686).
  useEffect(() => {
    if (file === undefined || index === null) return;
    if (load.status !== 'ready' || load.id !== id) return;
    const original = resolveOriginal(
      file,
      noteMetaFrom(load.rendered.frontmatter).original,
      index,
    );
    if (original === undefined) return;
    markSeen(original.id).catch((err: unknown) => {
      console.error(err);
    });
  }, [id, file === undefined, load]);

  // The previous/next walk (#423): the same folder listing the folder
  // screen itself shows (Bower's own files hidden unless `showAppFiles` is
  // on), and their real titles (`noteTitle`, #306) resolved from the note
  // cache the same way Home's Recent and Pinned rows do, not the file name
  // with its date prefix.
  const currentMeta =
    load.status === 'ready' && load.id === id
      ? noteMetaFrom(load.rendered.frontmatter)
      : null;
  const currentKind =
    currentMeta?.kind === undefined ? undefined : kindById(currentMeta.kind);
  const folderNotes = useMemo(
    () =>
      index === null || file === undefined || currentKind === undefined
        ? []
        : index.notes.filter(
            (note) =>
              note.id !== id &&
              folderOf(note.path) === folderOf(file.path) &&
              !isAppFile(note.path, note.name),
          ),
    [index, file, id, currentKind === undefined],
  );
  const peerMetas = useNoteMetas(folderNotes);
  const sameKind: SameKind | undefined =
    currentMeta?.kind === undefined || currentKind === undefined
      ? undefined
      : {
          kind: currentMeta.kind,
          metas: new Map(peerMetas).set(id, currentMeta),
          byScore: noteScore(currentMeta.fields) !== null,
        };
  const { prev, next, position, total } =
    index === null
      ? { prev: null, next: null, position: 0, total: 0 }
      : walkFolder(
          index,
          id,
          getPref('showAppFiles'),
          getPref('explorerSort'),
          sameKind,
        );
  const prevLink = useRef<HTMLAnchorElement>(null);
  const nextLink = useRef<HTMLAnchorElement>(null);
  // "[" and "]" move between the notes on a keyboard (the pager's hint).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== '[' && event.key !== ']') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      (event.key === '[' ? prevLink : nextLink).current?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const siblingFiles: DriveFile[] = [prev, next].filter(
    (sibling): sibling is DriveFile => sibling !== null,
  );
  const siblingTitles = useNoteTitles(siblingFiles);

  useEffect(() => {
    if (index === null || file === undefined) return;
    let cancelled = false;
    // Keep showing this note while it re-renders against a fresh index
    // (after a refresh or an append); only a different note starts over.
    setLoad((prev) =>
      prev.status === 'ready' && prev.id === id ? prev : { status: 'loading' },
    );
    getNoteText(id)
      .then((text) => {
        if (cancelled) return;
        setLoad({
          status: 'ready',
          id,
          text,
          rendered: renderNote(text, index, {
            path: file.path,
            title: computeNoteTitle(file, text),
          }),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OfflineError) {
          setLoad({ status: 'offline' });
          return;
        }
        console.error(err);
        setLoad({ status: 'error', message: 'Could not load this note.' });
      });
    return () => {
      cancelled = true;
    };
    // Re-fetches when the note id changes, or once the index (and so the
    // file it resolves to) becomes available on a cold-start deep link.
  }, [id, index, file, getNoteText]);

  // Fills the shell's header crumb and actions slots and the "About this
  // note" column (#144, shell-slots.ts). All three hooks run on every
  // render (Rules of Hooks), before `index`/`file` are known to exist,
  // hence the guards inside; all are memoized so an unrelated re-render
  // (typing in the append form, say) does not refill a slot every time.
  const backContent = useMemo(() => {
    if (file === undefined) return null;
    return <Back crumbs={breadcrumb(file.path)} />;
  }, [file]);
  useShellSlot('back', backContent);

  const crumbContent = useMemo(() => {
    if (file === undefined) return null;
    return <Crumb crumbs={breadcrumb(file.path)} />;
  }, [file]);
  useShellSlot('crumb', crumbContent);

  const actionsContent = useMemo(() => {
    if (file === undefined) return null;
    return (
      <MoreButton
        expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      />
    );
  }, [file, menuOpen]);
  useShellSlot('actions', actionsContent);

  const aboutContent = useMemo(() => {
    if (index === null || file === undefined || load.status !== 'ready') {
      return null;
    }
    return (
      <AboutPanel
        index={index}
        file={file}
        html={load.rendered.html}
        properties={propertiesFor(load.rendered.frontmatter)}
        folder={folderLinkFor(file.path)}
        meta={noteMetaFrom(load.rendered.frontmatter)}
      />
    );
    // Keyed on the rendered html itself, not the whole `load` (which also
    // changes while still loading, before there is anything new to show).
  }, [index, file, load.status === 'ready' ? load.rendered.html : null]);
  useShellSlot('aside', aboutContent);

  if (index === null) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (file === undefined) {
    return <NotFound kind="note" />;
  }

  const properties =
    load.status === 'ready' ? propertiesFor(load.rendered.frontmatter) : null;
  const folderLink = folderLinkFor(file.path);
  const meta =
    load.status === 'ready' && load.id === id
      ? noteMetaFrom(load.rendered.frontmatter)
      : null;
  const opening =
    load.status === 'ready' ? splitOpening(load.rendered.html) : null;
  const documentParts = opening === null ? null : splitDocument(opening.rest);
  const textCopy =
    meta !== null && documentParts !== null ? textCopyOf(meta) : null;
  const checked =
    opening === null
      ? null
      : takeCheckSection(documentParts?.before ?? opening.rest);
  const question =
    meta?.type === 'answer' && typeof meta.fields.question === 'string'
      ? meta.fields.question
      : undefined;

  function showText(text: string): void {
    if (index === null || file === undefined) return;
    setLoad({
      status: 'ready',
      id,
      text,
      rendered: renderNote(text, index, {
        path: file.path,
        title: computeNoteTitle(file, text),
      }),
    });
  }

  /** The status select writes `status` in the note's frontmatter (R-NOTE-2). */
  async function handleStatus(status: string): Promise<void> {
    if (file === undefined || load.status !== 'ready' || load.id !== id) return;
    const before = statusPick;
    setStatusPick(status);
    try {
      const next = changeStatusWithHistory(load.text, status, new Date());
      if (next === load.text) {
        setStatusPick(null);
        return;
      }
      const saved = await saveEditedNote(id, next, {
        baseModifiedTime: file.modifiedTime ?? null,
      });
      try {
        await recordNoteMeta(id, saved.modifiedTime ?? undefined, next);
      } catch (error: unknown) {
        console.error('Caching the new status failed', error);
      }
      showText(saved.text);
      setStatusPick(null);
    } catch (error: unknown) {
      console.error('Changing a status failed', error);
      showToast("Bower couldn't save that status. Try again.");
      setStatusPick(before);
    }
  }

  async function handleAppend(text: string): Promise<void> {
    showText(await appendToNote(id, text));
  }

  async function handleTogglePin(): Promise<void> {
    if (file === undefined) return;
    const pinned = index?.notePinnedAt.has(file.id) ?? false;
    await runPinAction(
      () => (pinned ? unpinNote(file.id) : pinNote(file.id)),
      pinned ? 'Unpinned' : 'Pinned to Home',
    );
  }

  async function handleEdit(): Promise<void> {
    setEditError(null);
    try {
      setEditing({ id, note: await openNoteForEdit(id) });
    } catch (err) {
      console.error(err);
      setEditError('Could not open this note for editing. Try again.');
    }
  }

  async function handleSave(text: string, options: SaveOptions): Promise<void> {
    const saved = await saveEditedNote(id, text, options);
    showText(saved.text);
    setEditing(null);
  }

  async function handleTakeTheirs(): Promise<void> {
    const current = await openNoteForEdit(id);
    showText(current.text);
    setEditing(null);
  }

  const isEditing = editing !== null && editing.id === id;
  const title =
    textCopy?.title ??
    (load.status === 'ready' && load.id === id
      ? computeNoteTitle(file, load.text)
      : computeNoteTitle(file));
  // "Edit the text" (the note menu) is left out for Bower's own files (spec
  // §14) — a broader set than `isProtectedNote`, which only blocks the
  // actual save (drive.ts): About-Me.md and README.md, say, are technically
  // writable but not offered here, on purpose.
  const canEdit = !isAppFile(file.path, file.name) && !isEditing;
  const canAppend = !isProtectedNote(file.name);
  const bowerHeader = meta !== null && isBowerNote(meta);
  const frontTitle = meta?.fields.title;
  // The frontmatter title, when it says more than the name (R-NOTE-2).
  const subtitle =
    typeof frontTitle === 'string' && frontTitle.trim().length > title.length
      ? frontTitle.trim()
      : undefined;

  return (
    <section class="note-view">
      {!isEditing && bowerHeader && meta !== null && (
        <KindRow
          meta={meta}
          status={(statusPick ?? meta.status ?? '').toLowerCase()}
          onStatus={(status) => void handleStatus(status)}
          copy={textCopy}
        />
      )}
      <div class="note-edit-header">
        <h1>{title}</h1>
        <div class="note-header-actions">
          <MoreButton
            class="note-header-more"
            expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen && (
            <NoteMenu
              file={file}
              title={title}
              typeLabel="Note"
              askName={title}
              canEdit={canEdit}
              canAppend={canAppend}
              pinned={index.notePinnedAt.has(file.id)}
              onTogglePin={() => void handleTogglePin()}
              onAddParagraph={() => setAppendOpen(true)}
              onEdit={() => void handleEdit()}
              siblingNames={siblingNames(index, file.path)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
      <PendingRequestLine path={file.path} rows={requests} />
      {editError !== null && (
        <p class="auth-error" role="alert">
          {editError}
        </p>
      )}

      {!isEditing && bowerHeader && meta !== null && properties !== null && (
        <>
          {subtitle !== undefined && <p class="note-subtitle">{subtitle}</p>}
          <MetaLine
            file={file}
            meta={meta}
            created={properties.created}
            folder={folderLink}
          />
          <MadeFrom
            apply={applyLinkOf(meta.fields.apply_link)}
            sources={madeFromSources({
              note: file,
              original: meta.original,
              source: meta.fields.source,
              kind: meta.kind,
              lookup: index,
            }).map((source) =>
              textCopy !== null && source.key.startsWith('original:')
                ? { ...source, role: 'the original' }
                : source,
            )}
          />
        </>
      )}
      {!isEditing && !bowerHeader && meta !== null && properties !== null && (
        <PropsLine
          file={file}
          tags={properties.tags}
          created={properties.created}
          folder={folderLink}
        />
      )}

      {isAppFile(file.path, file.name) && <AppFileBanner file={file} />}

      {isEditing && (
        <NoteEditor
          key={id}
          noteId={id}
          initial={editing.note}
          onSave={handleSave}
          onTakeTheirs={handleTakeTheirs}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}

      {!isEditing && load.status === 'loading' && <p>Loading…</p>}
      {!isEditing && load.status === 'offline' && (
        <p>Offline: this note is not saved on this device yet.</p>
      )}
      {!isEditing && load.status === 'error' && <p>{load.message}</p>}
      {!isEditing && load.status === 'ready' && (
        <>
          {question !== undefined && (
            <div class="note-asked">
              <span class="note-asked-label">
                {`You asked, ${shortDay(properties?.created ?? file.modifiedTime)}`}
              </span>
              <p class="note-asked-text">{question}</p>
            </div>
          )}
          {opening !== null && opening.top !== '' && (
            <BowerNoteBox
              html={opening.top}
              frontmatter={
                load.status === 'ready' ? load.rendered.frontmatter : {}
              }
              checkSection={checked?.items ?? []}
              path={file.path}
              requests={requests}
              names={[title]}
            />
          )}
          {opening !== null &&
            opening.top === '' &&
            meta !== null &&
            isBowerNote(meta) && (
              <p class="note-no-box">
                Bower adds its insights next time it touches this note.
              </p>
            )}
          <NoteBody html={checked?.rest ?? opening?.rest ?? ''} />
          {textCopy !== null && documentParts !== null && (
            <>
              <DocumentDivider original={textCopy.original} />
              <NoteBody html={documentParts.after} />
            </>
          )}
          {canAppend && appendOpen && (
            <AppendForm key={id} onAppend={handleAppend} />
          )}
        </>
      )}

      {(prev !== null || next !== null) && (
        <nav class="note-siblings" aria-label={pagerLabel(currentKind)}>
          {prev !== null ? (
            <a ref={prevLink} class="note-sibling" href={`/note/${prev.id}`}>
              {`‹ ${siblingTitles.get(prev.id) ?? computeNoteTitle(prev)}`}
            </a>
          ) : (
            <span />
          )}
          <span class="note-siblings-mid">
            <span class="note-siblings-count">
              {pagerCount(
                position,
                total,
                currentKind,
                sameKind?.byScore === true,
              )}
            </span>
            <span class="note-siblings-keys">[ and ] to move</span>
          </span>
          {next !== null ? (
            <a
              ref={nextLink}
              class="note-sibling note-sibling-next"
              href={`/note/${next.id}`}
            >
              {`${siblingTitles.get(next.id) ?? computeNoteTitle(next)} ›`}
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
