/** C09 corpus: the four question cases answer through main with their replies and score per request (c09-corpus AC1-AC3). */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { caseReplies, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASES = [
  { id: 'c09-two-source-answer', words: 'What are the rent and deposit for the Larkspur Lane flat?' },
  { id: 'c09-not-in-sources', words: 'Does the Larkspur Lane flat allow pets?' },
  { id: 'c09-original-over-summary', words: 'When must Alex reply to the Larkspur Lane offer?' },
  { id: 'c09-burst-pipe', words: 'Does my home insurance cover a burst pipe, and how much would I pay myself?' },
] as const;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

/** The one answer the case's reply gives, as written. */
async function replied(id: string): Promise<string> {
  const [first] = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ answers?: Array<{ text?: string }> }>;
  return first?.answers?.[0]?.text ?? 'no answer in replies.json';
}

async function run(id: string) {
  const c = await loadCase(join(ROOT, id));
  const calls: string[] = [];
  const replies = caseReplies(id);
  const counted: ClaudeSpawn = async (call) => { calls.push(call.input); return replies(call); };
  return { c, calls, result: await runWithClaude(c, counted) };
}

describe('c09-corpus', () => {
  it.each(CASES)('AC1 c09-corpus-score: $id scores clean through main with its replies and two model calls', async ({ id }) => {
    const { result, calls } = await run(id);
    expect(result.code).toBe(0);
    expect(result.score).toEqual({ pass: true, unmet: [] });
    expect(calls).toHaveLength(2);
  });

  it.each(CASES)('AC2 c09-corpus-row: $id stores the reply\'s answer as its request\'s done text, byte for byte', async ({ id, words }) => {
    const { result } = await run(id);
    const done = (JSON.parse(result.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ text: string; done?: string }> }).done;
    expect(done.filter((row) => row.text === words).map((row) => row.done)).toEqual([await replied(id)]);
  });

  it.each([...CASES, { id: 'c09-closest-flat', words: 'Which flat is closest to Ferrowick?' }])('guard c09-corpus-fixture: $id is scripted and checks its answer per request, never requests.json as text', async ({ id, words }) => {
    const c = await loadCase(join(ROOT, id));
    expect(c.covers).toBe('scripted');
    expect((c.expected.notes ?? []).filter((n) => n.path === SYSTEM.requests)).toEqual([]);
    expect(((c.expected as { answers?: Array<{ request: string }> }).answers ?? []).map((a) => a.request)).toEqual([words]);
  });

  const C09_IDS = [...CASES.map((c) => c.id), 'c09-closest-flat'];

  it.each(C09_IDS)('guard c09-corpus-strength: %s expects an exact created list, files present and links that resolve (ruling 2)', async (id) => {
    const { expected } = await loadCase(join(ROOT, id));
    expect(Array.isArray(expected.report?.created), 'an exact created list').toBe(true);
    expect(expected.report?.createdAtLeast, 'never an at-least count').toBeUndefined();
    expect(expected.files?.present?.length ?? 0, 'files present').toBeGreaterThan(0);
    expect(expected.linksResolve, 'links resolve').toBe(true);
  });

  it.each(C09_IDS)('AC3 c09-corpus-readme: %s has a scripted C09 row in the README (ruling 4)', async (id) => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toMatch(new RegExp(`^\\| ${id} \\| C09 \\| scripted \\|`, 'm'));
  });

  it('AC3 c09-corpus-readme: the README documents the answers and tables expectation keys, one line each (ruling 4)', async () => {
    const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
    expect(readme).toMatch(/^- `answers`: \S.*$/m);
    expect(readme).toMatch(/^- `tables`: \S.*$/m);
  });
});

/** A case's row in a corpus table: the line that starts with its id cell. */
const row = (file: string, id: string): string | undefined => readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith(`| ${id} |`));
it('corpus-fix-rubrics AC1: adapted scenarios have current synthetic provenance', async () => {
  const { c, result } = await run('c09-burst-pipe');
  expect(result.code).toBe(0);
  const report = (result.lastRun as { run?: { report?: { filed?: unknown[]; updated?: unknown[]; created?: Array<{ path: string; what: string }> } } }).run?.report;
  expect([report?.filed, report?.updated], 'nothing filed or updated').toEqual([[], []]);
  expect(report?.created?.map((r) => [r.path, r.what]), 'the health note is the one created row').toEqual([['Bower health.md', 'Checked your notes for broken links.']]);
  const outside = Object.keys(result.after).filter((p) => !p.startsWith('.bower/') && result.after[p] !== c.folder[p]);
  expect(outside, 'outside Bower\'s own files only the health note is new, and no note changes').toEqual(['Bower health.md']);
  expect(`${c.source}\n${c.rubric}`, 'no benchmark origin').not.toMatch(/bench/i);
  expect(c.rubric).toContain("The run's one new file is Bower's health note, which is Bower's own bookkeeping, not a change to the person's notes.");
  expect(c.source).toBe('new (C09; a made-up policy answered from its original and its note)');
  expect(row(join(ROOT, 'README.md'), c.id)).toBe('| c09-burst-pipe | C09 | scripted | new (C09; a made-up policy answered from its original and its note) |');
  expect(row(resolve(ROOT, '../fixtures/p4-method-rubric-changes.md'), c.id)).toBe('| c09-burst-pipe | changed | An answer from the notes; nothing filed and no note changed, Bower\'s health note its only new file (corpus-fix-rubrics AC1). |');
});
