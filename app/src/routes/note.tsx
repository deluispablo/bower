import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { AppFileBanner } from '../components/app-file-banner.js';
import { AppendForm } from '../components/append-form.js';
import { NoteBody } from '../components/note-body.js';
import { NoteEditor } from '../components/note-editor.js';
import { isProtectedNote } from '../drive.js';
import type { SaveOptions } from '../drive.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { breadcrumb, siblings } from '../navigation.js';
import { isAppFile } from '../vault-index.js';
import { OfflineError, useVault } from '../vault-store.js';
import type { EditableNote } from '../vault-store.js';
import '../styles/markdown.css';

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

  const crumbs = breadcrumb(file.path);
  const { prev, next } = siblings(index, file.id);

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

      <div class="note-edit-header">
        <h1>{file.name.replace(/\.md$/i, '')}</h1>
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
      {editError !== null && (
        <p class="auth-error" role="alert">
          {editError}
        </p>
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
          {load.rendered.frontmatterHtml !== '' && (
            <div
              dangerouslySetInnerHTML={{
                __html: load.rendered.frontmatterHtml,
              }}
            />
          )}
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
