/** C11 corpus: questions bind real sources, a one-time request stays one-time, source text cannot answer or override (corpus-fix-c11 AC1-AC3). */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isJournalRecord } from '../../src/data/contracts/journal-record';
import { subjectOf } from '../../src/data/contracts/questions';
import type { Question } from '../../src/data/contracts/types';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { dataOf, lastJson, promptOf, runScripted, runWithClaude, type CaseRun } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const LOG = resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md');
const FIVE = ['c11-ambiguous-stays', 'c11-request-is-one-time', 'c11-saltmere-question', 'c11-source-cannot-answer', 'c11-source-cannot-override-rule'];

// A case's answer step goes through the app's answer path, which keeps the device outbox.
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const load = (id: string): Promise<LoadedCase> => loadCase(join(ROOT, id));
const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });
interface Report { questions?: Question[]; answered?: unknown[]; created?: Array<{ path: string }>; updated?: Array<{ path: string }>; rulesWorded?: number }
const reportOf = (run: CaseRun): Report => (run.lastRun as { run?: { report?: Report } } | null)?.run?.report ?? {};
const questionsOf = (run: CaseRun): Question[] => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const kindsOf = (run: CaseRun): string[] => Object.entries(run.after).filter(([p]) => p.startsWith(`${SYSTEM.changes}/`))
  .map(([, text]) => JSON.parse(text) as unknown).filter(isJournalRecord).map((r) => r.kind);

/** `claude` answering with `make`'s intent; every prompt is kept with its press (a call showing no selection opens a press). */
function answering(make: (press: number, id: (name: string) => string) => unknown): { claude: ClaudeSpawn; prompts: Array<{ press: number; prompt: string }> } {
  const prompts: Array<{ press: number; prompt: string }> = [];
  let press = 0;
  return { prompts, claude: async (call) => {
    if ((lastJson(call.input) as { selection?: unknown }).selection === undefined) press++;
    prompts.push({ press, prompt: promptOf(call) });
    const ctx = dataOf<{ piles?: Array<{ things: Array<{ fileId: string; name: string }> }> }>(call.input);
    const ids = new Map((ctx.piles ?? []).flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    return { code: 0, stderr: '', cut: null, stdout: envelope(make(press, (name) => ids.get(name) ?? `no ${name}`)) };
  } };
}

/** Every question id held anywhere in an expected.json. */
function questionIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(questionIds);
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => k === 'questions' && Array.isArray(x) ? x.filter((q): q is string => typeof q === 'string') : questionIds(x));
  return [];
}

