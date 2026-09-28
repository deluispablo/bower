import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { AboutPanel } from '../components/about-panel.js';
import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { BackLink } from '../components/back-link.js';
import { MoreButton } from '../components/more-button.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { NoteMenu } from '../components/note-menu.js';
import {
  NotePropertiesSheet,
  NotePropertiesTrigger,
  hasNoteProperties,
} from '../components/note-properties.js';
import type { NoteFolderLink } from '../components/note-properties.js';
import { useShellSlot } from '../components/shell-slots.js';
import { isProtectedNote } from '../drive.js';
import type { SaveOptions } from '../drive.js';
import { propertiesFor } from '../markdown/frontmatter.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { breadcrumb, folderHref, folderOf, siblings } from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
import { noteTitle as computeNoteTitle } from '../note-title.js';
import { runPinAction } from '../pin-action.js';
import { isAppFile } from '../vault-index.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import { NotFound } from './not-found.js';
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
  const name = parent.slice(parent.lastIndexOf('/') + 1);
  return { name, href: folderHref(parent) };
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
  const [propertiesOpen, setPropertiesOpen] = useState(false);

  // Leaving a note (after confirming, if there were unsaved changes) drops
  // its edit, so coming back shows the note rather than a stale editor.
  useEffect(() => {
    setEditing(null);
    setEditError(null);
    setMenuOpen(false);
    setAppendOpen(false);
    setPropertiesOpen(false);
  }, [id]);

  const file = index?.byId.get(id);

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
    return <NotFound />;
  }

  const { prev, next } = siblings(index, file.id);
  const properties =
    load.status === 'ready' ? propertiesFor(load.rendered.frontmatter) : null;
  const folderLink = folderLinkFor(file.path);
  const hasProperties =
    properties !== null && hasNoteProperties(folderLink, properties);

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
              noteName={title}
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

      {hasProperties && properties !== null && (
        <NotePropertiesTrigger onClick={() => setPropertiesOpen(true)} />
      )}
      {propertiesOpen && hasProperties && properties !== null && (
        <NotePropertiesSheet
          folder={folderLink}
          properties={properties}
          onClose={() => setPropertiesOpen(false)}
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
          <NoteBody html={load.rendered.html} />
          {canAppend && appendOpen && (
            <AppendForm key={id} onAppend={handleAppend} />
          )}
        </>
      )}

      {(prev !== null || next !== null) && (
        <nav class="note-siblings" aria-label="Notes in this folder">
          {prev !== null ? (
            <a href={`/note/${prev.id}`}>← {computeNoteTitle(prev)}</a>
          ) : (
            <span />
          )}
          {next !== null && (
            <a href={`/note/${next.id}`}>{computeNoteTitle(next)} →</a>
          )}
        </nav>
      )}
    </section>
  );
}
