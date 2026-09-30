/**
 * Compare (issue #612, spec §6.6, boards `Phone-Folder-Compare` and
 * `Desktop-Compare`): the notes of one kind side by side. Cards with a Best
 * fit chip and filter chips on a phone; a sortable table on a desktop, with
 * columns that drag (or move from a header menu) and a Status that can be
 * changed in place. The folder screen mounts it as a tab (#613).
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { loadViewSettings, saveViewSettings } from '../cache.js';
import type { ViewSettings } from '../cache.js';
import {
  applyFilters,
  askQuestion,
  askSubject,
  bookingsTimeline,
  applyHref,
  cellText,
  compareColumns,
  compareKinds,
  defaultSort,
  desktopExplainer,
  directionLabels,
  dropColumn,
  columnExtras,
  fadedLine,
  firstDirection,
  filterChips,
  footerLine,
  moveColumn,
  madeForBadge,
  shownColumns,
  tableMarkdown,
  toggleColumn,
  noteTitle,
  notesOfKind,
  numberOf,
  offerWord,
  orderedColumnIds,
  phoneExplainer,
  receiptsByMonth,
  receiptsExplainer,
  SCORE_LABEL,
  sortButtonText,
  sortNotes,
  sortStyle,
  statusOptionLabel,
  STATUS_COLUMN,
  statusValue,
  TITLE_COLUMN,
  timelineExplainer,
} from '../compare.js';
import type { CompareColumn, CompareNote, CompareSort } from '../compare.js';
import { getText } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { changeStatusWithHistory } from '../history.js';
import { keyFactsFor, statusLabel } from '../kinds.js';
import { madeForItem } from './made-for-it.js';
import type { MadeForCandidate } from './made-for-it.js';
import type { Kind } from '../kinds.js';
import { loadNoteMeta, recordNoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import { OriginSquare } from './folder-mark.js';
import { Hint } from './hint.js';
import { IconClose, IconSparkle } from './icons.js';
import { Overlay } from './overlay.js';
import { openSendToBower } from './send-to-bower.js';

import '../styles/compare.css';

/** Where the table replaces the cards: the shell's desktop width. */
const DESKTOP_QUERY = '(min-width: 900px)';

/** The folder's `viewSettings` with the Compare column order, column choice
 * and sort it remembers (R-CMP-4, R-CMP-7). */
type CompareViewSettings = ViewSettings;

/** A stored sort, or `undefined` when it is not one. */
function readSort(raw: unknown): CompareSort | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { column, direction } = raw as Record<string, unknown>;
  if (typeof column !== 'string') return undefined;
  if (direction !== 'asc' && direction !== 'desc') return undefined;
  return { column, direction };
}

/** The notes among `files` that name a kind, read from their frontmatter
 * (cached per note). A note that cannot be read is left out, with the
 * reason in the console. */
export async function loadCompareNotes(
  files: readonly DriveFile[],
): Promise<CompareNote[]> {
  const markdown = files.filter(
    (file) =>
      file.mimeType === 'text/markdown' ||
      file.name.toLowerCase().endsWith('.md'),
  );
  const loaded = await Promise.all(
    markdown.map(async (file) => {
      try {
        return { file, meta: await loadNoteMeta(file) };
      } catch (error: unknown) {
        console.error('Reading a note for Compare failed', error);
        return null;
      }
    }),
  );
  const readable = loaded.filter((entry) => entry !== null);
  // The notes Bower made for an item say so themselves (`made_for`).
  const candidates: MadeForCandidate[] = readable.filter(
    ({ meta }) => meta.fields.made_for !== undefined,
  );
  const notes: CompareNote[] = [];
  for (const { file, meta } of readable) {
    if (meta.kind === undefined) continue;
    const madeFor = madeForItem(
      { path: file.path, title: file.name.replace(/\.md$/i, '') },
      candidates,
    ).map((made) => made.name);
    notes.push({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime ?? null,
      kind: meta.kind,
      fields: meta.fields,
      bowerOrigins: meta.bowerOrigins,
      ...(madeFor.length === 0 ? {} : { madeFor }),
    });
  }
  return notes;
}

