/**
 * Filter & sort (spec §3.34, R-FILTER-1..3, boards PF-Filter, LI-Filter,
 * GR-Filter): the filter icon button on a folder's segments row (G-13)
 * opens a content sheet on the phone and a 320 popover under the button on
 * desktop, titled "Filter & sort" with ✕ "Close Filter and sort". Three
 * groups of pill chips: Sort by, Show (the kinds with their counts) and
 * Layout (List / Grid: the only place to choose it, GR-4).
 *
 * The chips change a draft; "Show <n> things" applies it and closes, ✕ or
 * Esc throws it away. n follows the draft live and equals what will be
 * shown (K-31). When the folder's choice is not its default, an 8 px dot
 * sits on the button and its name says what is on: "Filter and sort (grid
 * layout on)" (R-FILTER-2).
 */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { FOLDER_SORTS, SORT_LABELS } from '../folder-view.js';
import type { FolderSort } from '../folder-view.js';
import type { FolderLayout } from './folder-grid.js';
import { IconSliders } from './icons.js';
import { Overlay, OverlayHeader } from './overlay.js';
import '../styles/filter-sort-sheet.css';

/** One kind the folder holds, as the kind filter lists it. */
export interface KindChoice {
  kind: string;
  /** Singular, "Note". */
  label: string;
  /** Plural, "Notes". */
  plural: string;
  count: number;
}

/** What Filter & sort chooses. */
export interface FilterSortChoice {
  sort: FolderSort;
  /** The selected kind's id, `null` for all kinds. */
  kind: string | null;
  layout: FolderLayout;
}

/** The trigger's name with nothing changed. */
export const FILTER_SORT_NAME = 'Filter and sort';

/** What is on, in the button's name: "grid layout on", "sorted by name",
 * "notes only"; empty when the choice is the folder's default. */
export function whatIsOn(
  choice: FilterSortChoice,
  defaults: FilterSortChoice,
  kinds: readonly KindChoice[],
): string[] {
  const on: string[] = [];
  if (choice.layout !== defaults.layout) on.push(`${choice.layout} layout on`);
  if (choice.sort !== defaults.sort) {
    on.push(`sorted ${SORT_LABELS[choice.sort].toLowerCase()}`);
  }
  if (choice.kind !== defaults.kind) {
    const kind = kinds.find((option) => option.kind === choice.kind);
    on.push(`${(kind?.plural ?? 'one kind').toLowerCase()} only`);
  }
  return on;
}

/** The button's accessible name (R-FILTER-2): "Filter and sort", or
 * "Filter and sort (grid layout on)" when something is not the default. */
export function filterSortName(on: readonly string[]): string {
  return on.length === 0
    ? FILTER_SORT_NAME
    : `${FILTER_SORT_NAME} (${on.join(', ')})`;
}

/** "Show 1 thing", "Show 9 things" (R-FILTER-3). */
export function showThings(n: number): string {
  return `Show ${n} ${n === 1 ? 'thing' : 'things'}`;
}

export interface FilterSortSheetProps {
  value: FilterSortChoice;
  /** The folder's own default: newest first, all kinds, its layout. */
  defaults: FilterSortChoice;
  kinds: readonly KindChoice[];
  /** How many things `choice` would show, for "Show <n> things". */
  countFor: (choice: FilterSortChoice) => number;
  onApply: (choice: FilterSortChoice) => void;
}

export function FilterSortSheet({
  value,
  defaults,
  kinds,
  countFor,
  onApply,
}: FilterSortSheetProps): JSX.Element {
  const [draft, setDraft] = useState<FilterSortChoice | null>(null);
  const on = whatIsOn(value, defaults, kinds);
  const close = (): void => setDraft(null);
  const count = draft === null ? 0 : countFor(draft);

  return (
    <>
      <button
        type="button"
        class="icon-button filter-sort-btn"
        aria-haspopup="dialog"
        aria-expanded={draft !== null}
        aria-label={filterSortName(on)}
        onClick={() => setDraft(value)}
      >
        <IconSliders />
        {on.length > 0 && <span class="filter-sort-dot" aria-hidden="true" />}
      </button>
      {draft !== null && (
        <Overlay
          kind="sheet"
          desktopPlacement="anchor"
          labelledBy="filter-sort-title"
          onClose={close}
        >
          <div class="filter-sort">
            <OverlayHeader
              titleId="filter-sort-title"
              title="Filter & sort"
              closeLabel="Close Filter and sort"
              onClose={close}
            />
            <Choices
              label="Sort by"
              value={draft.sort}
              choices={FOLDER_SORTS.map((sort) => ({
                value: sort,
                text: SORT_LABELS[sort],
              }))}
              onPick={(sort) =>
                setDraft({ ...draft, sort: sort as FolderSort })
              }
            />
            <Choices
              label="Show"
              value={draft.kind ?? ''}
              choices={[
                { value: '', text: 'All kinds' },
                ...kinds.map((option) => ({
                  value: option.kind,
                  text: `${option.plural} ${option.count}`,
                })),
              ]}
              onPick={(kind) =>
                setDraft({ ...draft, kind: kind === '' ? null : kind })
              }
            />
            <Choices
              label="Layout"
              value={draft.layout}
              choices={[
                { value: 'list', text: 'List' },
                { value: 'grid', text: 'Grid' },
              ]}
              onPick={(layout) =>
                setDraft({ ...draft, layout: layout as FolderLayout })
              }
            />
            <div class="filter-sort-foot">
              <button
                type="button"
                class="btn filter-sort-done"
                onClick={() => {
                  onApply(draft);
                  close();
                }}
              >
                {showThings(count)}
              </button>
            </div>
          </div>
        </Overlay>
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
