import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import {
  AboutPanel,
  originalFileOf,
  originalSummary,
} from '../components/about-panel.js';
import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { BackLink } from '../components/back-link.js';
import { Details } from '../components/details.js';
import { FolderMark } from '../components/folder-mark.js';
import { KeyFacts } from '../components/key-facts.js';
import { MoreButton } from '../components/more-button.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { NoteMenu } from '../components/note-menu.js';
import type { NoteFolderLink } from '../components/note-properties.js';
import { useShellSlot } from '../components/shell-slots.js';
import { BowerTag } from '../components/tags.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { isProtectedNote } from '../drive.js';
import type { DriveFile, SaveOptions } from '../drive.js';
import { keyFactsFor, kindById } from '../kinds.js';
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
import { noteMetaFrom } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { noteTitle as computeNoteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import type { ExplorerSortPref } from '../prefs.js';
import { markSeen } from '../seen.js';
import { isAppFile } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import { NotFound } from './not-found.js';
import '../styles/about-panel.css';
import '../styles/markdown.css';

interface CrumbProps {
  crumbs: BreadcrumbSegment[];
  title: string;
}

/** The phone top bar's Back (#318): the immediate parent folder, or Home
 * for a top-level note. */
function Back({ crumbs }: { crumbs: BreadcrumbSegment[] }): JSX.Element {
  const parent = crumbs[crumbs.length - 1];
  return parent === undefined ? (
    <BackLink href="/" label="Home" />
  ) : (
    <BackLink href={folderHref(parent.path)} label={parent.name} />
  );
}

/**
 * The shell header's `crumb` slot content (spec §6 row Note, issues #144,
 * #318): the phone title (the note's) and the desktop breadcrumb, both
 * always in the markup — `layout.css` shows only the one that fits the
 * breakpoint, the same way it already does for the theme toggle.
 */
function Crumb({ crumbs, title }: CrumbProps): JSX.Element {
  return (
    <>
      <span class="topbar-title">{title}</span>
      {crumbs.length > 0 && (
        <nav class="breadcrumb" aria-label="Folder">
          {crumbs.map((crumb) => (
            <span key={crumb.path}>
              <a href={folderHref(crumb.path)}>{crumb.name}</a>
              <span aria-hidden="true"> / </span>
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

/** Bower wrote this note: it has a kind, an original, origins or is an
 * answer. */
export function isBowerNote(meta: NoteMeta): boolean {
  return (
    meta.kind !== undefined ||
    meta.original !== undefined ||
    meta.type === 'answer' ||
    Object.keys(meta.bowerOrigins).length > 0
  );
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
): FolderWalk {
  const none: FolderWalk = { prev: null, next: null, position: 0, total: 0 };
  const file = index.byId.get(id);
  if (file === undefined) return none;
  const folder = folderOf(file.path);
  const inFolder = index.notes
    .filter(
      (note) =>
        folderOf(note.path) === folder &&
        (showAppFiles || note.id === id || !isAppFile(note.path, note.name)),
    )
    .sort((a, b) =>
      sort === 'modified'
        ? (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '') ||
          a.name.localeCompare(b.name, undefined, { numeric: true })
        : a.name.localeCompare(b.name, undefined, {
            sensitivity: 'base',
            numeric: true,
          }),
    );
  const at = inFolder.findIndex((note) => note.id === id);
  if (at === -1) return none;
  return {
    prev: at > 0 ? (inFolder[at - 1] ?? null) : null,
    next: at < inFolder.length - 1 ? (inFolder[at + 1] ?? null) : null,
    position: at + 1,
    total: inFolder.length,
  };
}

/**
 * Splits a rendered note at the end of its opening Bower boxes: what comes
 * first (Bower's note and "Joined from") and the rest (the contents strip
 * and the body). Key facts and Details sit between the two (board
 * `Phone-Note-Details`). A note that does not open with a box has an empty
 * `top`.
 */
export function splitOpening(html: string): { top: string; rest: string } {
  const template = document.createElement('template');
  template.innerHTML = html;
  const top: string[] = [];
  const children = Array.from(template.content.children);
  let taken = 0;
  for (const child of children) {
    if (
      !child.classList.contains('bower-note') &&
      !child.classList.contains('bower-joined')
    ) {
      break;
    }
    top.push(child.outerHTML);
    taken += 1;
  }
  const rest = children
    .slice(taken)
    .map((child) => child.outerHTML)
    .join('\n');
  return { top: top.join('\n'), rest };
}

/** "a rental listing" / "an invoice". */
function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

function PropsLine({
  index,
  file,
  meta,
  tags,
  created,
  folder,
}: {
  index: VaultIndex;
  file: DriveFile;
  meta: NoteMeta;
  tags: string[];
  created: string | undefined;
  folder: NoteFolderLink | undefined;
}): JSX.Element | null {
  const original = originalFileOf(index, file, meta.original);
  const summary = originalSummary(meta);
  const date = shortDay(created ?? file.modifiedTime);
  const top = file.path.split('/')[0] ?? '';
  const para = file.path.includes('/') ? paraKindOf(top) : null;
  const bower = isBowerNote(meta);
  if (
    !bower &&
    tags.length === 0 &&
    date === '' &&
    folder === undefined &&
    meta.original === undefined
  ) {
    return null;
  }
  return (
    <p class="note-props">
      {bower && <BowerTag />}
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
      {meta.original !== undefined &&
        (original === undefined ? (
          <span>{`Original: ${summary}`}</span>
        ) : (
          <a href={`/file/${original.id}`}>{`Original: ${summary}`}</a>
        ))}
      {folder !== undefined && (
        <a class="note-props-folder" href={folder.href}>
          {para !== null && <FolderMark kind={para} size={18} />}
          {folder.name}
        </a>
      )}
    </p>
  );
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

  // Leaving a note (after confirming, if there were unsaved changes) drops
  // its edit, so coming back shows the note rather than a stale editor.
  useEffect(() => {
    setEditing(null);
    setEditError(null);
    setMenuOpen(false);
    setAppendOpen(false);
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
    const original = originalFileOf(
      index,
      file,
      noteMetaFrom(load.rendered.frontmatter).original,
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
  const { prev, next, position, total } =
    index === null
      ? { prev: null, next: null, position: 0, total: 0 }
      : walkFolder(index, id, getPref('showAppFiles'), getPref('explorerSort'));
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

  // The bar's title is the note's title (#380's `noteTitle`), once its text
  // is here to read a frontmatter title or heading from.
  const readyText =
    load.status === 'ready' && load.id === id ? load.text : undefined;
  const crumbContent = useMemo(() => {
    if (file === undefined) return null;
    return (
      <Crumb
        crumbs={breadcrumb(file.path)}
        title={computeNoteTitle(file, readyText)}
      />
    );
  }, [file, readyText]);
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
  const kind = meta?.kind === undefined ? undefined : kindById(meta.kind);
  const facts =
    kind === undefined || meta === null ? [] : keyFactsFor(kind, meta.fields);
  const opening =
    load.status === 'ready' ? splitOpening(load.rendered.html) : null;
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
    load.status === 'ready' && load.id === id
      ? computeNoteTitle(file, load.text)
      : computeNoteTitle(file);
  // "Edit the text" (the note menu) is left out for Bower's own files (spec
  // §14) — a broader set than `isProtectedNote`, which only blocks the
  // actual save (drive.ts): About-Me.md and README.md, say, are technically
  // writable but not offered here, on purpose.
  const canEdit = !isAppFile(file.path, file.name) && !isEditing;
  const canAppend = !isProtectedNote(file.name);

  return (
    <section class="note-view">
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
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
      {editError !== null && (
        <p class="auth-error" role="alert">
          {editError}
        </p>
      )}

      {!isEditing && meta !== null && properties !== null && (
        <PropsLine
          index={index}
          file={file}
          meta={meta}
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
            <NoteBody html={opening.top} />
          )}
          {kind !== undefined && meta !== null && facts.length > 0 && (
            <>
              <p class="note-keyfacts-caption">
                {`Key facts for ${withArticle(kind.name)}: set in your rules, the same for every ${kind.name.split(' ').pop() ?? kind.name}`}
              </p>
              <KeyFacts facts={facts} />
            </>
          )}
          {kind !== undefined && meta !== null && (
            <Details kind={kind} meta={meta} />
          )}
          <NoteBody html={opening?.rest ?? ''} />
          {canAppend && appendOpen && (
            <AppendForm key={id} onAppend={handleAppend} />
          )}
        </>
      )}

      {(prev !== null || next !== null) && (
        <nav class="note-siblings" aria-label="Notes in this folder">
          {prev !== null ? (
            <a href={`/note/${prev.id}`}>
              ← {siblingTitles.get(prev.id) ?? computeNoteTitle(prev)}
            </a>
          ) : (
            <span />
          )}
          <span class="note-siblings-count">{`${String(position)} of ${String(total)}`}</span>
          {next !== null ? (
            <a href={`/note/${next.id}`}>
              {siblingTitles.get(next.id) ?? computeNoteTitle(next)} →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
