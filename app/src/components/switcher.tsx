/**
 * The quick switcher (#142, spec §5.1/§5.2): one field that jumps to a note
 * or runs a command. `role="dialog"`, a sheet under the phone's top bar or
 * a centred dialog on desktop (same markup, `styles/switcher.css` tells
 * them apart per breakpoint). Replaces the old top-bar search (`search.tsx`,
 * removed): every opener — Home's search button, the desktop sidebar's
 * filter button, `Ctrl/Cmd + K` in `app.tsx`, and the `/search` route — goes
 * through `openSwitcher()` (`switcher-store.ts`), so #143's Home pill can
 * call it too. The drawer's filter field is not among them (spec §14): it
 * narrows the tree in place instead (`components/tree.tsx`'s `filter`
 * prop), so the switcher stays one tap away rather than replacing the
 * drawer.
 *
 * Notes: the vault index's own names and paths are matched synchronously,
 * before any network round trip (`switcher.ts#rankNotes`, #308); the same
 * debounced Drive full-text search as the old search box
 * (`search.ts#filterToIndex`, the 2-character minimum, recent searches when
 * the field is empty) fills in behind it, both excluding Bower's own files
 * (`vault-index.ts#isAppFile`, via `filterToIndex`'s `showAppFiles` flag).
 * Commands (`switcher.ts#commandsFor`) are always there, query or not, and
 * always last. `rankNotes` ranks and dedupes the two note sources;
 * `mergeResults` appends the commands and highlights the match — the
 * highlighted span itself is drawn here, the pure module only returns
 * offsets.
 *
 * Mounted once in `layout.tsx`; only actually rendered while open, so every
 * open starts from a clean field. Focus (trap, Escape, return-to-opener) is
 * `use-focus-trap.ts`'s hook, same as the explorer drawer; arrow keys and
 * Enter are this component's own, over the merged, highlighted list.
 */

import { Fragment } from 'preact';
import type { JSX } from 'preact';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loadNote } from '../cache.js';
import { searchFullText } from '../drive.js';
import { noteTitle } from '../note-title.js';
import { getPref } from '../prefs.js';
import { pendingCount, useRun } from '../run-store.js';
import {
  filterToIndex,
  loadRecentSearches,
  saveRecentSearch,
  snippet as makeSnippet,
} from '../search.js';
import { closeSwitcher, useSwitcherOpen } from '../switcher-store.js';
import type {
  Command,
  HighlightSpan,
  SwitcherEntry,
  SwitcherNote,
} from '../switcher.js';
import {
  commandsFor,
  folderPath,
  mergeResults,
  rankNotes,
} from '../switcher.js';
import { effectiveTheme, setTheme } from '../theme.js';
import { useVault } from '../vault-store.js';
import { Bird } from './bird.js';
import {
  IconChat,
  IconClose,
  IconInbox,
  IconMoon,
  IconNote,
  IconPlus,
  IconSearch,
  IconSun,
} from './icons.js';
import { useFocusTrap } from './use-focus-trap.js';
import '../styles/switcher.css';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

type SearchStatus = 'idle' | 'searching' | 'done' | 'error';
type NoteEntry = Extract<SwitcherEntry, { kind: 'note' }>;
type CommandEntry = Extract<SwitcherEntry, { kind: 'command' }>;

/** `text`, with the span (if any) wrapped in `<mark>` — no highlight markup leaves `switcher.ts`. */
function Highlighted({
  text,
  span,
}: {
  text: string;
  span: HighlightSpan | null;
}): JSX.Element {
  if (span === null) return <>{text}</>;
  return (
    <>
      {text.slice(0, span.start)}
      <mark class="switcher-match">{text.slice(span.start, span.end)}</mark>
      {text.slice(span.end)}
    </>
  );
}

function commandIcon(command: Command, theme: 'light' | 'dark'): JSX.Element {
  switch (command.id) {
    case 'tidy-up':
      return <IconInbox />;
    case 'add':
      return <IconPlus />;
    case 'tell':
      return <IconChat />;
    case 'theme':
      return theme === 'dark' ? <IconSun /> : <IconMoon />;
  }
}

interface RowProps<E> {
  id: string;
  entry: E;
  selected: boolean;
  theme: 'light' | 'dark';
  onActivate: (entry: SwitcherEntry) => void;
  onHighlight: () => void;
}

