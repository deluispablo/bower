import { useEffect, useState } from 'preact/hooks';

import { pendingCount, recentNotes, relativeTime } from '../navigation.js';
import { formatAgo, useVault } from '../vault-store.js';

const MINUTE_MS = 60_000;

export function Home() {
  const { index, files, fetchedAt, status, refresh } = useVault();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const recent = index === null ? [] : recentNotes(index);
  const pending = pendingCount(files);
  const refreshing = status === 'refreshing';

  return (
    <section>
      <div class="home-header">
        <h1>Your notes</h1>
        <button
          type="button"
          class="button"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {fetchedAt !== null && (
        <p class="home-updated">Updated {formatAgo(fetchedAt, now)}</p>
      )}
      {status === 'offline' && (
        <p class="home-status" role="status" aria-live="polite">
          Offline: showing saved notes
        </p>
      )}
      {status === 'error' && (
        <p class="home-status" role="status" aria-live="polite">
          Could not load your notes.
        </p>
      )}

      <div class="home-card">
        <h2>Inbox</h2>
        <p class="home-card-count">{pending}</p>
        <p>
          {pending > 0
            ? "Tap Tidy up and I'll file them."
            : 'Nothing waiting to be filed.'}
        </p>
      </div>

      <a class="home-card home-card-link" href="/#folder=Answers">
        <h2>Answers</h2>
        <p>Things Bower answered for you.</p>
      </a>

      <h2 class="home-section-title">Recent</h2>
      {recent.length === 0 ? (
        <p>Nothing here yet.</p>
      ) : (
        <ul class="home-notes">
          {recent.map((note) => (
            <li key={note.id}>
              <a href={`/note/${note.id}`}>{note.name}</a>
              <span class="home-note-meta">
                {note.path}
                {note.modifiedTime !== undefined &&
                  ` · ${relativeTime(note.modifiedTime, now)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
