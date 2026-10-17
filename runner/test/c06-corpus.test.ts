/**
 * C06 c06-corpus (specs/c06-connections/spec.md AC23-AC24, R20): the four model cases land as scripted proof through
 * production main in TL-P4-34's form (a reason beside every link, hub lines only for news), each with a replay press.
 * AC25 (the scorer's identity check) and the clipping's relation line were cut on 2026-10-16.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { caseReplies, runWithClaude, type CaseRun } from './corpus-run';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const FERROWICK = 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md';
const CLIPPING_HUB = 'Projects/Job hunt/Job hunt.md';
/** Each case, the notes its first press changes and the notes no press touches. */
const CASES = [
  { id: 'c06-stored-project-connection', changed: ['Projects/Job hunt/Saltmere offer.md', 'Projects/Job hunt/Job hunt.md', 'Projects/Flat hunt/Flat hunt.md'], same: [] },
  { id: 'c06-shared-name-unrelated', changed: ['Projects/Garden shelter/Cedar.md'], same: ['Projects/Walking trip/Cedar.md'] },
  { id: 'c06-two-sources-attributed', changed: ['Projects/Workshop/Workshop.md', 'Projects/Moving day/Moving day.md'], same: [] },
  { id: 'c06-clipping-compared', changed: [CLIPPING_HUB], same: [FERROWICK] },
] as const;

const load = (id: string): Promise<LoadedCase> => loadCase(join(ROOT, id));
const isExecution = (call: ClaudeCall): boolean => (JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { selection?: unknown }).selection !== undefined;
/** Every call's phase, grouped by press (each press runs main in its own working directory). */
function phases(spawn: ClaudeSpawn) {
  const presses = new Map<string, Array<'selection' | 'execution'>>();
  const record = (call: ClaudeCall) => presses.set(call.cwd, [...presses.get(call.cwd) ?? [], isExecution(call) ? 'execution' : 'selection']);
  return { presses, spawn: async (call: ClaudeCall) => (record(call), spawn(call)) };
}
const pressOne = (run: CaseRun): CaseRun => run.runs?.[0] ?? run;
/** Every note expectation's strings, top level and per press (ruling 4). */
const expectations = (c: LoadedCase): string[] => [c.expected, ...c.expected.runs ?? []]
  .flatMap((e) => (e.notes ?? []).flatMap((n) => [...(n.contains ?? []), ...(n.timeline ?? [])]));

it.each(CASES)('AC23 c06-fixtures-landed: $id has scripted replies, a replay press and no pending wording (R20)', async ({ id }) => {
  const c = await load(id);
  expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
  expect(c.covers, 'the case is scripted proof now').toBe('scripted');
  expect(`${c.title}\n${c.source}\n${c.rubric}`, 'no pending proof wording').not.toMatch(/pending|future driver|preparation|scripted intent proof|not established/i);
  expect(c.expected.runs, 'press 1 and a replay press are both scored').toHaveLength(2);
  expect(c.expected.runs?.[0]?.report?.created ?? [], 'the first run\'s health note is expected').toContain('Bower health.md');
  // A link expectation holds its reason or its line's words in the same string, so a bare link cannot satisfy it (R1).
  for (const text of expectations(c)) expect(/^\s*\[\[[^\]]+\]\]\s*$/.test(text), `a bare link expectation: ${text}`).toBe(false);
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
  expect(readme, 'the README row says scripted').toMatch(new RegExp(`^\\| ${id} \\| C06 \\| scripted \\|`, 'm'));
});

it('AC23 c06-fixtures-landed: the stored-project note links each hub by title with its reason; the clipping\'s hub gets one news line and Ferrowick stays unchanged (R20)', async () => {
  const stored = expectations(await load('c06-stored-project-connection'));
  expect(stored.some((t) => t.startsWith('See also [[Job hunt]]: ')), 'the job hub by title, with its reason').toBe(true);
  expect(stored.some((t) => t.startsWith('See also [[Flat hunt]]: ')), 'the flat hub by title, with its reason').toBe(true);
  expect(stored.filter((t) => /\[\[Projects\//.test(t)), 'a unique title is never written by path (ruling 3)').toEqual([]);
  const clipping = await load('c06-clipping-compared');
  const hub = (clipping.expected.notes ?? []).find((n) => n.path === CLIPPING_HUB);
  expect(hub?.timeline?.filter((t) => /\S.* · \[\[Data analyst at Saltwick Co\]\]$/.test(t)) ?? [], 'one hub line citing the clipping, its news').toHaveLength(1);
  expect(hub?.timelineCount, 'one line more than the fixture\'s').toBe(2);
  expect(clipping.expected.unchanged ?? [], 'the Ferrowick note is unchanged').toContain(FERROWICK);
  expect(expectations(clipping).filter((t) => t.includes('Linked to [[')), 'no relation line (cut 2026-10-16)').toEqual([]);
  const rubricLog = await readFile(resolve(ROOT, '../fixtures/p4-method-rubric-changes.md'), 'utf8');
  const row = rubricLog.split('\n').find((l) => l.startsWith('| c06-clipping-compared |')) ?? '';
  expect(row, 'the rubric row keeps a verdict and a reason').toMatch(/^\| c06-clipping-compared \| (?:agrees|changed) \| .{10,}/);
  expect(row, 'the rubric row drops the clipping note that links Ferrowick (R20)').not.toMatch(/new note links/i);
});

it.each(CASES)('AC24 c06-case: $id scores clean through main, selection then execution, and the replay press adds nothing (R20)', async ({ id, changed, same }) => {
  expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
  const c = await load(id);
  const { presses, spawn } = phases(caseReplies(id));
  const final = await runWithClaude(c, spawn);
  const first = pressOne(final);
  // The ruling checks come before the score, so each fails on its own assertion.
  // Ruling 1: the replay press is a fresh tidy-up with its own request, not a redispatch of press 1.
  expect(final.requestAction?.kind, 'press 2 writes a new request').toBe('tidy');
  expect(first.requests?.map((r) => r.id) ?? [], 'press 2\'s request is new').not.toContain(final.requestAction?.id);
  expect(final.dispatch?.runId, 'press 2 is its own run').not.toBe(first.dispatch?.runId);
  // Ruling 3: both presses exit 0, even when a failed press leaves the notes as they were.
  expect([first.code, final.code], 'both presses exit 0').toEqual([0, 0]);
  // Ruling 2: each press's whole call list; a retry fails it (press 2's empty reply answers its execution).
  expect([...presses.values()], 'each press selection then execution, no retry').toEqual([['selection', 'execution'], ['selection', 'execution']]);
  expect(final.score).toEqual({ pass: true, unmet: [] });
  for (const path of changed) {
    expect(first.after[path], `${path} is changed by press 1`).not.toBe(c.folder[path]);
    expect(final.after[path], `${path}: the replay press adds nothing`).toBe(first.after[path]);
  }
  for (const path of same) expect(final.after[path], `${path} is unchanged`).toBe(c.folder[path]);
});

it.each(CASES)('AC24 guard c06-case: $id seeds every note it names', async ({ id, changed, same }) => {
  const c = await load(id);
  for (const path of [...changed, ...same].filter((p) => !p.endsWith('Saltmere offer.md'))) expect(c.folder[path], `${path} is seeded`).toBeDefined();
});