export interface CompareViewProps {
  notes: readonly CompareNote[];
  /** The folder's path: the column order is remembered under it. */
  folderPath: string;
  /** Which kind to line up; the folder's first comparable kind by default. */
  kindId?: string;
}

function noteHref(note: CompareNote): string {
  return `/note/${encodeURIComponent(note.id)}`;
}

function fitTone(value: number): 'good' | 'warm' {
  return value >= 70 ? 'good' : 'warm';
}

/** The note's score as the pill reads it: `score`, else `fit`, a whole
 * number from 0 to 100; `null` when it has neither. */
function scoreOf(note: CompareNote): number | null {
  for (const key of ['score', 'fit']) {
    const value = numberOf(note.fields[key]);
    if (value !== null && value >= 0 && value <= 100) return Math.round(value);
  }
  return null;
}

/** The phone's Sort sheet (R-CMP-1, board `Compare-Sort-375`): what to sort
 * by, which way, and a button that says how many notes it shows. Choices
 * apply as they are made. */
function SortSheet({
  kind,
  columns,
  extras,
  sort,
  count,
  onSort,
  onClose,
}: {
  kind: Kind;
  columns: readonly CompareColumn[];
  extras: readonly CompareColumn[];
  sort: CompareSort;
  count: number;
  onSort: (sort: CompareSort) => void;
  onClose: () => void;
}): JSX.Element {
  const word = offerWord(kind, 2);
  const options: CompareColumn[] = [
    ...columns.filter((column) => column.id !== TITLE_COLUMN),
    ...columns.filter((column) => column.id === TITLE_COLUMN),
  ].map((column) =>
    column.id === TITLE_COLUMN ? { ...column, label: 'Name' } : column,
  );
  const current = options.find((column) => column.id === sort.column);
  const labels = directionLabels(
    current === undefined ? 'number' : sortStyle(current),
  );
  // High first for numbers; A to Z and soonest first read ascending.
  const style = current === undefined ? 'number' : sortStyle(current);
  const directions: readonly ('asc' | 'desc')[] =
    style === 'number' ? ['desc', 'asc'] : ['asc', 'desc'];
  const isScore = (column: CompareColumn): boolean =>
    extras[0] === column && column.label === 'Your score';
  return (
    <Overlay kind="sheet" labelledBy="compare-sort-title" onClose={onClose}>
      <div class="compare-sort">
        <header class="compare-sort-head">
          <h2 id="compare-sort-title" class="compare-sort-title">
            {`Sort ${word} by`}
          </h2>
          <button
            type="button"
            class="compare-sort-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <div
          class="compare-sort-list"
          role="radiogroup"
          aria-label={`Sort ${word} by`}
        >
          {options.map((column) => {
            const sub = isScore(column)
              ? 'added by your rule'
              : sortStyle(column) === 'text' && column.id !== TITLE_COLUMN
                ? 'A to Z'
                : '';
            return (
              <button
                key={column.id}
                type="button"
                role="radio"
                class="compare-sort-option"
                aria-checked={column.id === sort.column}
                onClick={() => {
                  onSort(
                    column.id === sort.column
                      ? sort
                      : {
                          column: column.id,
                          direction: firstDirection(column.id, extras),
                        },
                  );
                }}
              >
                <span>{column.label}</span>
                {sub !== '' && <small>{sub}</small>}
              </button>
            );
          })}
        </div>
        <div class="compare-sort-order" role="radiogroup" aria-label="Order">
          {directions.map((direction) => (
            <button
              key={direction}
              type="button"
              role="radio"
              class="compare-sort-dir"
              aria-checked={sort.direction === direction}
              onClick={() => {
                onSort({ column: sort.column, direction });
              }}
            >
              {labels[direction]}
            </button>
          ))}
        </div>
        <button
          type="button"
          class="button compare-sort-done"
          onClick={onClose}
        >
          {`Show ${count} ${offerWord(kind, count)}`}
        </button>
      </div>
    </Overlay>
  );
}

