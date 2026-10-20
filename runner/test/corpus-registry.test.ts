/**
 * The corpus registry (corpus-registry): one execution descriptor per retained case, recorded apart from `covers`, and
 * case metadata validated when a case loads, before anything is seeded. C17 is a corpus capability.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { CORPUS_CAPABILITIES, CORPUS_EXECUTION, loadCase, loadCorpus, type CaseExecution } from '../src/corpus';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const TESTS = import.meta.dirname;
const registry: Readonly<Record<string, CaseExecution>> = CORPUS_EXECUTION ?? {};
const dirs = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, 'case.json'))).map((d) => d.name).sort();

/** A consumer names its case: by id, or by its B7/B8 slug helper (`'c17-b7-' + slug`, `` `c17-b8-${name}` ``) and the quoted slug. */
function names(text: string, id: string): boolean {
  const dynamic = /^(c17-b[78]-)(.+)$/.exec(id);
  return text.includes(id) || (!!dynamic && text.includes(dynamic[1] ?? '') && text.includes(`'${dynamic[2] ?? ''}'`));
}

it('corpus-registry AC1: every retained case has exactly one execution descriptor', async () => {
  expect(Object.keys(registry).sort(), 'one descriptor per retained case').toEqual(dirs);
  const cases = await loadCorpus(ROOT);
  for (const c of cases) {
    const d = registry[c.id];
    const replies = existsSync(join(c.dir, 'replies.json'));
    expect(d, c.id).toBeDefined();
    if (!d) continue;
    // The mode follows the case's own files, not its covers label.
    if (d.mode === 'excluded') expect({ id: c.id, replies, covers: c.covers, opens: c.rubric.startsWith('Unsupported today: ') }).toEqual({ id: c.id, replies: false, covers: 'model', opens: true });
    else expect({ id: c.id, replies: d.mode === 'replies' }).toEqual({ id: c.id, replies });
    if (d.mode === 'provider') expect({ id: c.id, covers: c.covers }).toEqual({ id: c.id, covers: 'scripted' });
    if (d.mode === 'inline') expect({ id: c.id, covers: c.covers }).toEqual({ id: c.id, covers: 'model' });
    // The consumer runs the case: it exists, makes a run, and names the case (the scripted loop runs every scripted case).
    const file = join(TESTS, d.consumer);
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    expect({ id: c.id, consumer: d.consumer, runs: /runScripted|runWithClaude|runOnDrive|caseReplies/.test(text) }).toEqual({ id: c.id, consumer: d.consumer, runs: true });
    const loop = d.consumer === 'corpus.test.ts' && c.covers === 'scripted';
    expect({ id: c.id, consumer: d.consumer, names: names(text, c.id) || loop }).toEqual({ id: c.id, consumer: d.consumer, names: true });
    // Live readiness is ruled with the registered setups (corpus-hooks.test.ts, corpus-live-hooks AC4).
  }
  const modes = Object.values(registry).reduce<Record<string, number>>((n, d) => ({ ...n, [d.mode]: (n[d.mode] ?? 0) + 1 }), {});
  expect(modes).toEqual({ replies: 69, provider: 7, inline: 6, excluded: 8 });
  // Covers is a label: scripted cases run from replies.json, model cases run offline, and no mode is read from covers.
  expect(registry['c05-keep-one-note']).toEqual({ consumer: 'corpus-driver.test.ts', setup: null, mode: 'replies', live: true });
  expect(registry['c11-rule-worded']).toEqual({ consumer: 'corpus.test.ts', setup: null, mode: 'provider', live: true });
  expect(registry['c04-garden-newsletter']).toEqual({ consumer: 'c04-incorporation.test.ts', setup: null, mode: 'inline', live: true });
  // Dynamic consumers: the B8 tests load their cases through `c17-b8-${name}`, B7 through `'c17-b7-' + slug`.
  expect(Object.fromEntries(Object.entries(registry).filter(([id]) => /^c17-b[78]-/.test(id)))).toEqual({
    'c17-b7-authority-full-cap': { consumer: 'b7-incorporation.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b7-automatic-capacity-order': { consumer: 'b7-incorporation.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b7-automatic-growth-replay': { consumer: 'b7-incorporation.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b7-reuse-known': { consumer: 'b7-incorporation.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b8-bounded-encoding': { consumer: 'b8-log.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b8-findings-refresh': { consumer: 'b8-health.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b8-report-only-grammar': { consumer: 'b8-health.test.ts', setup: null, mode: 'replies', live: true },
    'c17-b8-settled-recovery': { consumer: 'b8-health.test.ts', setup: 'hub-edit-refused-log-lost', mode: 'replies', live: true },
  });
  // Negative controls: a consumer that never names the case, or names only another slug, is not its consumer.
  expect(names("fixture('bounded-encoding')", 'c17-b8-findings-refresh')).toBe(false);
  expect(names("`c17-b8-${name}` fixture('bounded-encoding')", 'c17-b8-findings-refresh')).toBe(false);
  expect(names("`c17-b8-${name}` fixture('findings-refresh')", 'c17-b8-findings-refresh')).toBe(true);
}, 60_000);

const scratch = mkdtempSync(join(tmpdir(), 'bower-registry-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let made = 0;
const VALID = {
  id: 'x-case', capability: 'C17', title: 'A made-up case', covers: 'model', source: 'new', scope: 'all', allowWeb: false,
  inbox: [{ line: 'Alex’s seed list', files: ['Seeds.txt'] }], journal: [{ kind: 'request', text: 'Tidy up.' }], questions: [],
  bowerOwned: ['Rules.md'], presses: [{ between: [{ kind: 'answer', question: { kind: 'folder' }, yes: true }] }, { request: { kind: 'tidy' } }],
};

/** A case folder named `x-case` in a fresh parent: `meta` as its case.json (a string is written as it is), one inbox file, Rules.md. */
function caseDir(meta: unknown): string {
  const dir = join(scratch, String(++made), 'x-case');
  mkdirSync(join(dir, 'inbox'), { recursive: true });
  mkdirSync(join(dir, 'folder'), { recursive: true });
  writeFileSync(join(dir, 'case.json'), typeof meta === 'string' ? meta : JSON.stringify(meta));
  writeFileSync(join(dir, 'expected.json'), '{}');
  writeFileSync(join(dir, 'rubric.md'), 'A made-up rubric for the registry test.\n');
  writeFileSync(join(dir, 'inbox', 'Seeds.txt'), 'Alex’s seed list.\n');
  writeFileSync(join(dir, 'folder', 'Rules.md'), '---\nby: bower\n---\n');
  return dir;
}

it('corpus-registry AC2: metadata is validated before setup and includes C17', async () => {
  expect(CORPUS_CAPABILITIES as readonly string[], 'C17 is a corpus capability').toContain('C17');
  expect((await loadCorpus(ROOT)).filter((c) => c.capability === 'C17')).toHaveLength(37);
  // Positive control: a well-formed made-up C17 case loads.
  expect((await loadCase(caseDir(VALID))).id).toBe('x-case');
  const refused: Array<[string, unknown, string]> = [
    ['an unknown capability', { ...VALID, capability: 'C99' }, 'corpus case x-case: case.json.capability: Invalid option: expected one of "C04"|"C05"|"C06"|"C07"|"C08"|"C09"|"C10"|"C11"|"C12"|"C13"|"C15"|"C17"'],
    ['a pile whose files are not a list', { ...VALID, inbox: [{ line: '', files: 'Seeds.txt' }] }, 'corpus case x-case: case.json.inbox[0].files: Invalid input: expected array, received string'],
    ['a journal line of no known kind', { ...VALID, journal: [{ kind: 'note', text: 'Tidy up.' }] }, 'corpus case x-case: case.json.journal[0].kind: Invalid option: expected one of "request"|"rule"|"answer"'],
    ['a between step of no known kind', { ...VALID, presses: [{ between: [{ kind: 'delete', path: 'Rules.md' }] }] }, "corpus case x-case: case.json.presses[0].between[0].kind: Invalid discriminator value. Expected 'words' | 'edit' | 'create' | 'move' | 'answer'"],
    ['an answer whose yes is not a boolean', { ...VALID, presses: [{ between: [{ kind: 'answer', question: { kind: 'folder' }, yes: 'yes' }] }] }, 'corpus case x-case: case.json.presses[0].between[0].yes: Invalid input: expected boolean, received string'],
    ['a seeded question with no askedAt', { ...VALID, questions: [{ id: 'q-1', text: 'Is it for the plot?', yes: 'Yes', no: 'No' }] }, 'corpus case x-case: case.json.questions[0].askedAt: Invalid input: expected number, received undefined'],
    ['an id that is not its folder name', { ...VALID, id: 'y-case' }, 'corpus case x-case: case.json id "y-case" is not its folder name'],
    ['a pile file missing from inbox/', { ...VALID, inbox: [{ line: '', files: ['Missing.txt'] }] }, 'corpus case x-case: pile 1 names Missing.txt, which is not in inbox/'],
    ['a Bower-owned file missing from folder/', { ...VALID, bowerOwned: ['Missing.md'] }, 'corpus case x-case: bowerOwned names Missing.md, which is not in folder/'],
    ['the legacy shared seed folder', { ...VALID, folderFrom: '_bench-vault' }, 'corpus case x-case: case.json: Unrecognized key: "folderFrom"'],
    ['the legacy speed baseline', { ...VALID, speedBaseline: true }, 'corpus case x-case: case.json: Unrecognized key: "speedBaseline"'],
    ['the undo scope', { ...VALID, scope: 'undo' }, 'corpus case x-case: case.json.scope: Invalid option: expected one of "all"|"instructions"'],
    ['a case.json that is not JSON', '{"id": "x-case",', 'corpus case x-case: case.json is not JSON'],
  ];
  for (const [what, meta, message] of refused) await expect(loadCase(caseDir(meta)), what).rejects.toThrow(message);
  // Missing and unreadable corpus roots fail; no directory under a root is skipped, so a leftover seed folder fails too.
  const missing = join(scratch, 'no-such-root');
  await expect(loadCorpus(missing)).rejects.toThrow(`corpus root ${missing} cannot be read`);
  const file = join(scratch, 'a-file');
  writeFileSync(file, 'not a folder\n');
  await expect(loadCorpus(file)).rejects.toThrow(`corpus root ${file} cannot be read`);
  const leftover = join(scratch, 'with-seed');
  mkdirSync(join(leftover, '_bench-vault'), { recursive: true });
  await expect(loadCorpus(leftover)).rejects.toThrow('corpus case _bench-vault: case.json cannot be read');
});