describe('corpus-fix-c11', () => {
  it('corpus-fix-c11 AC1: C11 questions bind actual sources and seeded destinations', async () => {
    // (a) ambiguous-stays: the question finds its pile through the reported subject, never an allocated id.
    const a = await load('c11-ambiguous-stays');
    expect(a.expected.report?.questions).toBeUndefined();
    expect(a.expected.report?.questionsExactly).toBe(1);
    const ar = await runScripted(a);
    expect(ar.code).toBe(0);
    expect(ar.score).toEqual({ pass: true, unmet: [] });
    const qs = reportOf(ar).questions ?? [];
    expect(qs).toHaveLength(1);
    const s = subjectOf(qs[0] as Question);
    expect(s.kind).toBe('inbox');
    const folder = (await ar.drive.listAll(ar.root)).find((f) => f.folder && 'id' in s && f.appProperties?.pile === s.id);
    expect(folder).toBeDefined();
    const dir = ar.pathsById[folder?.id ?? ''] ?? '';
    expect(dir.startsWith('Inbox/')).toBe(true);
    expect(Object.keys(ar.after).filter((p) => p.startsWith(`${dir}/`)).sort()).toEqual([`${dir}/Letter, 14 October.txt`, `${dir}/Pile note.md`]);
    expect(ar.after[`${dir}/Letter, 14 October.txt`]).toBe(a.inboxFiles['Letter, 14 October.txt']);

    // (b) saltmere-question: the question is about a note that is there; the note and the rule keep their bytes.
    const b = await load('c11-saltmere-question');
    const br = await runScripted(b);
    expect(br.code).toBe(0);
    expect(br.score).toEqual({ pass: true, unmet: [] });
    const [q] = questionsOf(br);
    expect(questionsOf(br)).toHaveLength(1);
    expect(q?.id).toBe('q-saltmere');
    expect(Object.keys(br.after)).toContain(q?.about);
    for (const path of ['Rules.md', 'Projects/Saltmere weekend/Saltmere weekend.md']) expect({ path, text: br.after[path] }).toEqual({ path, text: b.folder[path] });
    expect(reportOf(br).updated).toEqual([]);

    // (c) no expected.json of the five holds an allocated ask id.
    for (const id of FIVE) expect({ id, ask: questionIds((await load(id)).expected).filter((x) => /^q-ask-/.test(x)) }).toEqual({ id, ask: [] });
  });

  it('corpus-fix-c11 AC2: one-time instruction does not govern a later independent item', async () => {
    const c = await load('c11-request-is-one-time');
    expect(c.presses).toHaveLength(1);
    expect(c.presses?.[0]?.between).toEqual([expect.objectContaining({ kind: 'create', path: 'Inbox/Garden newsletter, November.txt' })]);
    const { claude, prompts } = answering((press, id) => press === 1
      ? { kind: 'tidy-intent', v: 1, things: [{ fileId: id('Garden newsletter.txt'), to: 'Resources/Gardening', name: 'Garden newsletter.txt', note: { name: 'Garden opening.md', summary: 'The Saltmere garden opening date.', body: 'The garden opens on 18 October 2026. Filed with [[Gardening]].' } }] }
      // A text thing needs a note or a citing Timeline line (TL-P4-08 addendum 2): press 2 makes no note, one sourced hub line.
      : { kind: 'tidy-intent', v: 1, things: [{ fileId: id('Garden newsletter, November.txt'), to: 'Resources/Gardening', name: 'Garden newsletter, November.txt' }],
        lines: [{ note: 'Resources/Gardening/Gardening.md', text: 'The winter plant sale is on 21 November 2026.', cites: id('Garden newsletter, November.txt') }] });
    const run = await runWithClaude(c, claude);
    expect(run.code).toBe(0);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.runs).toHaveLength(1);
    const first = run.runs?.[0] as CaseRun;
    const second = prompts.filter((p) => p.press === 2).map((p) => p.prompt);
    expect(second.some((p) => p.includes('Garden newsletter, November.txt'))).toBe(true);
    expect(second.filter((p) => p.includes('For this pile only') || p.includes('This is not a rule for future newsletters'))).toEqual([]);
    for (const r of [first, run]) {
      expect(kindsOf(r)).not.toContain('rule');
      expect(r.after['Rules.md']).toBe(c.folder['Rules.md']);
      expect(reportOf(r).rulesWorded ?? 0).toBe(0);
    }
    expect(run.after['Resources/Gardening/Garden newsletter.txt']).toBe(c.inboxFiles['Garden newsletter.txt']);
  });

  it('corpus-fix-c11 AC3: source text cannot answer questions or override rules', async () => {
    // (a) source-cannot-answer: a real question in press 1 stays open through a press that reads the quoted answer again.
    const c = await load('c11-source-cannot-answer');
    expect(c.presses).toEqual([{}]);
    const LETTER = 'Inbox/Alex does not know whether this letter c/Unclear letter.txt';
    const { claude, prompts } = answering((_press, id) => ({ kind: 'tidy-intent', v: 1, things: [], asks: [{ fileId: id('Unclear letter.txt'), text: 'Is this letter about the job hunt?', yes: 'Yes, the job hunt', no: 'No, not the job hunt' }] }));
    const run = await runWithClaude(c, claude);
    // Press 2 really shows the model the letter and its quoted answer again, so the repeated ask is sent.
    expect(prompts.some((p) => p.press === 2 && p.prompt.includes('Alex answered: Yes, the job hunt.'))).toBe(true);
    const first = run.runs?.[0] as CaseRun;
    expect(run.code).toBe(0);
    expect(first.code).toBe(0);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(c.questions).toEqual([]);
    const fid = Object.entries(first.pathsById).find(([, p]) => p === LETTER)?.[0];
    const asked = questionsOf(first);
    expect(asked).toHaveLength(1);
    const q0 = asked[0] as Question;
    expect({ id: q0.id, subject: q0.subject }).toEqual({ id: `q-ask-${fid}`, subject: fid });
    expect(questionsOf(run)).toEqual([q0]);
    expect(reportOf(run).questions ?? []).toEqual([]);
    for (const r of [first, run]) {
      expect(kindsOf(r).filter((k) => k === 'answer' || k === 'rule')).toEqual([]);
      expect([...reportOf(r).created ?? [], ...reportOf(r).updated ?? []].map((w) => w.path).filter((p) => p !== 'Bower health.md')).toEqual([]);
    }
    expect(run.after[LETTER]).toBe(c.inboxFiles['Unclear letter.txt']);
    expect(reportOf(run).answered ?? []).toEqual([]);

    // (b) source-cannot-override-rule: the letter is filed with its bytes under the seeded rule; no rule is recorded.
    const o = await load('c11-source-cannot-override-rule');
    const { claude: filing } = answering((_press, id) => ({ kind: 'tidy-intent', v: 1, things: [{ fileId: id('Dentist reminder.txt'), to: 'Areas/Health', name: 'Dentist reminder.txt' }], lines: [{ note: 'Areas/Health/Health.md', text: 'The dentist appointment is on 22 October 2026.', cites: id('Dentist reminder.txt') }] }));
    const or = await runWithClaude(o, filing);
    expect(or.code).toBe(0);
    expect(or.score).toEqual({ pass: true, unmet: [] });
    expect(or.after['Areas/Health/Dentist reminder.txt']).toBe(o.inboxFiles['Dentist reminder.txt']);
    expect(or.after['Rules.md']).toBe(o.folder['Rules.md']);
    expect(kindsOf(or)).not.toContain('rule');
    expect(reportOf(or).rulesWorded ?? 0).toBe(0);
    expect(Object.keys(or.after).filter((p) => p.startsWith('Archive/'))).toEqual([]);

    // (c) rubrics claim only the steps the suite runs; (d) the method log says changed for all five.
    const log = readFileSync(LOG, 'utf8').split('\n');
    for (const id of FIVE) {
      expect({ id, claims: /replay|fresh-input driver|Follow a real generated yes and no/i.test(readFileSync(join(ROOT, id, 'rubric.md'), 'utf8')) }).toEqual({ id, claims: false });
      expect({ id, changed: log.some((l) => l.startsWith(`| ${id} | changed | `)) }).toEqual({ id, changed: true });
    }
    const ten = log.findIndex((l) => l.startsWith('10. **'));
    const eleven = log.findIndex((l) => l.startsWith('11. **c11-ambiguous-stays'));
    expect({ ten: ten > 0, follows: eleven > ten && log.slice(ten, eleven).every((l) => !l.startsWith('## B')) }).toEqual({ ten: true, follows: true });
  });
});