function NoteRow({
  id,
  entry,
  selected,
  onActivate,
  onHighlight,
}: RowProps<NoteEntry>): JSX.Element {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      class="switcher-row-item"
    >
      <a
        href={`/note/${entry.file.id}`}
        class="switcher-row"
        data-highlighted={selected}
        onMouseEnter={onHighlight}
        onClick={(event) => {
          event.preventDefault();
          onActivate(entry);
        }}
      >
        <IconNote />
        <span class="switcher-row-text">
          <span class="switcher-row-name">
            <Highlighted text={noteTitle(entry.file)} span={entry.highlight} />
          </span>
          <span class="switcher-row-path">{folderPath(entry.file)}</span>
          {entry.snippet !== null && (
            <span class="switcher-row-snippet">{entry.snippet}</span>
          )}
        </span>
      </a>
    </li>
  );
}

function CommandRow({
  id,
  entry,
  selected,
  theme,
  onActivate,
  onHighlight,
}: RowProps<CommandEntry>): JSX.Element {
  const icon = commandIcon(entry.command, theme);
  const label = <span class="switcher-row-text">{entry.command.label}</span>;
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      class="switcher-row-item"
    >
      {entry.command.href !== undefined ? (
        <a
          href={entry.command.href}
          class="switcher-row"
          data-highlighted={selected}
          onMouseEnter={onHighlight}
          onClick={(event) => {
            event.preventDefault();
            onActivate(entry);
          }}
        >
          {icon}
          {label}
        </a>
      ) : (
        <button
          type="button"
          class="switcher-row"
          data-highlighted={selected}
          onMouseEnter={onHighlight}
          onClick={() => {
            onActivate(entry);
          }}
        >
          {icon}
          {label}
        </button>
      )}
    </li>
  );
}

