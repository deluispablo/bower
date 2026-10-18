/** A request Bower will not do (live-refusal-wording AC2): the model's "never" through production main, and what refuses it. */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { NEVER_WHY, NOTHING_FOUND_WHY } from '../../src/data/spine/scripted';
import { SYSTEM, type LastRunFile } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { REFUSALS } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { promptOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Flat hunt';
const LARK = `${HUNT}/Larkspur Lane flat.md`;
const note = (summary: string, body: string, line: string) => `---\nsummary: ${summary}\nby: bower\n---\n\n${body}\n\n## Timeline\n- ${line}\n`;
const FILES: Record<string, string> = {
  [`${HUNT}/Flat hunt.md`]: note('Alex is comparing flats in Saltmere.', '## Current state\n- Alex has not chosen a flat.', '2026-10-02 · Started the shortlist.'),
  [LARK]: note('The Larkspur Lane flat in Saltmere.', 'Rent: 1,450 a month.\nCommute: 24 min.', '2026-10-03 · Viewed the flat.'),
};
const NAMING = 'Delete the Larkspur Lane flat for good';
const GENERAL = 'Wipe everything I have from my Drive for good';
const OTHER = 'What is the rent for the Larkspur Lane flat?';
const ANSWER = 'The rent is 1,450 a month, in [[Larkspur Lane flat]].';
const empty = { kind: 'tidy-intent', v: 1, things: [] };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  vi.setSystemTime(DAY);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type Ctx = { asked: Record<string, string> };

/** One instructions press through main: each request written as the app writes it, then the given execution reply. */
async function press(words: string[], intent: (ctx: Ctx, attempt: number) => unknown) {
  const c: LoadedCase = { id: 'live-refusal-wording', capability: 'C05', title: 'Alex asks Bower to do what it never does', covers: 'model', source: 'new', scope: 'instructions',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', ...FILES } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const asked: Record<string, string> = {};
  for (const [i, text] of words.entries()) {
    const file = await drive.createText((await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === SYSTEM.changes)?.id ?? '', `press-${i + 1}.json`,
      JSON.stringify({ v: 1, id: `press-${i + 1}`, device: 'device-1', at: DAY + i, kind: 'request', what: `Asked Bower: "${text}"`, text }));
    asked[text] = file.id;
  }
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => DAY + 9, newId: () => 'never-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    calls.push(promptOf(call));
    if (phase === 'selection') return reply({ items: [], asks: [] });
    return reply(intent({ asked }, attempt++));
  }, () => ({ drive, root, admission: admission.manifest }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'never-run' }, env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up-credential-never' } }, 1);
  return { ...run, calls, asked };
}
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const archived = (run: CaseRun, recordId: string) => Object.entries(run.after).some(([p, text]) =>
  p.startsWith(`${SYSTEM.archive}/`) && p.endsWith(`${recordId}.json`) && (JSON.parse(text) as { id?: string }).id === recordId);
const rows = (run: CaseRun) => ((run.lastRun as LastRunFile | null)?.run.report as { leftAsWritten?: Array<{ name: string; why: string; fileId?: string }> } | undefined)?.leftAsWritten ?? [];

describe('"never": a request Bower will not do', () => {
  it.each([[NAMING], [GENERAL]])('AC2: "%s" is declined with one row, no line, and archived', async (words) => {
    const run = await press([words], (ctx) => ({ ...empty, never: [ctx.asked[words]] }));
    expect(refusals()).toEqual([]);
    expect(rows(run)).toEqual([{ name: words, why: NEVER_WHY }]);
    expect(rows(run).map((r) => r.why)).not.toContain(NOTHING_FOUND_WHY);
    expect(run.after[LARK]).toBe(FILES[LARK]);
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC2: the prompt tells the model about "never"', async () => {
    const run = await press([GENERAL], (ctx) => ({ ...empty, never: [ctx.asked[GENERAL]] }));
    expect(run.calls.some((c) => c.includes('"never"'))).toBe(true);
  });

  // Every binding refusal is answerBinding, reply-level; the corrected reply (never alone) applies.
  const binding = (name: string, bad: (ctx: Ctx) => Record<string, unknown>, words = [NAMING]) => it(`AC2: ${name} is refused answerBinding; the corrected reply applies`, async () => {
    const run = await press(words, (ctx, attempt) => (attempt > 0 ? { ...empty, never: [ctx.asked[NAMING]] } : { ...empty, ...bad(ctx) }));
    expect(refusals()[0]).toBe('answerBinding');
    expect(rows(run)).toEqual([{ name: NAMING, why: NEVER_WHY }]);
  });
  binding('an unknown request id', () => ({ never: ['not-a-request'] }));
  binding('a request also answered (never first)', (ctx) => ({ never: [ctx.asked[NAMING]], answers: [{ requestId: ctx.asked[NAMING], text: ANSWER }] }));
  binding('a request also answered (answers first)', (ctx) => ({ answers: [{ requestId: ctx.asked[NAMING], text: ANSWER }], never: [ctx.asked[NAMING]] }));
  binding('a request also given a document', (ctx) => ({ documents: [{ requestId: ctx.asked[NAMING], to: HUNT, title: 'Rent', summary: 'The rent.', body: 'The rent is 1,450 a month.' }],
    never: [ctx.asked[NAMING]] }));
  binding('a request also given a map', (ctx) => ({ never: [ctx.asked[NAMING]], maps: [{ requestId: ctx.asked[NAMING], title: 'Flats', set: { type: 'flat', folderId: 'FOLDER_ID', recursive: false }, ops: [{ kind: 'tag', mode: 'add', value: 'flat' }] }] }));
  binding('a request also given a view', (ctx) => ({ views: [{ requestId: ctx.asked[NAMING], home: { kind: 'type-row', rowId: 'flat' }, mode: 'install', definition: {} }], never: [ctx.asked[NAMING]] }));
  binding('a request also cited by a line', (ctx) => ({ lines: [{ note: LARK, text: 'Alex asked to delete it.', cites: ctx.asked[NAMING] }], never: [ctx.asked[NAMING]] }));
  binding('a request also named in a things entry', (ctx) => ({ things: [{ fileId: ctx.asked[NAMING], to: HUNT, name: 'Request.md' }], never: [ctx.asked[NAMING]] }));
  binding('a request listed twice', (ctx) => ({ never: [ctx.asked[NAMING], ctx.asked[NAMING]] }));
  binding('a request that is also answered, beside another declined', (ctx) => ({ never: [ctx.asked[OTHER]], answers: [{ requestId: ctx.asked[OTHER], text: ANSWER }] }), [NAMING, OTHER]);

  // Ruling 2: "never" that is not a list of request ids has its own reply-level kind.
  it.each([['null', null], ['an object', { requestId: 'x' }], ['a string', 'press-1'], ['empty', []], ['numbers', [1]]] as const)('AC2: "never" as %s is refused neverKeys; the corrected reply applies', async (_name, value) => {
    expect(REFUSALS.neverKeys).toBeDefined();
    const run = await press([NAMING], (ctx, attempt) => (attempt > 0 ? { ...empty, never: [ctx.asked[NAMING]] } : { ...empty, never: value }));
    expect(refusals()[0]).toBe('neverKeys');
    expect(rows(run)).toEqual([{ name: NAMING, why: NEVER_WHY }]);
  });
});
