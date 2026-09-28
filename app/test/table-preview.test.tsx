// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { DrivePreview } from '../src/components/drive-preview.js';
import {
  MAX_TABLE_ROWS,
  TablePreview,
  dataRowCount,
  parseCsv,
  rowsLine,
} from '../src/components/table-preview.js';

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('Month,Rent\nNov,2150\nDec,2150\n')).toEqual([
      ['Month', 'Rent'],
      ['Nov', '2150'],
      ['Dec', '2150'],
    ]);
  });

  it('reads CRLF line ends and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas, quotes and line breaks inside a quoted cell', () => {
    expect(parseCsv('name,note\n"Smith, A","said ""hi""\nthere"\n')).toEqual([
      ['name', 'note'],
      ['Smith, A', 'said "hi"\nthere'],
    ]);
  });

  it('keeps empty cells, drops blank lines, needs no final newline', () => {
    expect(parseCsv('a,,c\n\n1,2,')).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('rowsLine and dataRowCount', () => {
  it('says how many of how many rows are shown', () => {
    expect(rowsLine(5, 24)).toBe(
      'Showing 5 of 24 rows. Scroll the table sideways for more columns.',
    );
    expect(dataRowCount([['h'], ['1'], ['2']])).toBe(2);
    expect(dataRowCount([])).toBe(0);
  });
});

describe('TablePreview', () => {
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (host !== null) render(null, host);
    host?.remove();
    host = null;
  });

  function mount(rows: string[][]): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    void act(() => {
      render(h(TablePreview, { rows }), host as HTMLElement);
    });
    return host;
  }

  it('shows the header, the rows and the count line', () => {
    const el = mount([
      ['Month', 'Rent'],
      ['Nov', '2150'],
      ['Dec', '2150'],
    ]);
    expect(
      Array.from(el.querySelectorAll('th')).map((th) => th.textContent),
    ).toEqual(['Month', 'Rent']);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('Showing 2 of 2 rows.');
  });

  it('shows only the first 200 rows', () => {
    const rows = [['n']];
    for (let i = 0; i < 250; i++) rows.push([String(i)]);
    const el = mount(rows);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(MAX_TABLE_ROWS);
    expect(el.textContent).toContain('Showing 200 of 250 rows.');
  });

  it('says so when the file is empty', () => {
    expect(mount([]).textContent).toContain('This spreadsheet is empty.');
  });
});

describe('DrivePreview', () => {
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (host !== null) render(null, host);
    host?.remove();
    host = null;
  });

  function mount(demo: boolean): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    void act(() => {
      render(
        h(DrivePreview, {
          id: 'FILE_ID',
          title: 'Costs',
          label: 'Preview from Google Drive',
          demo,
        }),
        host as HTMLElement,
      );
    });
    return host;
  }

  it("frames Drive's own preview under its label", () => {
    const el = mount(false);
    expect(el.textContent).toContain('Preview from Google Drive');
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://drive.google.com/file/d/FILE_ID/preview',
    );
  });

  it('draws no frame in the demo', () => {
    const el = mount(true);
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('Not in the demo.');
  });
});
