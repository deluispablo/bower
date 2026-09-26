import { useEffect, useState } from 'preact/hooks';

import { NoteBody } from '../components/note-body.js';
import { findReport } from '../health-report.js';
import { renderNote } from '../markdown/render.js';
import type { RenderedNote } from '../markdown/render.js';
import { setPref } from '../prefs.js';
import { OfflineError, useVault } from '../vault-store.js';
import '../styles/markdown.css';

type ReportLoad =
  | { status: 'loading' }
  | { status: 'ready'; rendered: RenderedNote }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/**
 * The weekly health check (`Lint Report.md`), rendered like any note.
 * Opening it records the time, which clears the badge in the navigation.
 */
export function Health() {
  const { index, status, error, getNoteText } = useVault();
  const [load, setLoad] = useState<ReportLoad>({ status: 'loading' });

  const file = index === null ? undefined : findReport(index);
  const modifiedTime = file?.modifiedTime;

  // Seen now, or at the report's own time if the device clock lags behind
  // Drive's, so the badge does not come back for a report already read.
  useEffect(() => {
    if (modifiedTime === undefined) return;
    const now = new Date().toISOString();
    setPref(
      'healthSeenAt',
      Date.parse(modifiedTime) > Date.parse(now) ? modifiedTime : now,
    );
  }, [modifiedTime]);

  useEffect(() => {
    if (index === null || file === undefined) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    getNoteText(file.id)
      .then((text) => {
        if (cancelled) return;
        setLoad({
          status: 'ready',
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
        setLoad({
          status: 'error',
          message: 'Could not load the health check.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [index, file, getNoteText]);

  if (index === null && (status === 'loading' || status === 'error')) {
    return (
      <section>
        <h1>Health check</h1>
        <p>
          {status === 'error'
            ? (error ?? 'Could not load your notes.')
            : 'Loading…'}
        </p>
      </section>
    );
  }

  // Also covers a user with no Bower folder yet (no index at all).
  if (file === undefined) {
    return (
      <section>
        <h1>Health check</h1>
        <p>No health check yet. Bower runs one every Sunday.</p>
      </section>
    );
  }

  return (
    <section class="note-view">
      <h1>Health check</h1>

      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'offline' && (
        <p>Offline: the health check is not saved on this device yet.</p>
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
          <NoteBody html={load.rendered.html} />
        </>
      )}
    </section>
  );
}
