import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import {
  AboutPanel,
  closeAbout,
  openAbout,
} from '../components/about-panel.js';
import type { AboutPanelProps } from '../components/about-panel.js';
import { isBowerWritten } from '../bower-written.js';
import { originalDisplayName, resolveOriginal } from '../companion.js';
import { kindById, statusLabel } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { statusOptionLabel } from '../compare.js';
import { changeStatusWithHistory } from '../history.js';
import {
  isMadeForName,
  madeForItem,
  MadeForIt,
} from '../components/made-for-it.js';
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
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { NoteMenu } from '../components/note-menu.js';
import { PendingRequestLine } from '../components/pending-request-line.js';
import type { NoteFolderLink } from '../components/note-properties.js';
import { crumbsFor, PageHeader } from '../components/page-header.js';
import { Pager } from '../components/pager.js';
import { useShellSlot } from '../components/shell-slots.js';
import { tagHref } from '../components/note-properties.js';
import { siblings } from '../folder-view.js';
import { kindLabel, shortDate } from '../meta-line.js';
import { useMediaQuery } from '../use-media-query.js';
import { isProtectedNote } from '../drive.js';
import type { DriveFile, SaveOptions } from '../drive.js';
import { propertiesFor } from '../markdown/frontmatter.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import {
  breadcrumb,
  buildTree,
  displayName,
  folderHref,
  folderOf,
  paraKindOf,
} from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
import { loadNoteMeta, noteMetaFrom, recordNoteMeta } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle as computeNoteTitle } from '../note-title.js';
import { noteHelpTopic, useHelpTopic } from '../help-rows.js';
import { useTitle } from '../use-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { markSeen } from '../seen.js';
import { pendingByPath, siblingNames } from '../rename-request.js';
import { useRequestRows } from '../use-request-rows.js';
import { isAppFile } from '../vault-index.js';
import { ErrorLine, Skeleton } from '../components/system-state.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import { NotFound } from './not-found.js';
import '../styles/about-panel.css';
import '../styles/markdown.css';
import '../styles/note-header.css';

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

/** The status of a note whose kind has statuses (R-NOTE-2). The kind
 * itself is in the meta line ("Bower note"); no chip, no By Bower tag. */
function StatusRow({
  meta,
  status,
  onStatus,
}: {
  meta: NoteMeta;
  status: string;
  onStatus: (status: string) => void;
}): JSX.Element | null {
  const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
  if (kind === undefined || kind.statuses.length === 0) return null;
  return (
    <div class="note-kind-row">
      <StatusSelect
        kind={kind}
        meta={meta}
        value={status}
        onChange={onStatus}
      />
    </div>
  );
}

/**
 * The meta line under the title (R-NO-1, K-15, N-6): the root dot, "Bower
 * note · 29 Sep" ("Note · ..." for your own, "Bower answer · ..." for an
 * answer), then the tags as teal text links to the tag search (#917's
 * route; Back returns here).
 */
