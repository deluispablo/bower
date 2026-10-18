/**
 * The corpus README is the inventory of the retained cases: one row per case directory, in continuous tables, whose
 * Capability and Covers cells repeat `case.json`. `covers` is a label, never proof that a test executes the case.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const README = join(ROOT, 'README.md');
const ROW = /^\| ([a-z0-9][a-z0-9-]*) \|/;

/** The first cell of every case row, in every table; header and divider lines never match. */
function caseRows(text: string): string[] {
  return text.split('\n').flatMap((line) => line.match(ROW)?.[1] ?? []);
}

function inventoryGaps(rows: string[], dirs: string[]): { missing: string[]; duplicate: string[]; nonexistent: string[] } {
  const known = new Set(dirs);
  return {
    missing: dirs.filter((d) => !rows.includes(d)).sort(),
    duplicate: [...new Set(rows.filter((r, i) => rows.indexOf(r) !== i))].sort(),
    nonexistent: [...new Set(rows.filter((r) => !known.has(r)))].sort(),
  };
}

/** Row lines whose previous line is neither a row nor a divider: a table broken by prose or a blank line. */
function brokenRows(text: string): string[] {
  const lines = text.split('\n');
  return lines.filter((line, i) => ROW.test(line) && !(ROW.test(lines[i - 1] ?? '') || /^\| ---/.test(lines[i - 1] ?? '')));
}

/** Cells of a case's row: [id, capability, covers, source]. */
const cellsOf = (text: string, id: string): string[] =>
  text.split('\n').find((l) => l.startsWith(`| ${id} |`))?.split(' | ').map((c) => c.replace(/^\| | \|$/g, '')) ?? [];

/** Rows whose Covers differs from, or whose Capability does not start with, the case's own label. */
function labelGaps(text: string, cases: Array<{ id: string; capability: string; covers: string }>): string[] {
  return cases.filter((c) => {
    const [, capability = '', covers = ''] = cellsOf(text, c.id);
    return covers !== c.covers || !capability.startsWith(c.capability);
  }).map((c) => c.id);
}

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && readdirSync(join(ROOT, d.name)).includes('case.json'))
  .map((d) => d.name);
const readme = readFileSync(README, 'utf8');

describe('the corpus inventory', () => {
  it('corpus-inventory AC1: README is a bijection with the 90 retained cases', () => {
    expect(dirs.length).toBe(90);
    expect(inventoryGaps(caseRows(readme), dirs)).toEqual({ missing: [], duplicate: [], nonexistent: [] });
    expect(brokenRows(readme)).toEqual([]);

    // guard: passes before the fix
    const table = (...ids: string[]) => ['| Case | Capability |', '| --- | --- |', ...ids.map((id) => `| ${id} | C04 |`)].join('\n');
    const pair = ['a-1', 'b-2'];
    expect(inventoryGaps(caseRows(table('a-1')), pair)).toEqual({ missing: ['b-2'], duplicate: [], nonexistent: [] });
    expect(inventoryGaps(caseRows(table('a-1', 'a-1', 'b-2')), pair)).toEqual({ missing: [], duplicate: ['a-1'], nonexistent: [] });
    expect(inventoryGaps(caseRows(table('a-1', 'b-2', 'zz-9')), pair)).toEqual({ missing: [], duplicate: [], nonexistent: ['zz-9'] });
    expect(brokenRows(`${table('a-1')}\nSome prose.\n| b-2 | C04 |`)).toEqual(['| b-2 | C04 |']);
    expect(brokenRows(table('a-1', 'b-2'))).toEqual([]);
    expect(caseRows('| Case | Capability |\n| --- | --- |')).toEqual([]);
  });

  it('corpus-inventory AC2: inventory describes coverage and execution separately', () => {
    const cases = dirs.map((id) => {
      const json = JSON.parse(readFileSync(join(ROOT, id, 'case.json'), 'utf8')) as { capability: string; covers: string };
      return { id, capability: json.capability, covers: json.covers };
    });
    expect(labelGaps(readme, cases)).toEqual([]);
    expect(readme).not.toMatch(/scripted provider produces the expected outcome today|speed.baseline|_bench-vault/i);

    // guard: passes before the fix
    expect(labelGaps('| x-1 | C08 | model | new |', [{ id: 'x-1', capability: 'C08', covers: 'scripted' }])).toEqual(['x-1']);
    expect(labelGaps('| x-1 | C08 | scripted | new |', [{ id: 'x-1', capability: 'C08', covers: 'scripted' }])).toEqual([]);
  });
});
