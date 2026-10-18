/** C15's four cases land and score through production main: the runner prepares every admitted input itself (C15 R-lines). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subjectOf } from '../../src/data/contracts/questions';
import type { Question } from '../../src/data/contracts/types';
import { CONTEXT_BOUNDS } from '../src/claude';
import { loadCase, loadCorpus } from '../src/corpus';
import { extract } from '../src/extract';
import { AT, lastJson, replySequence, runWithClaude, scoreCase } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const CASES = ['c15-current-admitted-evidence', 'c15-context-budget-exhausted', 'c15-short-pdfs-read-whole', 'c15-image-only-pdf-asked'];

const obsoleteClaims = /(?<!no )\bapp(?:-side)? package\b|\b(?:app[- ]prepared|prepared (?:letter|text|extraction|artifact)|(?:proof|driver) pending|pending (?:scripted|driver)|future driver)\b/i;
const CONTEXT_CLAIM = /more[- ]context|context[- ]?(?:expansion|exchange)|additional context/i;
const OLD = ['c15-more-context-bounded', 'c15-scanned-letter', 'c15-stale-package-rebuilt'];
const NEW = ['c15-short-pdfs-read-whole', 'c15-image-only-pdf-asked', 'c15-current-admitted-evidence'];
const LOG = resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md');
const rowOf = (text: string, id: string): string => text.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
type Shown = { piles?: Array<{ things: Array<{ name: string; text: string | null }> }>; selection?: unknown };
/** The texts the execution inputs show for the thing named `name`. */
const shownIn = (inputs: string[], name: string): string[] => inputs.map((i) => lastJson<Shown>(i)).filter((j) => j.selection !== undefined)
  .flatMap((j) => (j.piles ?? []).flatMap((p) => p.things)).filter((t) => t.name === name).map((t) => t.text ?? '');

async function modelFor(id: string) {
  return replySequence(JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as unknown[]);
}

