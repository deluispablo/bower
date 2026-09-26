/**
 * Search box mounted in the top bar (`layout.tsx`). Debounces Drive's
 * full-text search, narrows the answer to files in the cached vault index
 * (`search.ts#filterToIndex`; `fullText contains` is not scoped to a
 * folder), and shows a snippet from a note's cached text when one is
 * already in IndexedDB (`cache.ts#loadNote`) — it never fetches a note just
 * to build a snippet.
 *
 * The vault index is read directly from the cache rather than through
 * `useVault()`, which would tie a search box that stays mounted across every
 * route to `VaultProvider`'s own fetch and render cycle (#37 moved it to
 * wrap the whole router in `app.tsx`, but this component predates that and
 * has no need for it: the cache read is enough).
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import { loadIndex, loadNote } from '../cache.js';
import { searchFullText } from '../drive.js';
import type { DriveFile } from '../drive.js';
import {
  filterToIndex,
  loadRecentSearches,
  saveRecentSearch,
  snippet as makeSnippet,
} from '../search.js';
import { buildVaultIndex } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import '../styles/search.css';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

type SearchStatus = 'idle' | 'searching' | 'done' | 'error';

interface Result {
  file: DriveFile;
  snippet: string | null;
}

/** The folder a file lives in: its path with the file's own name removed. */
function folderPath(file: DriveFile): string {
  const cut = file.path.length - file.name.length - 1;
  return cut > 0 ? file.path.slice(0, cut) : '';
}

export function Search() {
  const { route } = useLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<Result[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const indexRef = useRef<VaultIndex | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadIndex()
      .then((cached) => {
        indexRef.current = cached ? buildVaultIndex(cached.files) : null;
      })
      .catch((err: unknown) => {
        console.error(err);
      });
  }, []);

  const runSearch = useCallback((q: string) => {
    const id = ++requestIdRef.current;
    setStatus('searching');
    searchFullText(q)
      .then(async (found) => {
        if (id !== requestIdRef.current) return;
        const index = indexRef.current;
        const matched = index ? filterToIndex(found, index) : [];
        const withSnippets = await Promise.all(
          matched.map(async (file): Promise<Result> => {
            const cached = await loadNote(file.id).catch(() => undefined);
            return {
              file,
              snippet: cached ? makeSnippet(cached.text, q) : null,
            };
          }),
        );
        if (id !== requestIdRef.current) return;
        setResults(withSnippets);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (id !== requestIdRef.current) return;
        console.error(err);
        setResults([]);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current++;
      setStatus('idle');
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      saveRecentSearch(trimmed);
      runSearch(trimmed);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Closes only once focus leaves the whole panel, not while it moves from
  // the input to a recent search or a result inside it — otherwise Tab could
  // never reach them, since the input's own blur would close the panel
  // first.
  const handleFocusOut = useCallback(
    (event: JSX.TargetedFocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next !== null && containerRef.current?.contains(next) === true) {
        return;
      }
      close();
    },
    [close],
  );

  const handleFocus = useCallback(() => {
    setOpen(true);
    setRecent(loadRecentSearches());
  }, []);

  const handleKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        close();
        inputRef.current?.blur();
      }
    },
    [close],
  );

  const selectRecent = useCallback((value: string) => {
    setQuery(value);
    inputRef.current?.focus();
  }, []);

  const goToNote = useCallback(
    (id: string) => {
      close();
      setQuery('');
      route(`/note/${id}`);
    },
    [close, route],
  );

  const trimmed = query.trim();
  const showRecent = open && trimmed === '' && recent.length > 0;
  const showResults = open && trimmed.length >= MIN_QUERY_LENGTH;
  const resultsMessage =
    results.length === 0
      ? `No notes contain ${trimmed}.`
      : `${results.length} result${results.length === 1 ? '' : 's'}.`;

  return (
    <div class="search" ref={containerRef} onFocusOut={handleFocusOut}>
      <input
        ref={inputRef}
        type="search"
        class="search-input"
        placeholder="Search your notes"
        aria-label="Search your notes"
        value={query}
        onInput={(event) => {
          setQuery((event.target as HTMLInputElement).value);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      {(showRecent || showResults) && (
        <div
          class="search-panel"
          onMouseDown={(event) => {
            // Keep focus (and the panel open) when the click lands on a
            // recent search or a result; each handles its own close.
            event.preventDefault();
          }}
        >
          {showRecent && (
            <ul class="search-recent">
              {recent.map((entry) => (
                <li key={entry}>
                  <button
                    type="button"
                    onClick={() => {
                      selectRecent(entry);
                    }}
                  >
                    {entry}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showResults && (
            <>
              <p class="search-status" aria-live="polite">
                {status === 'searching' && 'Searching…'}
                {status === 'error' && 'Search is not available right now.'}
                {status === 'done' && resultsMessage}
              </p>
              {status === 'done' && results.length > 0 && (
                <ul class="search-results">
                  {results.map(({ file, snippet: text }) => (
                    <li key={file.id}>
                      <a
                        href={`/note/${file.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          goToNote(file.id);
                        }}
                      >
                        <span class="search-result-name">{file.name}</span>
                        <span class="search-result-path">
                          {folderPath(file)}
                        </span>
                        {text !== null && (
                          <span class="search-result-snippet">{text}</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
