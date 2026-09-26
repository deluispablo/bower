import { useEffect, useState } from 'preact/hooks';

import { formatAgo, useVault } from '../vault-store.js';

const MINUTE_MS = 60_000;

export function Home() {
  const { index, fetchedAt, status, refresh } = useVault();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const notes = index?.notes ?? [];
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
        <p class="home-status">Offline: showing saved notes</p>
      )}
      {status === 'error' && (
        <p class="home-status">Could not load your notes.</p>
      )}
      {notes.length === 0 ? (
        <p>Nothing here yet.</p>
      ) : (
        <ul class="home-notes">
          {notes.map((note) => (
            <li key={note.id}>
              <a href={`/note/${note.id}`}>{note.name}</a>
              <span class="home-note-path">{note.path}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
