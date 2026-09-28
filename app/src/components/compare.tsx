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
  askHref,
  askTip,
  cellText,
  compareColumns,
  compareKinds,
  defaultSort,
  desktopExplainer,
  dropColumn,
  fadedLine,
  filterChips,
  footerLine,
  moveColumn,
  noteTitle,
  notesOfKind,
  orderedColumnIds,
  phoneExplainer,
  setFrontmatterValue,
  sortNotes,
  statusOptionLabel,
  STATUS_COLUMN,
  statusValue,
  TITLE_COLUMN,
} from '../compare.js';
import type { CompareColumn, CompareNote, CompareSort } from '../compare.js';
import { getText, saveNoteText } from '../drive.js';
import type { DriveFile } from '../drive.js';
import { keyFactsFor, statusLabel } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { loadNoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { OriginSquare } from './folder-mark.js';

import '../styles/compare.css';

/** Where the table replaces the cards: the shell's desktop width. */
const DESKTOP_QUERY = '(min-width: 900px)';

/** The folder's `viewSettings` plus the Compare column order it remembers. */
type CompareViewSettings = ViewSettings & { compareColumns?: string[] };

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
  const notes = await Promise.all(
    markdown.map(async (file): Promise<CompareNote | null> => {
      try {
        const meta = await loadNoteMeta(file);
        if (meta.kind === undefined) return null;
        return {
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime ?? null,
          kind: meta.kind,
          fields: meta.fields,
          bowerOrigins: meta.bowerOrigins,
        };
      } catch (error: unknown) {
        console.error('Reading a note for Compare failed', error);
        return null;
      }
    }),
  );
  return notes.filter((note): note is CompareNote => note !== null);
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

function fitTone(value: unknown): 'good' | 'warm' {
  return typeof value === 'number' && value >= 70 ? 'good' : 'warm';
}

export function CompareView({
  notes,
  folderPath,
  kindId,
}: CompareViewProps): JSX.Element | null {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const kinds = useMemo(() => compareKinds(notes), [notes]);
  const kind = kinds.find((candidate) => candidate.id === kindId) ?? kinds[0];

  const [overrides, setOverrides] = useState<
    Record<string, { status: string; modifiedTime: string | null }>
  >({});
  const [storedOrder, setStoredOrder] = useState<string[] | undefined>();
  const [sort, setSort] = useState<CompareSort | undefined>();
  const [activeChips, setActiveChips] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    loadViewSettings(folderPath).then(
      (settings) => {
        if (!live) return;
        const stored: CompareViewSettings | undefined = settings;
        const order = stored?.compareColumns;
        if (Array.isArray(order)) setStoredOrder(order);
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
  const order = orderedColumnIds(kind, storedOrder);
  const columns = compareColumns(kind, order);
  const chips = filterChips(kind, current);
  const active = chips.filter((chip) => activeChips.includes(chip.id));
  const effectiveSort = sort ?? defaultSort(kind);
  const sorted = sortNotes(kind, current, effectiveSort);
  const { hidden } = applyFilters(sorted, active);
  const hiddenIds = new Set(hidden.map((note) => note.id));

  const toggleChip = (id: string): void => {
    setActiveChips((now) =>
      now.includes(id) ? now.filter((chip) => chip !== id) : [...now, id],
    );
  };

  const saveOrder = (next: string[]): void => {
    setStoredOrder(next);
    loadViewSettings(folderPath)
      .then((settings) => {
        const base: ViewSettings = settings ?? {
          sort: 'name',
          kindFilter: null,
          originFilter: null,
          layout: 'list',
        };
        const merged: CompareViewSettings = { ...base, compareColumns: next };
        return saveViewSettings(folderPath, merged);
      })
      .catch((error: unknown) => {
        console.error('Saving the column order failed', error);
      });
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
      const saved = await saveNoteText(
        { id: note.id, name: note.name, mimeType: 'text/markdown' },
        setFrontmatterValue(text, 'status', status),
        { baseModifiedTime: note.modifiedTime },
      );
      setOverrides((now) => ({
        ...now,
        [note.id]: {
          status,
          modifiedTime: saved.file.modifiedTime ?? note.modifiedTime,
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
    <div class="compare-chips" role="group" aria-label="Sort and filter">
      <button
        type="button"
        class="compare-chip"
        aria-pressed={sort === undefined || sort.column === 'fit'}
        onClick={() => {
          setSort(defaultSort(kind));
        }}
      >
        {kind.compareFields.includes('fit')
          ? 'Best fit first'
          : 'Default order'}
      </button>
      {chips.map((chip) => (
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
    return (
      <section class="compare compare-phone" aria-label="Compare">
        <p class="compare-explainer">{phoneExplainer(kind, current.length)}</p>
        {chipRow}
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
      <p class="compare-explainer">{desktopExplainer(kind, current.length)}</p>
      {chipRow}
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
                  onSort={(id) => {
                    setSort(
                      effectiveSort.column === id
                        ? {
                            column: id,
                            direction:
                              effectiveSort.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          }
                        : {
                            column: id,
                            direction: id === 'fit' ? 'desc' : 'asc',
                          },
                    );
                  }}
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
        <span class="compare-legend-hint">
          Columns come from what Bower read. Click a header to sort; drag to
          reorder.
        </span>
      </div>
      <a class="compare-ask" href={askHref(current.length, kind)}>
        {askTip(current.length, kind)}
      </a>
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
  const fit = note.fields.fit;
  return (
    <a
      class={`compare-card${faded ? ' compare-card-faded' : ''}`}
      href={noteHref(note)}
    >
      <span class="compare-card-head">
        <b class="compare-card-title">{noteTitle(note)}</b>
        {typeof fit === 'number' && (
          <span class={`compare-fit compare-fit-${fitTone(fit)}`}>
            {`Fit ${fit}`}
          </span>
        )}
      </span>
      <span class="compare-card-facts">
        {facts.map((fact, index) => (
          <span class="compare-card-fact" key={fact.key}>
            <b>{fact.value}</b>
            {index === 2 && status !== '' ? status : fact.label}
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
  const origin = note.bowerOrigins[column.id];
  const text = cellText(kind, note, column);
  return (
    <td class="compare-td">
      {text}
      {origin !== undefined && origin !== 'file' && text !== '' && (
        <OriginSquare origin={origin} />
      )}
    </td>
  );
}