/** The dialog's contents; mounted only while the switcher is open, so its state always starts clean. */
function SwitcherPanel({
  initialQuery,
}: {
  initialQuery: string;
}): JSX.Element {
  const { route } = useLocation();
  const { index, files } = useVault();
  const { process } = useRun();

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [notes, setNotes] = useState<SwitcherNote[]>([]);
  const [recent] = useState<string[]>(() => loadRecentSearches());
  const [fieldFocused, setFieldFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [theme, setThemeState] = useState(effectiveTheme);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, closeSwitcher);

  const runSearch = useCallback(
    (q: string) => {
      const id = ++requestIdRef.current;
      setStatus('searching');
      searchFullText(q)
        .then(async (found) => {
          if (id !== requestIdRef.current) return;
          const matched =
            index !== null
              ? filterToIndex(found, index, getPref('showAppFiles'))
              : [];
          const withSnippets = await Promise.all(
            matched.map(async (file): Promise<SwitcherNote> => {
              const cached = await loadNote(file.id).catch(() => undefined);
              return {
                file,
                snippet: cached ? makeSnippet(cached.text, q) : null,
              };
            }),
          );
          if (id !== requestIdRef.current) return;
          setNotes(withSnippets);
          setStatus('done');
        })
        .catch((err: unknown) => {
          if (id !== requestIdRef.current) return;
          console.error(err);
          setNotes([]);
          setStatus('error');
        });
    },
    [index],
  );

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestIdRef.current++;
      setStatus('idle');
      setNotes([]);
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

  const commands = useMemo(
    () => commandsFor({ pending: pendingCount(files), theme }),
    [files, theme],
  );

  const trimmed = query.trim();
  const showRecent = trimmed === '' && recent.length > 0;

  // Index names and paths are matched synchronously, from the vault index
  // already loaded — no Drive call, so this never waits on `notes` (the
  // debounced full-text search's own state) to show something (#308).
  const rankedNotes = useMemo(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return [];
    const indexNotes =
      index !== null
        ? filterToIndex(index.notes, index, getPref('showAppFiles'))
        : [];
    return rankNotes(indexNotes, notes, trimmed);
  }, [index, notes, trimmed]);

  const entries = useMemo(
    () => mergeResults(rankedNotes, commands, trimmed),
    [rankedNotes, commands, trimmed],
  );

  // The highlight starts (and resets) on the list's first row whenever the
  // list itself changes shape.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [entries.length, trimmed]);

  const goToNote = useCallback(
    (id: string) => {
      closeSwitcher();
      route(`/note/${id}`);
    },
    [route],
  );

  const runCommand = useCallback(
    (command: Command) => {
      if (command.id === 'tidy-up') {
        closeSwitcher();
        void process();
        return;
      }
      if (command.id === 'theme') {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        setThemeState(nextTheme);
        return;
      }
      if (command.href !== undefined) {
        closeSwitcher();
        route(command.href);
      }
    },
    [process, route, theme],
  );

  const activate = useCallback(
    (entry: SwitcherEntry | undefined) => {
      if (entry === undefined) return;
      if (entry.kind === 'note') {
        goToNote(entry.file.id);
      } else {
        runCommand(entry.command);
      }
    },
    [goToNote, runCommand],
  );

  const selectRecent = useCallback((value: string) => {
    setQuery(value);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, entries.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        activate(entries[highlightedIndex]);
      }
    },
    [entries, highlightedIndex, activate],
  );

  const resultsMessage =
    rankedNotes.length === 0
      ? `No notes contain ${trimmed}.`
      : `${rankedNotes.length} note${rankedNotes.length === 1 ? '' : 's'}.`;

  return (
    <>
      <div
        class="switcher-backdrop"
        aria-hidden="true"
        onClick={closeSwitcher}
      />
      <div
        ref={panelRef}
        class="switcher-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
      >
        <div class="switcher-field">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            class="switcher-input"
            placeholder="Search or jump to a note"
            aria-label="Search or jump to a note"
            role="combobox"
            aria-expanded="true"
            aria-controls="switcher-listbox"
            aria-activedescendant={
              entries.length > 0
                ? `switcher-option-${highlightedIndex}`
                : undefined
            }
            autocomplete="off"
            value={query}
            onInput={(event) => {
              setQuery((event.target as HTMLInputElement).value);
            }}
            onFocus={() => {
              setFieldFocused(true);
            }}
            onBlur={() => {
              setFieldFocused(false);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            class="icon-button"
            aria-label="Close"
            onClick={closeSwitcher}
          >
            <IconClose />
          </button>
          <div class="switcher-bird" aria-hidden="true">
            <Bird state={fieldFocused ? 'shiny' : 'peeking'} flip size={72} />
          </div>
        </div>
        <div class="switcher-body">
          {showRecent && (
            <ul class="switcher-recent">
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
          {trimmed.length >= MIN_QUERY_LENGTH && (
            <p class="switcher-status" aria-live="polite">
              {status === 'searching' && 'Searching…'}
              {status === 'error' && 'Search is not available right now.'}
              {status === 'done' && resultsMessage}
            </p>
          )}
          <ul
            id="switcher-listbox"
            role="listbox"
            aria-label="Notes and commands"
            class="switcher-list"
          >
            {entries.map((entry, at) => {
              const previousKind = at > 0 ? entries[at - 1]?.kind : undefined;
              const header =
                entry.kind !== previousKind
                  ? entry.kind === 'note'
                    ? 'Notes'
                    : 'Commands'
                  : undefined;
              const optionId = `switcher-option-${at}`;
              const selected = at === highlightedIndex;
              const rowKey =
                entry.kind === 'note' ? entry.file.id : entry.command.id;
              return (
                <Fragment key={rowKey}>
                  {header !== undefined && (
                    <li class="switcher-heading" role="presentation">
                      {header}
                    </li>
                  )}
                  {entry.kind === 'note' ? (
                    <NoteRow
                      id={optionId}
                      entry={entry}
                      selected={selected}
                      theme={theme}
                      onActivate={activate}
                      onHighlight={() => {
                        setHighlightedIndex(at);
                      }}
                    />
                  ) : (
                    <CommandRow
                      id={optionId}
                      entry={entry}
                      selected={selected}
                      theme={theme}
                      onActivate={activate}
                      onHighlight={() => {
                        setHighlightedIndex(at);
                      }}
                    />
                  )}
                </Fragment>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

export function Switcher(): JSX.Element | null {
  const { open, initialQuery } = useSwitcherOpen();
  if (!open) return null;
  return <SwitcherPanel initialQuery={initialQuery} />;
}
