/**
 * Compare (#916, spec §3.35; boards PF-Compare, PF-Sort, PF-Columns,
 * LI-Compare, GR-Compare): the items of one kind side by side, in the
 * folder's Compare tab (`CompareSlot` in `routes/folder.tsx`).
 *
 * Phone: the Sort chip ("Fit, high first") opening the "Sort by" sheet, the
 * folder's quick filter chip, and one card per item with its score, facts
 * and status select. Desktop: the same quick filter, a Columns chip opening
 * the Columns popover, and a table sorted by clicking a header. The status
 * select offers the folder's own statuses (`folder-statuses.ts`) and writes
 * the note's `status` (R-API-14). Receipts and bookings keep their month and
 * timeline views.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { loadViewSettings, saveViewSettings } from '../cache.js';
import type { ViewSettings } from '../cache.js';
import {
  applyFilters,
  bookingsTimeline,
  applyHref,
  cellText,
  compareKinds,
  defaultSort,
  factsLine,
  firstDirection,
  hiddenWithoutDate,
  itemNoun,
  madeForBadge,
  noteTitle,
  notesOfKind,
  numberOf,
  optionLabel,
  quickFilter,
  quickFilterText,
  receiptsByMonth,
  receiptsExplainer,
  shownColumns,
  sortChipText,
  sortNotes,
  sortOptions,
  statusDateLine,
  STATUS_COLUMN,
  statusValue,
  tableColumns,
  timelineExplainer,
  TITLE_COLUMN,
  toggleColumn,
} from '../compare.js';
import type { CompareColumn, CompareNote, CompareSort } from '../compare.js';
import { getText } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { folderStatuses, hubNotePath } from '../folder-statuses.js';
import { changeStatusWithHistory } from '../history.js';
import type { Kind } from '../kinds.js';
import { madeForItem } from './made-for-it.js';
import type { MadeForCandidate } from './made-for-it.js';
import { loadNoteMeta, recordNoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import { IconCheck, IconSort } from './icons.js';
import { Overlay, OverlayHeader } from './overlay.js';
import { Segmented } from './segmented.js';
import { StatusSelect } from './status-select.js';

import '../styles/compare.css';

/** The table from here up; cards below (the app's desktop breakpoint). */
const DESKTOP_QUERY = '(min-width: 900px)';

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
  /** The folder's path: the sort and the columns are remembered under it,
   * and its hub note holds the folder's statuses. */
  folderPath: string;
  /** Which kind to line up; the folder's first comparable kind by default. */
  kindId?: string;
}

function noteHref(note: CompareNote): string {
  return `/note/${encodeURIComponent(note.id)}`;
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

function ScorePill({ score }: { score: number }): JSX.Element {
  return (
    <span class="compare-score" aria-label={`Fit ${score} of 100`}>
      {`${score}/100`}
    </span>
  );
}

/** The folder's statuses for `kind`: its hub note's list, else the kind's. */
function useFolderStatuses(
  folderPath: string,
  kind: Kind | undefined,
): string[] {
  const { index, getNoteText } = useVault();
  const hub = index?.byPath.get(hubNotePath(folderPath));
  const hubId = hub?.id;
  const hubVersion = hub?.modifiedTime ?? '';
  const [text, setText] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (hubId === undefined) return;
    let live = true;
    getNoteText(hubId).then(
      (read) => {
        if (live) setText({ id: hubId, text: read });
      },
      (error: unknown) => {
        console.error("Reading the folder's hub note failed", error);
      },
    );
    return () => {
      live = false;
    };
  }, [hubId, hubVersion, getNoteText]);

  return useMemo(
    () =>
      kind === undefined
        ? []
        : folderStatuses(text?.id === hubId ? text?.text : undefined, kind),
    [kind, text, hubId],
  );
}

/** The columns' 16 px glyph (PF-Compare-1280's Columns chip). */
function ColumnsGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  );
}

