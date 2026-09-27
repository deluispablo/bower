import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { AboutPanel } from '../components/about-panel.js';
import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { IconChevronRight, IconExternalLink } from '../components/icons.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { useShellSlot } from '../components/shell-slots.js';
import { isProtectedNote } from '../drive.js';
import type { DriveFile, SaveOptions } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import { propertiesFor } from '../markdown/frontmatter.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { breadcrumb, siblings } from '../navigation.js';
import type { BreadcrumbSegment } from '../navigation.js';
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
        href={
          parent === undefined
            ? '/'
            : `/#folder=${encodeURIComponent(parent.path)}`
        }
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
              <a href={`/#folder=${encodeURIComponent(crumb.path)}`}>
                {crumb.name}
              </a>
              <span aria-hidden="true"> / </span>
            </span>
          ))}
        </nav>
      )}
    </>
  );
}

/** The shell header's `actions` slot content on a phone (issue #144): the
 * desktop screen already has "Open in Drive" next to the title, so this is
 * hidden there (`layout.css`) rather than shown twice. */
function TopbarActions({ file }: { file: DriveFile }): JSX.Element {
  return (
    <a
      class="icon-button"
      aria-label="Open in Drive"
      title="Open in Drive"
      href={driveViewUrl(file)}
      target="_blank"
      rel="noopener"
    >
      <IconExternalLink />
    </a>
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
  const { index, getNoteText, appendToNote, openNoteForEdit, saveEditedNote } =
    useVault();
  const [load, setLoad] = useState<NoteLoad>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [opening, setOpening] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Leaving a note (after confirming, if there were unsaved changes) drops
  // its edit, so coming back shows the note rather than a stale editor.
  useEffect(() => {
    setEditing(null);
    setEditError(null);
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
    return <TopbarActions file={file} />;
  }, [file]);
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

  async function handleEdit(): Promise<void> {
    setOpening(true);
    setEditError(null);
    try {
      setEditing({ id, note: await openNoteForEdit(id) });
    } catch (err) {
      console.error(err);
      setEditError('Could not open this note for editing. Try again.');
    } finally {
      setOpening(false);
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
  const canEdit =
    !isProtectedNote(file.name) && load.status === 'ready' && !isEditing;

  return (
    <section class="note-view">
      <div class="note-edit-header">
        <h1>{file.name.replace(/\.md$/i, '')}</h1>
        <div class="note-header-actions">
          <a
            class="button-link"
            href={driveViewUrl(file)}
            target="_blank"
            rel="noopener"
          >
            Open in Drive
          </a>
          {canEdit && (
            <button
              type="button"
              class="button"
              disabled={opening}
              onClick={() => void handleEdit()}
            >
              {opening ? 'Opening…' : 'Edit'}
            </button>
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
