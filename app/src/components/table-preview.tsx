/**
 * A CSV as a table (issue #604, board `Phone-File-Sheet`): the first row is
 * the header, the next 200 are shown, and a line says how many there are.
 * `parseCsv` reads the text in the browser (quotes, commas inside quotes,
 * CRLF); the file is fetched once by the file screen.
 */

import type { JSX } from 'preact';

/** How many data rows the table shows. */
export const MAX_TABLE_ROWS = 200;

/**
 * The rows of CSV `text`, each a list of cells. Handles quoted cells (with
 * `""` for a quote, commas and line breaks inside), CRLF and LF line ends and
 * a leading byte-order mark. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endRow = (): void => {
    row.push(cell);
    cell = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (source.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source.charAt(i + 1) === '\n') i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** The count of data rows: every row but the header. */
export function dataRowCount(rows: readonly string[][]): number {
  return Math.max(0, rows.length - 1);
}

/** "Showing 5 of 24 rows. Scroll the table sideways for more columns." */
export function rowsLine(shown: number, total: number): string {
  return `Showing ${shown} of ${total} ${total === 1 ? 'row' : 'rows'}. Scroll the table sideways for more columns.`;
}

export function TablePreview({
  rows,
}: {
  rows: readonly string[][];
}): JSX.Element {
  const header = rows[0];
  if (header === undefined) {
    return <p class="file-preview-note">This spreadsheet is empty.</p>;
  }
  const total = dataRowCount(rows);
  const body = rows.slice(1, 1 + MAX_TABLE_ROWS);
  return (
    <div class="table-preview">
      <div class="table-preview-scroll">
        <table>
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {header.map((_, c) => (
                  <td key={c}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="table-preview-note">{rowsLine(body.length, total)}</p>
    </div>
  );
}