/** A header's sort glyph: both arrows at rest, one chevron when active. */
function SortGlyph({
  direction,
}: {
  direction: 'asc' | 'desc' | null;
}): JSX.Element {
  return (
    <svg
      class="compare-th-glyph"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          direction === null
            ? 'M8 9l4-4 4 4M8 15l4 4 4-4'
            : direction === 'desc'
              ? 'M6 9l6 6 6-6'
              : 'M6 15l6-6 6 6'
        }
      />
    </svg>
  );
}

/** The phone's "Sort by" sheet (PF-Sort-375): High first / Low first, the
 * criteria as radio rows, and "Show <n> flats". The choices are a draft:
 * "Show" applies it, Esc or ✕ cancels it (T-23). */
function SortSheet({
  options,
  sort: applied,
  count,
  noun,
  onSort,
  onClose,
}: {
  options: readonly CompareColumn[];
  sort: CompareSort;
  count: number;
  noun: string;
  onSort: (sort: CompareSort) => void;
  onClose: () => void;
}): JSX.Element {
  const [sort, onSortDraft] = useState<CompareSort>(applied);
  return (
    <Overlay kind="sheet" labelledBy="compare-sort-title" onClose={onClose}>
      <div class="overlay-body compare-sheet">
        <OverlayHeader
          titleId="compare-sort-title"
          title="Sort by"
          closeLabel="Close Sort by"
          onClose={onClose}
        />
        <div class="compare-sheet-order">
          <Segmented
            label="Order"
            outlined
            options={[
              { value: 'desc', label: 'High first' },
              { value: 'asc', label: 'Low first' },
            ]}
            value={sort.direction}
            onChange={(direction) => {
              onSortDraft({ column: sort.column, direction });
            }}
          />
        </div>
        <div class="compare-sheet-list" role="radiogroup" aria-label="Sort by">
          {options.map((column) => {
            const on = column.id === sort.column;
            return (
              <button
                key={column.id}
                type="button"
                role="radio"
                class="compare-sheet-row"
                aria-checked={on}
                onClick={() => {
                  if (!on)
                    onSortDraft({
                      column: column.id,
                      direction: sort.direction,
                    });
                }}
              >
                <span>{optionLabel(column)}</span>
                {on && <IconCheck />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          class="btn btn-block compare-sheet-done"
          onClick={() => {
            if (
              sort.column !== applied.column ||
              sort.direction !== applied.direction
            ) {
              onSort(sort);
            }
            onClose();
          }}
        >
          {`Show ${count} ${noun}`}
        </button>
      </div>
    </Overlay>
  );
}

/** The desktop's Columns popover (PF-Columns-1280): 320 wide under its
 * chip, one checkbox row per column, "Done". Saved as it is changed. */
function ColumnsPopover({
  columns,
  shown,
  onToggle,
  onClose,
}: {
  columns: readonly CompareColumn[];
  shown: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <Overlay
      kind="sheet"
      desktopPlacement="anchor"
      labelledBy="compare-columns-title"
      onClose={onClose}
    >
      <div class="overlay-body compare-columns">
        <OverlayHeader
          titleId="compare-columns-title"
          title="Columns"
          closeLabel="Close Columns"
          onClose={onClose}
        />
        <div class="compare-columns-list" role="group" aria-label="Columns">
          {columns
            .filter((column) => column.id !== TITLE_COLUMN)
            .map((column) => (
              <label key={column.id} class="compare-columns-row">
                <input
                  type="checkbox"
                  class="compare-columns-box"
                  checked={shown.has(column.id)}
                  onChange={() => {
                    onToggle(column.id);
                  }}
                />
                <span>{optionLabel(column)}</span>
              </label>
            ))}
        </div>
        <button
          type="button"
          class="btn btn-block compare-columns-done"
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
  const statuses = useFolderStatuses(folderPath, kind);

  const [overrides, setOverrides] = useState<
    Record<string, { status: string; modifiedTime: string | null }>
  >({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<CompareSort | undefined>();
  const [filterOn, setFilterOn] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [storedVisible, setStoredVisible] = useState<string[] | undefined>();

  useEffect(() => {
    let live = true;
    loadViewSettings(folderPath).then(
      (settings) => {
        if (!live) return;
        const visible = settings?.compareVisible;
        if (Array.isArray(visible)) setStoredVisible(visible);
        const storedSort = readSort(settings?.compareSort);
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
  const everyColumn = tableColumns(kind, current);
  const columns = shownColumns(everyColumn, storedVisible);
  const sortable = everyColumn.filter(
    (column) => column.field !== undefined && column.id !== TITLE_COLUMN,
  );
  // A stored sort on a column that is not shown (any more) falls back.
  const effectiveSort =
    sort !== undefined && columns.some((column) => column.id === sort.column)
      ? sort
      : defaultSort(kind, sortable);
  const sorted = sortNotes(kind, current, effectiveSort, sortable, statuses);
  const chip = quickFilter(kind, current);
  const active = chip !== undefined && filterOn ? [chip] : [];
  const { shown, hidden } = applyFilters(sorted, active);
  const withoutDate =
    chip !== undefined && filterOn ? hiddenWithoutDate(hidden, chip) : 0;

  const remember = (patch: Partial<ViewSettings>, what: string): void => {
    loadViewSettings(folderPath)
      .then((settings) => {
        const base: ViewSettings = settings ?? {
          sort: 'name',
          kindFilter: null,
          originFilter: null,
          layout: 'list',
        };
        return saveViewSettings(folderPath, { ...base, ...patch });
      })
      .catch((error: unknown) => {
        console.error(`Saving the ${what} failed`, error);
      });
  };

  const chooseColumn = (id: string): void => {
    const next = toggleColumn(everyColumn, storedVisible, id);
    setStoredVisible(next);
    remember({ compareVisible: next }, 'column choice');
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
        : { column: id, direction: firstDirection(id, sortable) },
    );
  };

  const settle = (id: string): void => {
    setPending((now) => {
      const next = new Set(now);
      next.delete(id);
      return next;
    });
  };

  const changeStatus = async (
    note: CompareNote,
    status: string,
  ): Promise<void> => {
    const before = overrides[note.id];
    const putBack = (): void => {
      setOverrides((now) => {
        const rest = { ...now };
        if (before === undefined) delete rest[note.id];
        else rest[note.id] = before;
        return rest;
      });
    };
    setOverrides((now) => ({
      ...now,
      [note.id]: { status, modifiedTime: note.modifiedTime },
    }));
    setPending((now) => new Set(now).add(note.id));
    try {
      const text = await getText(note.id);
      const next = changeStatusWithHistory(text, status, new Date());
      if (next === text) {
        putBack();
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
      putBack();
    } finally {
      settle(note.id);
    }
  };

  const statusSelect = (
    note: CompareNote,
    layout: 'row' | 'stack',
  ): JSX.Element => (
    <StatusSelect
      name={noteTitle(note)}
      value={statusValue(note)}
      statuses={statuses}
      dateLine={statusDateLine(kind, note)}
      layout={layout}
      pending={pending.has(note.id)}
      onChange={(status) => {
        void changeStatus(note, status);
      }}
    />
  );

  const filterChip =
    chip === undefined ? null : (
      <button
        type="button"
        class="compare-chip"
        aria-pressed={filterOn}
        onClick={() => {
          setFilterOn((on) => !on);
        }}
      >
        {quickFilterText(chip, withoutDate)}
      </button>
    );
  const hasStatus = columns.some((column) => column.id === STATUS_COLUMN);

  if (!isDesktop) {
    const options = sortOptions(columns);
    const sortColumn =
      options.find((column) => column.id === effectiveSort.column) ??
      options[0];
    return (
      <section class="compare compare-phone" aria-label="Compare">
        <div class="compare-bar">
          {sortColumn !== undefined && (
            <button
              type="button"
              class="compare-chip compare-sort-btn"
              aria-haspopup="dialog"
              aria-expanded={sortOpen}
              aria-label={`Sort: ${sortChipText(sortColumn, effectiveSort.direction)}`}
              onClick={() => {
                setSortOpen(true);
              }}
            >
              <IconSort />
              {sortChipText(sortColumn, effectiveSort.direction)}
            </button>
          )}
          {filterChip}
        </div>
        {sortOpen && (
          <SortSheet
            options={options}
            sort={effectiveSort}
            count={shown.length}
            noun={itemNoun(kind, shown.length)}
            onSort={chooseSort}
            onClose={() => {
              setSortOpen(false);
            }}
          />
        )}
        <ul class="compare-cards">
          {shown.map((note) => {
            const score = scoreOf(note);
            const facts = factsLine(kind, note);
            return (
              <li key={note.id} class="card compare-card">
                <div class="compare-card-head">
                  <a class="compare-card-title" href={noteHref(note)}>
                    {noteTitle(note)}
                  </a>
                  {score !== null && <ScorePill score={score} />}
                </div>
                {facts !== '' && <p class="compare-card-facts">{facts}</p>}
                {hasStatus && statusSelect(note, 'row')}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section class="compare compare-desktop" aria-label="Compare">
      <div class="compare-bar">
        {filterChip}
        <button
          type="button"
          class="compare-chip compare-columns-btn"
          aria-haspopup="dialog"
          aria-expanded={columnsOpen}
          onClick={() => {
            setColumnsOpen(true);
          }}
        >
          <ColumnsGlyph />
          Columns
        </button>
      </div>
      {columnsOpen && (
        <ColumnsPopover
          columns={everyColumn}
          shown={new Set(columns.map((column) => column.id))}
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
                  sort={effectiveSort}
                  onSort={sortBy}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((note) => (
              <tr key={note.id}>
                {columns.map((column, index) =>
                  column.id === STATUS_COLUMN ? (
                    <td key={column.id} class="compare-td">
                      {statusSelect(note, 'stack')}
                    </td>
                  ) : (
                    <BodyCell
                      key={column.id}
                      kind={kind}
                      note={note}
                      column={column}
                      header={index === 0}
                    />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The columns the boards draw in the muted colour (PF-, LI-Compare-1280). */
const MUTED_COLUMNS: ReadonlySet<string> = new Set(['against_area', 'holiday']);

/** A sortable header: the active one teal with ↑ or ↓ (`aria-sort`). */
function HeaderCell({
  column,
  sort,
  onSort,
}: {
  column: CompareColumn;
  sort: CompareSort;
  onSort: (id: string) => void;
}): JSX.Element {
  const sorted = sort.column === column.id;
  const sortable = column.virtual === undefined;
  return (
    <th
      scope="col"
      class={`compare-th${sorted ? ' compare-th-on' : ''}`}
      aria-sort={
        sorted
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      {sortable ? (
        <button
          type="button"
          class="compare-th-sort"
          onClick={() => {
            onSort(column.id);
          }}
        >
          {column.label}
          <SortGlyph direction={sorted ? sort.direction : null} />
        </button>
      ) : (
        column.label
      )}
    </th>
  );
}

function BodyCell({
  kind,
  note,
  column,
  header,
}: {
  kind: Kind;
  note: CompareNote;
  column: CompareColumn;
  header: boolean;
}): JSX.Element {
  if (header) {
    return (
      <th scope="row" class="compare-td compare-td-title">
        <a href={noteHref(note)}>{noteTitle(note)}</a>
      </th>
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
  if (column.field?.group === 'score' || column.id === 'fit') {
    const score = scoreOf(note);
    return (
      <td class="compare-td">
        {score === null ? '—' : <ScorePill score={score} />}
      </td>
    );
  }
  return (
    <td
      class={`compare-td${MUTED_COLUMNS.has(column.id) ? ' compare-td-muted' : ''}`}
    >
      {cellText(kind, note, column)}
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
