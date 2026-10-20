/**
 * The corpus README is the inventory of the retained cases: one row per case directory, in continuous tables, whose
 * Capability and Covers cells repeat `case.json`. `covers` is a label, never proof that a test executes the case.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORPUS_EXECUTION } from '../src/corpus';

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

/** The README's denominators (corpus-registry AC4): what is retained, excluded, executable and live-ready, and every setup gap. */
const DENOMINATORS = `The registry, \`CORPUS_EXECUTION\` in \`runner/src/corpus.ts\`, records each case's consumer test, setup, execution mode
and live readiness apart from \`covers\`. Of the 90 retained cases, the eight above are excluded and 82 can execute; 80 of
them are live-ready. Eight need a setup beyond their own files. The test driver registers the setups of six of them
(\`CORPUS_SETUPS\` in \`runner/test/corpus-run.ts\`), and a live run applies them as the consumer test does:
b1-maintenance-crash-resume (maintenance-reply-lost), c12-group-waits (group-reply-refused),
c12-tool-interruption-recovery (filing-answer-lost), c17-b56-cv-profile and c17-b56-offer-job-search
(career-profile-property), and c17-b8-settled-recovery (hub-edit-refused-log-lost). Two are not live-ready, and a
live run refuses them: c12-admission-waits (admission-estimate-2) and c12-model-failure-retry (model-call-fails).`;

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

  it('corpus-registry AC4: coverage denominators separate inventory and runnable cases', () => {
    const all = Object.entries(CORPUS_EXECUTION ?? {});
    const executable = all.filter(([, d]) => d.mode !== 'excluded');
    expect({ retained: dirs.length, registered: all.length, excluded: all.length - executable.length, executable: executable.length,
      live: executable.filter(([, d]) => d.live).length }, 'the denominators').toEqual({ retained: 90, registered: 90, excluded: 8, executable: 82, live: 80 });
    // Each setup is listed; it is live-ready only when the test driver registers it (corpus-live-hooks).
    const gaps = executable.filter(([, d]) => d.setup !== null);
    expect(Object.fromEntries(gaps.map(([id, d]) => [id, { setup: d.setup, live: d.live }]))).toEqual({
      'b1-maintenance-crash-resume': { setup: 'maintenance-reply-lost', live: true },
      'c12-admission-waits': { setup: 'admission-estimate-2', live: false },
      'c12-group-waits': { setup: 'group-reply-refused', live: true },
      'c12-model-failure-retry': { setup: 'model-call-fails', live: false },
      'c12-tool-interruption-recovery': { setup: 'filing-answer-lost', live: true },
      'c17-b56-cv-profile': { setup: 'career-profile-property', live: true },
      'c17-b56-offer-job-search': { setup: 'career-profile-property', live: true },
      'c17-b8-settled-recovery': { setup: 'hub-edit-refused-log-lost', live: true },
    });
    for (const [id, d] of gaps) expect(DENOMINATORS, id).toMatch(new RegExp(`${id}[^(]*\\(${d.setup}\\)`));
    expect(readme).toContain(DENOMINATORS);
    expect(readme.replace(/\s+/g, ' '), 'C17 is registered').not.toContain('C17 registration');
  });
});
