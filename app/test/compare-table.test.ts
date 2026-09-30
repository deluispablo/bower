import { describe, expect, it } from 'vitest';

import {
  APPLY_COLUMN,
  cellText,
  columnExtras,
  compareColumns,
  desktopExplainer,
  MADE_FOR_COLUMN,
  madeForBadge,
  orderedColumnIds,
  shownColumns,
  sortNotes,
  tableMarkdown,
  toggleColumn,
} from '../src/compare.js';
import type { CompareColumn, CompareNote } from '../src/compare.js';
import { kindById } from '../src/kinds.js';

function note(
  name: string,
  fields: Record<string, unknown>,
  madeFor?: string[],
): CompareNote {
  return {
    id: `id-${name}`,
    name: `${name}.md`,
    modifiedTime: '2026-09-28T08:00:00Z',
    kind: 'job-offer',
    fields,
    bowerOrigins: {},
    ...(madeFor === undefined ? {} : { madeFor }),
  };
}

const kind = kindById('job-offer');
if (kind === undefined) throw new Error('no job-offer kind');

const northwind = note(
  'Northwind',
  {
    salary: 72000,
    score: 79,
    status: 'new',
    apply_link: 'https://jobs.example.com/apply?a=1',
    interview_panel: 'Alex | Sam',
  },
  ['CV · Northwind', 'Letter · Northwind', 'CV · Northwind v2'],
);
const fabrikam = note('Fabrikam', {
  salary: 65000,
  score: 91,
  status: 'applied',
});
const contoso = note('Contoso', {
  salary: 70000,
  score: 55,
  apply_link: 'not a link',
});
const offers = [northwind, fabrikam, contoso];

function shownExtras(extras: CompareColumn[]): CompareColumn[] {
  return extras.filter((column) => column.optional !== true);
}

describe('Made for it and Apply columns (R-CMP-8)', () => {
  it('adds them after Status when a note has the data', () => {
    const extras = columnExtras(kind, offers);
    const ids = compareColumns(kind, undefined, shownExtras(extras)).map(
      (c) => c.id,
    );
    expect(ids.slice(-3)).toEqual(['status', MADE_FOR_COLUMN, APPLY_COLUMN]);
    expect(extras.find((c) => c.id === MADE_FOR_COLUMN)?.label).toBe(
      'Made for it',
    );
  });

  it('adds neither when no note has the data', () => {
    const ids = columnExtras(kind, [fabrikam]).map((c) => c.id);
    expect(ids).not.toContain(MADE_FOR_COLUMN);
    expect(ids).not.toContain(APPLY_COLUMN);
  });

  it('reads the badge from made_for and the link from apply_link', () => {
    const columns = compareColumns(kind, undefined, columnExtras(kind, offers));
    const made = columns.find((c) => c.id === MADE_FOR_COLUMN);
    const apply = columns.find((c) => c.id === APPLY_COLUMN);
    if (made === undefined || apply === undefined) throw new Error('columns');
    expect(madeForBadge(northwind)).toBe('CV · Letter');
    expect(cellText(kind, northwind, made)).toBe('CV · Letter');
    expect(cellText(kind, fabrikam, made)).toBe('—');
    expect(cellText(kind, northwind, apply)).toBe('Apply');
    // Not a web address: no link.
    expect(cellText(kind, contoso, apply)).toBe('—');
  });

  it('sorts on them, empty last', () => {
    const sorted = sortNotes(
      kind,
      offers,
      { column: MADE_FOR_COLUMN, direction: 'asc' },
      columnExtras(kind, offers),
    );
    expect(sorted[0]?.name).toBe('Northwind.md');
  });
});

describe('The column choice (R-CMP-7)', () => {
  const extras = columnExtras(kind, offers);
  const columns = compareColumns(kind, undefined, extras);

  it('offers a rule-added text field, off by default', () => {
    const panel = columns.find((c) => c.id === 'interview_panel');
    expect(panel?.optional).toBe(true);
    expect(shownColumns(columns).map((c) => c.id)).not.toContain(
      'interview_panel',
    );
  });

  it('shows exactly the stored choice, the title always', () => {
    const shown = shownColumns(columns, ['interview_panel', 'salary']);
    expect(shown.map((c) => c.id)).toEqual([
      'title',
      'salary',
      'interview_panel',
    ]);
  });

  it('toggles one column from the defaults', () => {
    const off = toggleColumn(columns, undefined, 'salary');
    expect(off).not.toContain('salary');
    expect(off).toContain('status');
    expect(toggleColumn(columns, off, 'salary')).toContain('salary');
    expect(toggleColumn(columns, undefined, 'title')).not.toContain('title');
  });

  it('keeps an optional column in the stored order', () => {
    const order = orderedColumnIds(kind, ['interview_panel'], extras);
    expect(order[1]).toBe('interview_panel');
  });
});

describe('Copy as table (R-CMP-9)', () => {
  const extras = columnExtras(kind, offers);
  const all = compareColumns(kind, undefined, extras);

  it('writes the visible columns in order, sorted rows, Apply as a link', () => {
    const columns = shownColumns(all, ['score', 'apply_link']);
    const sorted = sortNotes(
      kind,
      offers,
      { column: 'score', direction: 'desc' },
      extras,
    );
    expect(tableMarkdown(kind, sorted, columns)).toBe(
      [
        '| Offer | Your score | Apply |',
        '| --- | --- | --- |',
        '| Fabrikam | 91/100 | — |',
        '| Northwind | 79/100 | [Apply](https://jobs.example.com/apply?a=1) |',
        '| Contoso | 55/100 | — |',
      ].join('\n'),
    );
  });

  it('follows the sort direction and hidden columns', () => {
    const columns = shownColumns(all, ['score']);
    const sorted = sortNotes(
      kind,
      offers,
      { column: 'score', direction: 'asc' },
      extras,
    );
    const lines = tableMarkdown(kind, sorted, columns).split('\n');
    expect(lines[0]).toBe('| Offer | Your score |');
    expect(lines.slice(2).map((l) => l.split(' | ')[0])).toEqual([
      '| Contoso',
      '| Northwind',
      '| Fabrikam',
    ]);
  });

  it('escapes a pipe in a cell', () => {
    const columns = shownColumns(all, ['interview_panel']);
    expect(tableMarkdown(kind, [northwind], columns)).toContain('Alex \\| Sam');
  });
});

describe('The desktop explainer (Compare-Table-1280)', () => {
  it('says what Bower read, where the score comes from, and how to sort', () => {
    expect(desktopExplainer(kind, true)).toBe(
      'Bower read the same things from each offer. Your score comes from your job-offer rule. Click a header to sort.',
    );
  });

  it('leaves the score sentence out when there is no score column', () => {
    expect(desktopExplainer(kind, false)).toBe(
      'Bower read the same things from each offer. Click a header to sort.',
    );
  });
});
