import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { AboutPanel } from '../components/about-panel.js';
import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { IconChevronRight, IconMore } from '../components/icons.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { NoteMenu } from '../components/note-menu.js';
import { useShellSlot } from '../components/shell-slots.js';
import { isProtectedNote } from '../drive.js';
import type { SaveOptions } from '../drive.js';
import { propertiesFor } from '../markdown/frontmatter.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { breadcrumb, folderHref, siblings } from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
import { runPinAction } from '../pin-action.js';
import { isAppFile } from '../vault-index.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import '../styles/markdown.css';

interface CrumbProps {
  crumbs: BreadcrumbSegment[];
}

/**
 * The shell header's `crumb` slot content (spec §6 row Note, issue #144):
 * the phone back link (the immediate parent folder, or Home for a
 * top-level note) and the desktop breadcrumb, both always in the markup —
 * `layout.css` shows only the one that fits the breakpoint, the same way
 * it already does for the wordmark and the theme toggle.
 */
function Crumb({ crumbs }: CrumbProps): JSX.Element {
  const parent = crumbs[crumbs.length - 1];
  return (
    <>
      <a
        class="topbar-back"
        href={parent === undefined ? '/' : folderHref(parent.path)}
      >
        <IconChevronRight />
        <span class="topbar-back-label">
          {parent === undefined ? 'Home' : parent.name}
        </span>
      </a>
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

interface MoreButtonProps {
  expanded: boolean;
  onClick: () => void;
  class?: string;
}

/** The note's one "more" menu trigger (#210): shown twice in the markup —
 * this one in the shell header's `actions` slot for the phone, another in
 * `.note-header-actions` for desktop — `layout.css` and `note-menu.css`
 * show only the one that fits the breakpoint, the same way the shell
 * already does for the crumb slot vs the breadcrumb. */
function MoreButton({
  expanded,
  onClick,
  class: className,
}: MoreButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={
        className === undefined ? 'icon-button' : `icon-button ${className}`
      }
      aria-label="More"
      title="More"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <IconMore />
    </button>
  );
}

type NoteLoad =
  | { status: 'loading' }
  | { status: 'ready'; id: string; rendered: RenderedNote }
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

  // Leaving a note (after confirming, if there were unsaved changes) drops
  // its edit, so coming back shows the note rather than a stale editor.
  useEffect(() => {
    setEditing(null);
    setEditError(null);
    setMenuOpen(false);
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
          rendered: renderNote(text, index, { path: file.path }),
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
    return <AboutPanel index={index} file={file} html={load.rendered.html} />;
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
    return (
      <section>
        <p>This note is not in your Bower folder.</p>
      </section>
    );
  }

  const { prev, next } = siblings(index, file.id);
  const properties =
    load.status === 'ready' ? propertiesFor(load.rendered.frontmatter) : null;
  const hasProperties =
    properties !== null &&
    (properties.tags.length > 0 ||
      properties.created !== undefined ||
      properties.source !== undefined);

  function showText(text: string): void {
    if (index === null || file === undefined) return;
    setLoad({
      status: 'ready',
      id,
      rendered: renderNote(text, index, { path: file.path }),
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
  const noteTitle = file.name.replace(/\.md$/i, '');
  // "Edit the text" (the note menu) is left out for Bower's own files (spec
  // §14) — a broader set than `isProtectedNote`, which only blocks the
  // actual save (drive.ts): About-Me.md and README.md, say, are technically
  // writable but not offered here, on purpose.
  const canEdit = !isAppFile(file.path, file.name) && !isEditing;

  return (
    <section class="note-view">
      <div class="note-edit-header">
        <h1>{noteTitle}</h1>
        <div class="note-header-actions">
          <MoreButton
            class="note-header-more"
            expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          />
          {menuOpen && (
            <NoteMenu
              file={file}
              noteName={noteTitle}
              canEdit={canEdit}
              pinned={index.notePinnedAt.has(file.id)}
              onTogglePin={() => void handleTogglePin()}
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
        <div class="note-properties">
          {properties.tags.length > 0 && (
            <ul class="tags">
              {properties.tags.map((tag) => (
                <li key={tag}>
                  <a
                    class="tag"
                    href={`/search?q=${encodeURIComponent(`#${tag}`)}`}
                  >
                    #{tag}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {properties.created !== undefined && (
            <span class="note-property">
              <span class="note-property-label">Created</span>
              {properties.created}
            </span>
          )}
          {properties.source !== undefined && (
            <span class="note-property">
              <span class="note-property-label">Source</span>
              {properties.source}
            </span>
          )}
        </div>
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
          {!isProtectedNote(file.name) && (
            <AppendForm key={id} onAppend={handleAppend} />
          )}
        </>
      )}

      {(prev !== null || next !== null) && (
        <nav class="note-siblings" aria-label="Notes in this folder">
          {prev !== null ? (
            <a href={`/note/${prev.id}`}>← {prev.name.replace(/\.md$/i, '')}</a>
          ) : (
            <span />
          )}
          {next !== null && (
            <a href={`/note/${next.id}`}>{next.name.replace(/\.md$/i, '')} →</a>
          )}
        </nav>
      )}
    </section>
  );
}
