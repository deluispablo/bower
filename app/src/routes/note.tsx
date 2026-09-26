import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';

import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { breadcrumb, siblings } from '../navigation.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/markdown.css';

type NoteLoad =
  | { status: 'loading' }
  | { status: 'ready'; rendered: RenderedNote }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export function Note() {
  const { params } = useRoute();
  const id = params.id ?? '';
  const { index, getNoteText } = useVault();
  const [load, setLoad] = useState<NoteLoad>({ status: 'loading' });

  const file = index?.byId.get(id);

  useEffect(() => {
    if (index === null || file === undefined) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    getNoteText(id)
      .then((text) => {
        if (cancelled) return;
        setLoad({ status: 'ready', rendered: renderNote(text, index) });
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

      <h1>{file.name.replace(/\.md$/i, '')}</h1>

      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'offline' && (
        <p>Offline: this note is not saved on this device yet.</p>
      )}
      {load.status === 'error' && <p>{load.message}</p>}
      {load.status === 'ready' && (
        <>
          {load.rendered.frontmatterHtml !== '' && (
            <div
              dangerouslySetInnerHTML={{
                __html: load.rendered.frontmatterHtml,
              }}
            />
          )}
          <div
            class="markdown"
            dangerouslySetInnerHTML={{ __html: load.rendered.html }}
          />
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
