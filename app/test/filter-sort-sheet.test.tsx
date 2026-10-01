// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FilterSortSheet,
  filterSortName,
  showThings,
  whatIsOn,
} from '../src/components/filter-sort-sheet.js';
import type { FilterSortChoice } from '../src/components/filter-sort-sheet.js';

const DEFAULTS: FilterSortChoice = {
  sort: 'newest',
  kind: null,
  layout: 'list',
};
const KINDS = [{ kind: 'note', label: 'Note', plural: 'Notes', count: 9 }];

let root: HTMLDivElement = document.createElement('div');

function mount(value: FilterSortChoice, onApply = vi.fn()): typeof onApply {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(
      h(FilterSortSheet, {
        value,
        defaults: DEFAULTS,
        kinds: KINDS,
        countFor: (choice: FilterSortChoice) => (choice.kind === null ? 9 : 1),
        onApply,
      }),
      root,
    );
  });
  return onApply;
}

const button = (): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>('.filter-sort-btn');

function chip(text: string): HTMLButtonElement | undefined {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ].find((el) => el.textContent === text);
}

afterEach(() => {
  void act(() => render(null, root));
  document.body.replaceChildren();
});

describe('whatIsOn and the button name (R-FILTER-2)', () => {
  it('names the default "Filter and sort"', () => {
    expect(filterSortName(whatIsOn(DEFAULTS, DEFAULTS, KINDS))).toBe(
      'Filter and sort',
    );
  });

  it('says what is not the default', () => {
    const grid = { ...DEFAULTS, layout: 'grid' as const };
    expect(filterSortName(whatIsOn(grid, DEFAULTS, KINDS))).toBe(
      'Filter and sort (grid layout on)',
    );
    const notes = { ...DEFAULTS, kind: 'note', sort: 'name' as const };
    expect(filterSortName(whatIsOn(notes, DEFAULTS, KINDS))).toBe(
      'Filter and sort (sorted name, notes only)',
    );
  });

  it('counts things in words (R-FILTER-3)', () => {
    expect(showThings(1)).toBe('Show 1 thing');
    expect(showThings(9)).toBe('Show 9 things');
  });
});

describe('FilterSortSheet (§3.34)', () => {
  it('has no dot by default and a dot with the name when not default', () => {
    mount(DEFAULTS);
    expect(button()?.getAttribute('aria-label')).toBe('Filter and sort');
    expect(button()?.querySelector('.filter-sort-dot')).toBeNull();
    void act(() => render(null, root));
    mount({ ...DEFAULTS, layout: 'grid' });
    expect(button()?.getAttribute('aria-label')).toBe(
      'Filter and sort (grid layout on)',
    );
    expect(button()?.querySelector('.filter-sort-dot')).not.toBeNull();
  });

  it('opens "Filter & sort" with its groups, ✕ and "Show n things"', () => {
    mount(DEFAULTS);
    void act(() => button()?.click());
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('#filter-sort-title')?.textContent).toBe(
      'Filter & sort',
    );
    expect(
      dialog?.querySelector('[aria-label="Close Filter and sort"]'),
    ).not.toBeNull();
    expect(
      [...document.body.querySelectorAll('.filter-sort-label')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['Sort by', 'Show', 'Layout']);
    expect(chip('Notes 9')).toBeDefined();
    expect(document.body.querySelector('.filter-sort-done')?.textContent).toBe(
      'Show 9 things',
    );
  });

  it('changes a draft whose count follows live, and applies it on Show', () => {
    const onApply = mount(DEFAULTS);
    void act(() => button()?.click());
    void act(() => chip('Notes 9')?.click());
    void act(() => chip('Grid')?.click());
    expect(onApply).not.toHaveBeenCalled();
    const show =
      document.body.querySelector<HTMLButtonElement>('.filter-sort-done');
    expect(show?.textContent).toBe('Show 1 thing');
    void act(() => show?.click());
    expect(onApply).toHaveBeenCalledWith({
      sort: 'newest',
      kind: 'note',
      layout: 'grid',
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('throws the draft away on ✕', () => {
    const onApply = mount(DEFAULTS);
    void act(() => button()?.click());
    void act(() => chip('Grid')?.click());
    void act(() => {
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Close Filter and sort"]',
        )
        ?.click();
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