function NoteMetaLine({
  file,
  meta,
  created,
  tags,
}: {
  file: DriveFile;
  meta: NoteMeta;
  created: string | undefined;
  tags: readonly string[];
}): JSX.Element {
  const kind = kindLabel({
    name: file.name,
    mimeType: file.mimeType,
    bowerWritten: isBowerWritten(meta),
    answer: meta.type === 'answer',
  });
  const when =
    created !== undefined
      ? shortDay(created)
      : file.modifiedTime === undefined
        ? ''
        : shortDate(file.modifiedTime, Date.now());
  const top = file.path.split('/')[0] ?? '';
  const root = file.path.includes('/') ? paraKindOf(top) : null;
  return (
    <p class="page-header-meta note-meta-line">
      <span>
        <span
          class="page-header-dot"
          data-root={root ?? 'none'}
          aria-hidden="true"
        />
        {when === '' ? kind : `${kind} · ${when}`}
      </span>
      {tags.map((tag) => (
        <a key={tag} class="note-tag" href={tagHref(tag)}>
          #{tag}
        </a>
      ))}
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
  | { status: 'error' };

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
    status,
    refresh,
    getNoteText,
    appendToNote,
    openNoteForEdit,
    saveEditedNote,
    pinNote,
    unpinNote,
  } = useVault();
  const [load, setLoad] = useState<NoteLoad>({ status: 'loading' });
  // Bumped by "Try again" on a load error: fetches the note once more.
  const [attempt, setAttempt] = useState(0);
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
  useTitle(
    file === undefined ? null : displayName(file.name).replace(/\.md$/i, ''),
  );

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

  const currentMeta =
    load.status === 'ready' && load.id === id
      ? noteMetaFrom(load.rendered.frontmatter)
      : null;
  // "Made for it" (R-VERDICT-3): the CVs and letters Bower named for an item
  // wherever they live; their `made_for` says which item they belong to.
  const madeForNotes = useMemo(
    () =>
      index === null || file === undefined || currentMeta === null
        ? []
        : index.notes.filter(
            (note) => note.id !== id && isMadeForName(note.name),
          ),
    [index, file, id, currentMeta === null],
  );
  const madeForMetas = useNoteMetas(madeForNotes);
  // The one sibling list (R-API-9, K-31): About's "In this folder" and the
  // footer both read it, in the tree's own order.
  const sort = getPref('explorerSort');
  const items = useMemo(
    () =>
      index === null || file === undefined
        ? []
        : siblings(file, buildTree(index, sort)),
    [index, file, sort],
  );
  const aboutColumn = useMediaQuery('(min-width: 1200px)');

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
        setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // Re-fetches when the note id changes, or once the index (and so the
    // file it resolves to) becomes available on a cold-start deep link.
  }, [id, index, file, getNoteText, attempt]);

  // The phone bar's Back (#318). The desktop breadcrumb and the ⋯ are the
  // page's own (PageHeader, #906): the shell's crumb and actions slots stay
  // empty (G-10). From 1200 px the About column fills the `aside` slot;
  // below that the (i) opens the same content as a sheet.
  const backContent = useMemo(() => {
    if (file === undefined) return null;
    return <Back crumbs={breadcrumb(file.path)} />;
  }, [file]);
  useShellSlot('back', backContent);

  const aboutProps: AboutPanelProps | null =
    index === null || file === undefined || load.status !== 'ready'
      ? null
      : {
          kind: 'note',
          index,
          file,
          html: load.rendered.html,
          properties: propertiesFor(load.rendered.frontmatter),
          folder: folderLinkFor(file.path),
          meta: noteMetaFrom(load.rendered.frontmatter),
          items,
        };
  const aboutContent = useMemo(
    () =>
      aboutProps === null || !aboutColumn ? null : (
        <AboutPanel {...aboutProps} />
      ),
    // Keyed on the rendered html itself, not the whole `load` (which also
    // changes while still loading, before there is anything new to show).
    [
      index,
      file,
      items,
      aboutColumn,
      load.status === 'ready' ? load.rendered.html : null,
    ],
  );
  useShellSlot('aside', aboutContent);
  const bowerMeta = aboutProps?.meta;
  useHelpTopic(
    noteHelpTopic(
      file?.path,
      bowerMeta !== undefined && isBowerNote(bowerMeta),
    ),
  );
  // The column took over, or another note opened: the sheet goes.
  useEffect(() => {
    closeAbout();
  }, [id, aboutColumn]);

  if (index === null) {
    return (
      <section>
        {status === 'error' ? (
          <ErrorLine what="note" onRetry={() => void refresh()} />
        ) : (
          <Skeleton shape="properties" count={6} />
        )}
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

  /** Closes Add a paragraph and hands focus back to the ⋯ it came from,
   * as Rename… and Pin do (T-22); after the sheet's own focus return. */
  function closeAppend(): void {
    setAppendOpen(false);
    requestAnimationFrame(() => {
      const more = [
        ...document.querySelectorAll<HTMLElement>('.page-header-more'),
      ].find((button) => button.offsetParent !== null);
      more?.focus();
    });
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
      <PageHeader
        title={title}
        kind="note"
        crumbs={crumbsFor(file.path)}
        more={{
          expanded: menuOpen,
          onClick: () => setMenuOpen((open) => !open),
          name: title,
        }}
        {...(aboutProps !== null && {
          onAbout: () => openAbout(aboutProps),
        })}
      />
      {menuOpen && (
        <NoteMenu
          file={file}
          title={title}
          typeLabel="Note"
          askName={title}
          bowerWritten={bowerHeader}
          canEdit={canEdit}
          canAppend={canAppend}
          pinned={index.notePinnedAt.has(file.id)}
          onTogglePin={() => void handleTogglePin()}
          onAddParagraph={() => setAppendOpen(true)}
          onEdit={() => void handleEdit()}
          siblingNames={siblingNames(index, file.path)}
          pendingRename={
            pendingByPath(requests).get(file.path)?.kind === 'rename'
          }
          pendingMove={pendingByPath(requests).get(file.path)?.kind === 'move'}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!isEditing && meta !== null && properties !== null && (
        <NoteMetaLine
          file={file}
          meta={meta}
          created={properties.created}
          tags={properties.tags}
        />
      )}
      {!isEditing && bowerHeader && meta !== null && (
        <StatusRow
          meta={meta}
          status={(statusPick ?? meta.status ?? '').toLowerCase()}
          onStatus={(status) => void handleStatus(status)}
        />
      )}
      <PendingRequestLine path={file.path} rows={requests} />
      {editError !== null && (
        <p class="auth-error" role="alert">
          {editError}
        </p>
      )}

      {!isEditing && bowerHeader && meta !== null && properties !== null && (
        <>
          {subtitle !== undefined && <p class="note-subtitle">{subtitle}</p>}
          <MadeFrom
            apply={applyLinkOf(meta.fields.apply_link)}
            sources={madeFromSources({
              note: file,
              original: meta.original,
              source: meta.fields.source,
              kind: meta.kind,
              lookup: index,
            }).flatMap((source) =>
              !source.key.startsWith('original:')
                ? [source]
                : textCopy !== null
                  ? [{ ...source, role: 'the original' }]
                  : // The file it was made from is About's Source row
                    // (NO-Main: nothing between the meta line and the box).
                    [],
            )}
          />
          <MadeForIt
            notes={madeForItem(
              { path: file.path, title },
              madeForNotes.flatMap((note) => {
                const noteMeta = madeForMetas.get(note.id);
                return noteMeta === undefined
                  ? []
                  : [{ file: note, meta: noteMeta }];
              }),
            )}
          />
        </>
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

      {!isEditing && load.status === 'loading' && (
        <Skeleton shape="properties" count={6} />
      )}
      {!isEditing && load.status === 'offline' && (
        <p>Offline: this note is not saved on this device yet.</p>
      )}
      {!isEditing && load.status === 'error' && (
        <ErrorLine
          what="note"
          onRetry={() => {
            setAttempt((n) => n + 1);
          }}
        />
      )}
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
            <AppendForm
              key={id}
              onAppend={handleAppend}
              onClose={closeAppend}
            />
          )}
        </>
      )}

      <Pager id={file.id} items={items} folder={folderLink ?? null} />
    </section>
  );
}