/** The desktop's "Columns" dialog (R-CMP-7): every column the notes can
 * show, each switched on or off. The choice is saved as it is made. */
function ColumnsSheet({
  columns,
  visible,
  onToggle,
  onClose,
}: {
  columns: readonly CompareColumn[];
  visible: readonly string[] | undefined;
  onToggle: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  const shown = new Set(shownColumns(columns, visible).map((c) => c.id));
  return (
    <Overlay kind="dialog" labelledBy="compare-columns-title" onClose={onClose}>
      <div class="compare-sort">
        <header class="compare-sort-head">
          <h2 id="compare-columns-title" class="compare-sort-title">
            Columns
          </h2>
          <button
            type="button"
            class="compare-sort-close"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <div class="compare-sort-list" role="group" aria-label="Columns">
          {columns
            .filter((column) => column.id !== TITLE_COLUMN)
            .map((column) => (
              <button
                key={column.id}
                type="button"
                role="checkbox"
                class="compare-sort-option"
                aria-checked={shown.has(column.id)}
                onClick={() => {
                  onToggle(column.id);
                }}
              >
                <span>{column.label}</span>
                {column.optional === true && <small>added by your rule</small>}
              </button>
            ))}
        </div>
        <button
          type="button"
          class="button compare-sort-done"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </Overlay>
  );
}

export function CompareView({
  notes,
  folderPath,
  kindId,
}: CompareViewProps): JSX.Element | null {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { saveEditedNote } = useVault();
  const kinds = useMemo(() => compareKinds(notes), [notes]);
  const kind = kinds.find((candidate) => candidate.id === kindId) ?? kinds[0];

  const [overrides, setOverrides] = useState<
    Record<string, { status: string; modifiedTime: string | null }>
  >({});
  const [storedOrder, setStoredOrder] = useState<string[] | undefined>();
  const [sort, setSort] = useState<CompareSort | undefined>();
  const [chosenChips, setChosenChips] = useState<string[] | undefined>();
  const [sortOpen, setSortOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [storedVisible, setStoredVisible] = useState<string[] | undefined>();

  useEffect(() => {
    let live = true;
    loadViewSettings(folderPath).then(
      (settings) => {
        if (!live) return;
        const stored: CompareViewSettings | undefined = settings;
        const order = stored?.compareColumns;
        if (Array.isArray(order)) setStoredOrder(order);
        const visible = stored?.compareVisible;
        if (Array.isArray(visible)) setStoredVisible(visible);
        const storedSort = readSort(stored?.compareSort);
        if (storedSort !== undefined) setSort(storedSort);
      },
      (error: unknown) => {
        console.error('Reading the folder view settings failed', error);
      },
    );
    return () => {
      live = false;
    };
  }, [folderPath]);

  if (kind === undefined) return null;
  if (kind.compare === 'by-month') {
    return <MonthsView notes={notesOfKind(notes, kind)} />;
  }
  if (kind.compare === 'timeline') {
    return <TimelineView notes={notesOfKind(notes, kind)} />;
  }

  const current = notesOfKind(notes, kind).map((note) => {
    const override = overrides[note.id];
    return override === undefined
      ? note
      : {
          ...note,
          modifiedTime: override.modifiedTime,
          fields: { ...note.fields, status: override.status },
        };
  });
  const extras = columnExtras(kind, current);
  const everyColumn = compareColumns(
    kind,
    orderedColumnIds(kind, storedOrder, extras),
    extras,
  );
  const columns = shownColumns(everyColumn, storedVisible);
  const order = columns.map((column) => column.id);
  const chips = filterChips(kind, current);
  // The phone opens with its one filter on, as the board draws it (the
  // faded card and the line under the cards); the desktop starts unfiltered.
  const first = chips[0];
  const activeChips =
    chosenChips ?? (!isDesktop && first !== undefined ? [first.id] : []);
  const active = chips.filter((chip) => activeChips.includes(chip.id));
  // A stored sort on a column that is gone (a rule changed) falls back.
  const effectiveSort =
    sort !== undefined && columns.some((column) => column.id === sort.column)
      ? sort
      : defaultSort(kind, extras);
  const sorted = sortNotes(kind, current, effectiveSort, extras);
  const { hidden } = applyFilters(sorted, active);
  const hiddenIds = new Set(hidden.map((note) => note.id));

  const toggleChip = (id: string): void => {
    setChosenChips(
      activeChips.includes(id)
        ? activeChips.filter((chip) => chip !== id)
        : [...activeChips, id],
    );
  };

  const remember = (
    patch: Partial<CompareViewSettings>,
    what: string,
  ): void => {
    loadViewSettings(folderPath)
      .then((settings) => {
        const base: ViewSettings = settings ?? {
          sort: 'name',
          kindFilter: null,
          originFilter: null,
          layout: 'list',
        };
        const merged: CompareViewSettings = { ...base, ...patch };
        return saveViewSettings(folderPath, merged);
      })
      .catch((error: unknown) => {
        console.error(`Saving the ${what} failed`, error);
      });
  };

  const saveOrder = (next: string[]): void => {
    setStoredOrder(next);
    remember({ compareColumns: next }, 'column order');
  };

  const chooseColumn = (id: string): void => {
    const next = toggleColumn(everyColumn, storedVisible, id);
    setStoredVisible(next);
    remember({ compareVisible: next }, 'column choice');
  };

  const copyTable = (): void => {
    const rows = sorted.filter((note) => !hiddenIds.has(note.id));
    const text = tableMarkdown(kind, rows, columns);
    navigator.clipboard.writeText(text).then(
      () => {
        showToast('Table copied.');
      },
      (error: unknown) => {
        console.error('Copying the table failed', error);
        showToast("Bower couldn't copy the table. Try again.");
      },
    );
  };

  const chooseSort = (next: CompareSort): void => {
    setSort(next);
    remember({ compareSort: next }, 'sort');
  };

  const sortBy = (id: string): void => {
    chooseSort(
      effectiveSort.column === id
        ? {
            column: id,
            direction: effectiveSort.direction === 'asc' ? 'desc' : 'asc',
          }
        : { column: id, direction: firstDirection(id, extras) },
    );
  };

  const changeStatus = async (
    note: CompareNote,
    status: string,
  ): Promise<void> => {
    const before = overrides[note.id];
    setOverrides((now) => ({
      ...now,
      [note.id]: { status, modifiedTime: note.modifiedTime },
    }));
    try {
      const text = await getText(note.id);
      const next = changeStatusWithHistory(text, status, new Date());
      if (next === text) {
        setOverrides((now) => {
          const rest = { ...now };
          if (before === undefined) delete rest[note.id];
          else rest[note.id] = before;
          return rest;
        });
        return;
      }
      // Through the vault store, so the index gets the new `modifiedTime`
      // and the folder shows the new status when you come back to it.
      const saved = await saveEditedNote(note.id, next, {
        baseModifiedTime: note.modifiedTime,
      });
      try {
        await recordNoteMeta(note.id, saved.modifiedTime ?? undefined, next);
      } catch (error: unknown) {
        console.error('Caching the new status failed', error);
      }
      setOverrides((now) => ({
        ...now,
        [note.id]: {
          status,
          modifiedTime: saved.modifiedTime ?? note.modifiedTime,
        },
      }));
    } catch (error: unknown) {
      console.error('Changing a status failed', error);
      showToast("Bower couldn't save that status. Try again.");
      setOverrides((now) => {
        const next = { ...now };
        if (before === undefined) delete next[note.id];
        else next[note.id] = before;
        return next;
      });
    }
  };

  const chipRow = (
    <div class="compare-chips" role="group" aria-label="Filter">
      {(isDesktop ? chips : chips.slice(0, 1)).map((chip) => (
        <button
          key={chip.id}
          type="button"
          class="compare-chip"
          aria-pressed={activeChips.includes(chip.id)}
          onClick={() => {
            toggleChip(chip.id);
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );

  if (!isDesktop) {
    const faded = fadedLine(hidden, active);
    const phoneColumns = columns.filter(
      (column) => column.virtual === undefined,
    );
    const sortColumn =
      phoneColumns.find((column) => column.id === effectiveSort.column) ??
      phoneColumns[0];
    // The list shows every note (the filtered ones faded), so the button counts them all.
    const shownCount = sorted.length;
    return (
      <section class="compare compare-phone" aria-label="Compare">
        <p class="compare-explainer">{phoneExplainer(kind, current.length)}</p>
        {sortColumn !== undefined && (
          <button
            type="button"
            class="compare-sort-btn"
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            onClick={() => {
              setSortOpen(true);
            }}
          >
            {sortButtonText(sortColumn, effectiveSort.direction)}
          </button>
        )}
        {chipRow}
        {sortOpen && (
          <SortSheet
            kind={kind}
            columns={phoneColumns}
            extras={extras}
            sort={effectiveSort}
            count={shownCount}
            onSort={chooseSort}
            onClose={() => {
              setSortOpen(false);
            }}
          />
        )}
        <ul class="compare-cards">
          {sorted.map((note) => (
            <li key={note.id}>
              <PhoneCard
                kind={kind}
                note={note}
                faded={hiddenIds.has(note.id)}
              />
            </li>
          ))}
        </ul>
        <p class="compare-foot">
          {faded === '' ? '' : `${faded} `}
          {footerLine(kind)}
        </p>
      </section>
    );
  }

  const shown = sorted.filter((note) => !hiddenIds.has(note.id));
  return (
    <section class="compare compare-desktop" aria-label="Compare">
      <p class="compare-explainer">
        {desktopExplainer(
          kind,
          extras.some((column) => column.field?.group === 'score'),
        )}
      </p>
      {chipRow}
      <div class="compare-chips compare-tools" role="group" aria-label="Table">
        <button
          type="button"
          class="compare-chip"
          aria-haspopup="dialog"
          aria-expanded={columnsOpen}
          onClick={() => {
            setColumnsOpen(true);
          }}
        >
          Columns
        </button>
        <button type="button" class="compare-chip" onClick={copyTable}>
          Copy as table
        </button>
      </div>
      {columnsOpen && (
        <ColumnsSheet
          columns={everyColumn}
          visible={storedVisible}
          onToggle={chooseColumn}
          onClose={() => {
            setColumnsOpen(false);
          }}
        />
      )}
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  order={order}
                  sort={effectiveSort}
                  onSort={sortBy}
                  onOrder={saveOrder}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((note) => (
              <tr key={note.id}>
                {columns.map((column, index) => (
                  <BodyCell
                    key={column.id}
                    kind={kind}
                    note={note}
                    column={column}
                    header={index === 0}
                    onStatus={(status) => {
                      void changeStatus(note, status);
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden.length > 0 && (
        <p class="compare-hidden" role="status">
          {`${hidden.length} hidden by the filter`}
        </p>
      )}
      <div class="compare-legend">
        <span>
          <OriginSquare origin="file" /> from the listing
        </span>
        <span>
          <OriginSquare origin="web" /> looked up
        </span>
        <span>
          <OriginSquare origin="you" /> from what you told me
        </span>
      </div>
      <Hint
        id="compare-ask"
        variant="suggestion"
        icon={<IconSparkle />}
        actions={
          <button
            type="button"
            class="chip"
            onClick={() =>
              openSendToBower({
                mode: 'ask',
                about: askSubject(current.length),
                initialText: askQuestion(kind),
                buildText: (value) =>
                  `About ${askSubject(current.length)}: ${value}`,
              })
            }
          >
            {askQuestion(kind)}
          </button>
        }
      >
        Ask Bower about {askSubject(current.length)}.
      </Hint>
    </section>
  );
}

function PhoneCard({
  kind,
  note,
  faded,
}: {
  kind: Kind;
  note: CompareNote;
  faded: boolean;
}): JSX.Element {
  const facts = keyFactsFor(kind, note.fields).slice(0, 3);
  const status = statusLabel(kind, note.fields);
  const highlight = note.fields.highlight;
  const fit = scoreOf(note);
  return (
    <a
      class={`compare-card${faded ? ' compare-card-faded' : ''}`}
      href={noteHref(note)}
    >
      <span class="compare-card-head">
        <b class="compare-card-title">{noteTitle(note)}</b>
        {fit !== null && (
          <span
            class={`compare-fit compare-fit-${fitTone(fit)}`}
            role="img"
            aria-label={`Your score ${fit} of 100`}
          >
            {`${fit}/100`}
          </span>
        )}
      </span>
      <span class="compare-card-facts">
        {facts.map((fact, index) => (
          <span class="compare-card-fact" key={fact.key}>
            <b>{fact.value}</b>
            {index === 2 && status !== ''
              ? status
              : index === 1 && typeof highlight === 'string' && highlight !== ''
                ? highlight
                : fact.label}
          </span>
        ))}
      </span>
      {facts.length < 3 && status !== '' && (
        <span class="compare-card-status">{status}</span>
      )}
    </a>
  );
}

function HeaderCell({
  column,
  order,
  sort,
  onSort,
  onOrder,
}: {
  column: CompareColumn;
  order: readonly string[];
  sort: CompareSort;
  onSort: (id: string) => void;
  onOrder: (order: string[]) => void;
}): JSX.Element {
  const [menu, setMenu] = useState(false);
  const [over, setOver] = useState(false);
  const sorted = sort.column === column.id;
  const movable = column.id !== TITLE_COLUMN;
  const ariaSort = sorted
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th
      scope="col"
      class={`compare-th${over ? ' compare-th-over' : ''}`}
      aria-sort={ariaSort}
      draggable={movable}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', column.id);
      }}
      onDragOver={(event) => {
        if (!movable) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const from = event.dataTransfer?.getData('text/plain') ?? '';
        if (from !== '' && movable) onOrder(dropColumn(order, from, column.id));
      }}
    >
      <button
        type="button"
        class="compare-th-sort"
        onClick={() => {
          onSort(column.id);
        }}
      >
        {column.label}
        {sorted && (
          <span aria-hidden="true">
            {sort.direction === 'asc' ? ' ▴' : ' ▾'}
          </span>
        )}
      </button>
      {movable && (
        <span class="compare-th-menu">
          <button
            type="button"
            class="compare-th-more"
            aria-label={`Move ${column.label}`}
            aria-expanded={menu}
            onClick={() => {
              setMenu((open) => !open);
            }}
          >
            ⋯
          </button>
          {menu && (
            <span
              class="compare-menu"
              role="group"
              aria-label={`Move ${column.label}`}
            >
              <button
                type="button"
                disabled={order.indexOf(column.id) <= 1}
                onClick={() => {
                  onOrder(moveColumn(order, column.id, 'left'));
                  setMenu(false);
                }}
              >
                Move left
              </button>
              <button
                type="button"
                disabled={order.indexOf(column.id) >= order.length - 1}
                onClick={() => {
                  onOrder(moveColumn(order, column.id, 'right'));
                  setMenu(false);
                }}
              >
                Move right
              </button>
            </span>
          )}
        </span>
      )}
    </th>
  );
}

function BodyCell({
  kind,
  note,
  column,
  header,
  onStatus,
}: {
  kind: Kind;
  note: CompareNote;
  column: CompareColumn;
  header: boolean;
  onStatus: (status: string) => void;
}): JSX.Element {
  if (header) {
    return (
      <th scope="row" class="compare-td compare-td-title">
        <a href={noteHref(note)}>{noteTitle(note)}</a>
      </th>
    );
  }
  if (column.id === STATUS_COLUMN) {
    const value = statusValue(note);
    const options =
      kind.statuses.includes(value) || value === ''
        ? kind.statuses
        : [...kind.statuses, value];
    const shownLabel = statusLabel(kind, note.fields);
    return (
      <td class="compare-td">
        <select
          class="compare-status"
          aria-label={`Status of ${noteTitle(note)}`}
          value={value}
          onChange={(event) => {
            onStatus(event.currentTarget.value);
          }}
        >
          {value === '' && <option value="">No status</option>}
          {options.map((status) => (
            <option key={status} value={status}>
              {status === value && shownLabel !== ''
                ? shownLabel
                : statusOptionLabel(status)}
            </option>
          ))}
        </select>
      </td>
    );
  }
  if (column.virtual === 'made-for') {
    const badge = madeForBadge(note);
    return (
      <td class="compare-td">
        {(note.madeFor ?? []).length === 0 ? (
          badge
        ) : (
          <span class="compare-made-for">{badge}</span>
        )}
      </td>
    );
  }
  if (column.virtual === 'apply') {
    const href = applyHref(note);
    return (
      <td class="compare-td">
        {href === null ? (
          cellText(kind, note, column)
        ) : (
          <a
            href={href}
            target="_blank"
            class="compare-apply"
            rel="noopener noreferrer"
            aria-label={`Apply to ${noteTitle(note)}`}
          >
            Apply
          </a>
        )}
      </td>
    );
  }
  const origin = note.bowerOrigins[column.id];
  const score =
    column.id === 'fit' || column.label === SCORE_LABEL ? scoreOf(note) : null;
  const text = score === null ? cellText(kind, note, column) : `${score}/100`;
  return (
    <td class="compare-td">
      {text}
      {origin !== undefined && origin !== 'file' && text !== '' && (
        <OriginSquare origin={origin} />
      )}
    </td>
  );
}

/** Receipts by month (issue #615): one block per month, newest first, with
 * its total and the receipts under it, and the year so far at the end. */
function MonthsView({ notes }: { notes: readonly CompareNote[] }): JSX.Element {
  const { months, year } = receiptsByMonth(notes);
  return (
    <section class="compare compare-months" aria-label="Compare">
      <p class="compare-explainer">{receiptsExplainer(notes.length)}</p>
      {months.map((month) => (
        <section class="compare-month" key={month.key}>
          <h3 class="compare-month-head">
            <span>{month.label}</span>
            <span class="compare-month-total">{month.totalText}</span>
          </h3>
          <ul class="compare-month-list">
            {month.receipts.map((receipt) => (
              <li key={receipt.note.id}>
                <a class="compare-receipt" href={noteHref(receipt.note)}>
                  <b class="compare-receipt-shop">{receipt.shop}</b>
                  <span class="compare-receipt-date">{receipt.date}</span>
                  <span class="compare-receipt-total">{receipt.total}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {year !== null && (
        <p class="compare-year">
          <span>{`${year.year} so far`}</span>
          <b>{year.totalText}</b>
        </p>
      )}
    </section>
  );
}

/** Bookings as a timeline (issue #615): a vertical line by date and time,
 * each with where and the reference; the ones already over are faded. */
function TimelineView({
  notes,
}: {
  notes: readonly CompareNote[];
}): JSX.Element {
  const entries = bookingsTimeline(notes);
  return (
    <section class="compare compare-timeline" aria-label="Compare">
      <p class="compare-explainer">{timelineExplainer(notes.length)}</p>
      <ol class="compare-steps">
        {entries.map((entry) => (
          <li
            key={entry.note.id}
            class={`compare-step${entry.past ? ' compare-step-past' : ''}`}
          >
            <a class="compare-step-link" href={noteHref(entry.note)}>
              <span class="compare-step-when">
                {[entry.date, entry.time]
                  .filter((part) => part !== '')
                  .join(', ')}
                {entry.past && <span class="compare-step-tag"> · Past</span>}
              </span>
              <b class="compare-step-what">{entry.what}</b>
              {entry.where !== '' && (
                <span class="compare-step-where">{entry.where}</span>
              )}
              {entry.reference !== '' && (
                <span class="compare-step-ref">{`Ref ${entry.reference}`}</span>
              )}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