describe('C15 corpus cases through main', () => {
  it('AC11 wording control: a valid negative statement is allowed', () => {
    expect('There is no app package. The runner reads current source bytes.').not.toMatch(obsoleteClaims);
  });

  it.each(['The app prepared no text.', 'A valid prepared letter is reused.', 'Scripted input proof pending.', 'The app package is reused.'])('AC11 obsolete claim control: %s', (text) => {
    expect(text).toMatch(obsoleteClaims);
  });

  it('AC12 missing replies fail during setup before main', async () => {
    await expect(modelFor('c15-missing-replies')).rejects.toThrow(/ENOENT.*replies\.json/);
  });

  it.each(CASES)('AC11 c15-corpus-fixtures-landed: %s has scripted replies and no claim of an app package or a pending driver', async (id) => {
    const c = await loadCase(join(ROOT, id));
    expect(existsSync(join(ROOT, id, 'replies.json')), 'scripted replies').toBe(true);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ kind?: string }>;
    expect(replies.length).toBeGreaterThan(0);
    const created = c.expected.report?.created;
    if (created) expect(created, 'the first run\'s health note is expected').toContain('Bower health.md');
    expect(`${c.title}\n${c.source}\n${c.rubric}`, 'the runner prepares its own input: no app package, no pending proof').not.toMatch(obsoleteClaims);
  });

  it('AC12 the PDF outcome requires both source notes', async () => {
    const c = await loadCase(join(ROOT, 'c15-short-pdfs-read-whole'));
    expect(c.expected.notes?.map((note) => note.path)).toEqual(['Resources/Move/Contract.md', 'Resources/Move/Letter.md']);
  });

  it.each(CASES)('AC12 c15-corpus-case: %s through main scores clean with selection and execution only', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const model = await modelFor(id);
    const inputs: string[] = [];
    const run = await runWithClaude(c, async (call) => { inputs.push(call.input); return model(call); });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.wire?.statuses.at(-1)?.phase).toBe('done');
    if (id === 'c15-short-pdfs-read-whole') {
      for (const path of ['Resources/Move/Contract.md', 'Resources/Move/Letter.md']) {
        const after = Object.fromEntries(Object.entries(run.after).filter(([file]) => file !== path));
        expect(scoreCase(c, { ...run, after }).unmet).toContain(`missing file: ${path}`);
      }
    }
    expect(inputs.filter((i) => /"synopsis":/.test(i.split('\n').at(-1) ?? '')), 'no long text read whole in these cases').toHaveLength(0);
  });

  it('corpus-fix-c15 AC1: C15 IDs describe extraction actually exercised', async () => {
    expect(OLD.map((d) => existsSync(join(ROOT, d)))).toEqual([false, false, false]);
    expect(NEW.map((d) => existsSync(join(ROOT, d, 'case.json')))).toEqual([true, true, true]);
    const corpus = await loadCorpus(ROOT);
    expect(corpus.filter((c) => c.capability === 'C15').map((c) => c.id).sort()).toEqual(['c15-context-budget-exhausted', 'c15-current-admitted-evidence', 'c15-image-only-pdf-asked', 'c15-short-pdfs-read-whole']);
    const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
    const log = await readFile(LOG, 'utf8');
    for (const id of NEW) {
      const c = await loadCase(join(ROOT, id));
      expect(c.id).toBe(id);
      expect({ id, readme: rowOf(readme, id) !== '', log: rowOf(log, id) !== '' }).toEqual({ id, readme: true, log: true });
      for (const text of [`${c.id}\n${c.title}\n${c.rubric}`, rowOf(readme, id), rowOf(log, id)]) expect({ id, text }).not.toEqual({ id, text: expect.stringMatching(CONTEXT_CLAIM) });
      for (const text of [c.source, rowOf(readme, id)]) expect({ id, text }).not.toEqual({ id, text: expect.stringMatching(/bench/i) });
    }
    expect(OLD.filter((id) => rowOf(readme, id) !== '' || rowOf(log, id) !== '')).toEqual([]);
    expect(OLD.filter((id) => readme.includes(id))).toEqual([]);
    expect(readme).toContain('The four `c15-*` cases');
  });

  it('corpus-fix-c15 AC3: current evidence and partial limits are scored honestly', async () => {
    // (a) red: the image-only PDF is asked about once, bound to its pile by the file's label, and nothing waits.
    expect(existsSync(join(ROOT, 'c15-image-only-pdf-asked', 'expected.json'))).toBe(true);
    const scan = await loadCase(join(ROOT, 'c15-image-only-pdf-asked'));
    expect(scan.expected.report).toEqual({ filed: 0, waiting: 0, questionsExactly: 1 });
    expect(scan.expected.files?.present).toEqual(['Inbox/scan0001.pdf']);
    const asked = await runWithClaude(scan, await modelFor(scan.id));
    expect(asked.code).toBe(0);
    expect(asked.score).toEqual({ pass: true, unmet: [] });
    const report = (asked.lastRun as { run: { report: { questions: unknown[]; waiting?: number } } }).run.report;
    expect(report.questions).toHaveLength(1);
    const s = subjectOf(report.questions[0] as Question);
    expect(s.kind).toBe('inbox');
    const file = (await asked.drive.listAll(asked.root)).find((f) => !f.folder && 'id' in s && f.appProperties?.pile === s.id);
    expect(file, 'the asked pile is the scan file\'s label').toBeDefined();
    expect(asked.pathsById[file?.id ?? '']).toBe('Inbox/scan0001.pdf');
    expect(Object.keys(asked.after).filter((p) => p.startsWith('Inbox/'))).toEqual(['Inbox/scan0001.pdf']);
    expect(report.waiting ?? 0).toBe(0);

    // (b) both one-page PDFs are extracted and shown whole.
    const whole = await loadCase(join(ROOT, 'c15-short-pdfs-read-whole'));
    const wholeModel = await modelFor(whole.id);
    const wholeInputs: string[] = [];
    await runWithClaude(whole, async (call) => { wholeInputs.push(call.input); return wholeModel(call); });
    for (const [name, phrase] of [['Contract.pdf', 'made-up contract, first page of six'], ['Letter.pdf', 'made-up letter, first lines only']] as const) {
      // These minimal PDFs decode as UTF-8, so loadCase keeps them in inboxFiles: read the exact bytes from disk.
      expect(await extract(name, new Uint8Array(await readFile(join(whole.dir, 'inbox', name))), CONTEXT_BOUNDS.perThing)).toEqual({ text: expect.stringContaining(phrase) });
      expect(shownIn(wholeInputs, name).some((t) => t.includes(phrase) && !t.includes('[cut here:') && !/pages not read\]/.test(t)), `${name} shown whole`).toBe(true);
    }

    // guard: passes before the fix
    // (c) the current source's venue line reaches execution and the filed copy keeps its bytes.
    const current = await loadCase(join(ROOT, 'c15-current-admitted-evidence'));
    const currentModel = await modelFor(current.id);
    const currentInputs: string[] = [];
    const filed = await runWithClaude(current, async (call) => { currentInputs.push(call.input); return currentModel(call); });
    expect(shownIn(currentInputs, 'Visit update.txt').some((t) => t.includes('The garden visit will meet at Wren Hall in Saltmere.'))).toBe(true);
    expect(filed.after['Projects/Garden visit/Visit update.txt']).toBe(current.inboxFiles['Visit update.txt']);
    expect(`${current.title}\n${current.rubric}`).not.toMatch(/stale|Lark Hall|package/i);
    // (d) c15-context-budget-exhausted is unchanged and still scores through the AC12 loop.
    expect(CASES).toContain('c15-context-budget-exhausted');
  });

  it('corpus-delete-ready-package AC1: the prepared-package case is gone from the corpus', async () => {
    expect(existsSync(join(ROOT, 'c15-ready-package-reused'))).toBe(false);
    expect((await loadCorpus(ROOT)).map((c) => c.id)).not.toContain('c15-ready-package-reused');
  });

  // guard: passes before deletion
  it('corpus-delete-ready-package AC2: the known-fact confirmation lives in C05, not C15', async () => {
    const known = (await loadCorpus(ROOT)).find((c) => c.id === 'c05-confirms-known-fact');
    expect(known?.capability).toBe('C05');
    expect(CASES).not.toContain('c05-confirms-known-fact');
  });
});
