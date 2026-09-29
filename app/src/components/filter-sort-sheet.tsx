/**
 * The phone's one "Filter & sort" button (R-FOLD-6, D34): below 900 px the
 * sort, kind and layout controls of a folder live in a sheet, so the first
 * note shows sooner. Desktop keeps the toolbar (`folder-items.tsx`). The
 * button's accessible name says the current choice ("Filter and sort:
 * newest first, all kinds"). Choices apply as they are made; the last
 * button closes the sheet.
 */

import { useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { JSX } from 'preact';

import { FOLDER_SORTS, SORT_LABELS } from '../folder-view.js';
import type { FolderSort } from '../folder-view.js';
import type { FolderLayout } from './folder-grid.js';
import { IconClose, IconSliders } from './icons.js';
import { Overlay } from './overlay.js';
import '../styles/filter-sort-sheet.css';

/** One kind the folder holds, as the kind filter lists it. */
export interface KindChoice {
  kind: string;
  /** Singular, "Note". */
  label: string;
  count: number;
}

/** The button's accessible name: "Filter and sort: newest first, all
 * kinds". */
export function filterSortName(
  sort: FolderSort,
  kind: KindChoice | null,
): string {
  const kindText = kind === null ? 'all kinds' : `${kind.label}s`;
  return `Filter and sort: ${SORT_LABELS[sort].toLowerCase()}, ${kindText.toLowerCase()}`;
}

export interface FilterSortSheetProps {
  sort: FolderSort;
  /** The selected kind's id, `null` for all. */
  kind: string | null;
  kinds: readonly KindChoice[];
  layout: FolderLayout;
  /** How many things the current choice shows, for "Show 7 things". */
  total: number;
  onSort: (sort: FolderSort) => void;
  onKind: (kind: string | null) => void;
  onLayout: (layout: FolderLayout) => void;
}

export function FilterSortSheet(props: FilterSortSheetProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = props.kinds.find((option) => option.kind === props.kind);
  return (
    <>
      <button
        type="button"
        class="filter-sort-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={filterSortName(props.sort, selected ?? null)}
        onClick={() => setOpen(true)}
      >
        <IconSliders />
        <span aria-hidden="true">Filter &amp; sort</span>
      </button>
      {open &&
        createPortal(
          <Overlay
            kind="sheet"
            labelledBy="filter-sort-title"
            onClose={() => setOpen(false)}
          >
            <div class="filter-sort">
              <header class="filter-sort-head">
                <h2 id="filter-sort-title" class="filter-sort-title">
                  Filter &amp; sort
                </h2>
                <button
                  type="button"
                  class="filter-sort-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <IconClose />
                </button>
              </header>
              <Choices
                label="Sort by"
                value={props.sort}
                choices={FOLDER_SORTS.map((sort) => ({
                  value: sort,
                  text: SORT_LABELS[sort],
                }))}
                onPick={(value) => props.onSort(value as FolderSort)}
              />
              <Choices
                label="Show"
                value={props.kind ?? ''}
                choices={[
                  { value: '', text: 'All kinds' },
                  ...props.kinds.map((option) => ({
                    value: option.kind,
                    text: `${option.label}s ${option.count}`,
                  })),
                ]}
                onPick={(value) => props.onKind(value === '' ? null : value)}
              />
              <Choices
                label="Layout"
                value={props.layout}
                choices={[
                  { value: 'list', text: 'List' },
                  { value: 'grid', text: 'Grid' },
                ]}
                onPick={(value) => props.onLayout(value as FolderLayout)}
              />
              <button
                type="button"
                class="button filter-sort-done"
                onClick={() => setOpen(false)}
              >
                Show {props.total} {props.total === 1 ? 'thing' : 'things'}
              </button>
            </div>
          </Overlay>,
          document.body,
        )}
    </>
  );
}

interface ChoicesProps {
  label: string;
  value: string;
  choices: readonly { value: string; text: string }[];
  onPick: (value: string) => void;
}

function Choices({ label, value, choices, onPick }: ChoicesProps): JSX.Element {
  return (
    <div class="filter-sort-group" role="radiogroup" aria-label={label}>
      <p class="filter-sort-label" aria-hidden="true">
        {label}
      </p>
      <div class="filter-sort-options">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            class="filter-sort-option"
            aria-checked={choice.value === value}
            onClick={() => onPick(choice.value)}
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
