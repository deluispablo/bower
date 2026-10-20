/**
 * The live corpus runtime (corpus-live-runtime): the test driver's one execution path (`corpus-run.ts`) seeds a case
 * faithfully and, in live mode, hands every model call of every press to the transport as it is, with no phase synthesis,
 * no fixture and no scripted replies; the executor reads only what a person's folder holds. Scripted replies stay an
 * explicit test mode.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/data/contracts/hashes';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { reply } from './b1-planning-support';
import { AT, lastJson, promptOf, redispatchCase, runLive, runScripted, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const CORPUS = resolve(import.meta.dirname, '../../testing/corpus');
/** The case whose second press consolidates About me: all four model call kinds in one run. */
const B4 = join(CORPUS, 'c17-b4-gate-archive-first');
const PDF = 'Resources/Gardening/Seed list.pdf';
/** Not UTF-8 (0xff), so only its bytes describe it. */
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a, 0xff, 0xfe, 0x00]);
const NOTE = 'Resources/Gardening/Gardening.md';
const NOTE_TEXT = '---\nsummary: Alex’s garden plans.\n---\n\n# Gardening\n\nAlex grows herbs.\n';
const RULES = 'Rules.md';
const RULES_TEXT = '# Rules\n\n- Keep garden notes under Resources.\n';
const SENTINEL = 'ORACLE-SENTINEL-7d1f';
/** What the B4 case's first scripted reply remembers; its starting About me does not hold it. */
const REMEMBERED = 'I want comparisons that say what is missing';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

type Kind = 'selection' | 'execution' | 'consolidation' | 'judge';
const kindOf = (call: ClaudeCall): Kind => {
  const context = lastJson(call.input) as { consolidation?: unknown; judge?: unknown; selection?: unknown };
  return context.consolidation ? 'consolidation' : context.judge ? 'judge' : context.selection === undefined ? 'selection' : 'execution';
};

/**
 * A model double answering each call kind from its own replies, as a model would: a selection selects nothing, an
 * execution gives its next intent. It never reads the Drive; it records each call and the prompt the model read.
 */
function model(answers: { execution?: unknown[]; consolidation?: unknown; judge?: unknown } = {}) {
  const calls: Array<{ kind: Kind; keys: string[]; prompt: string }> = [];
  let executions = 0;
  const spawn: ClaudeSpawn = async (call) => {
    const kind = kindOf(call);
    calls.push({ kind, keys: Object.keys(call).sort(), prompt: promptOf(call) });
    if (kind === 'selection') return reply({ items: [], asks: [] });
    if (kind === 'execution') return reply(answers.execution?.[executions++] ?? { kind: 'tidy-intent', v: 1, things: [] });
    return reply(answers[kind] ?? { lines: [] });
  };
  return { spawn, calls };
}

const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;

/** A made-up case: a note, Bower's own rules and a PDF in the folder, a journal request, a question and a words pile. */
async function gardenCase(): Promise<LoadedCase> {
  const seed = await loadCase(B4);
  return { ...seed, id: 'live-garden', scope: 'all', presses: undefined, between: undefined,
    folder: { [NOTE]: NOTE_TEXT, [RULES]: RULES_TEXT }, folderBinary: { [PDF]: PDF_BYTES }, bowerOwned: [RULES, PDF],
    journal: [{ kind: 'request', text: 'Keep the seed list with Gardening.' }],
    questions: [{ id: 'q-1', text: 'Is the seed list for this year?', yes: 'Yes', no: 'No', askedAt: AT - 1000 }],
    inbox: [{ line: 'Alex sows basil in May.', files: [] }], inboxFiles: {}, inboxBinary: {}, expected: {} };
}

it('corpus-live-runtime AC1: shared runtime seeds text binary ownership and journal state faithfully', async () => {
  const c = await gardenCase();
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const listed = await drive.listAll(root, { checksums: true });
  const at = (path: string) => listed.find((f) => drive.pathOf(f.id, root) === path);
  expect(at(PDF)?.sha256, 'a binary is seeded byte for byte').toBe(await sha256Hex(PDF_BYTES));
  expect(at(PDF)?.appProperties, 'a bower-owned binary is seeded as Bower’s').toEqual({ by: 'bower' });
  expect(at(RULES)?.appProperties, 'a bower-owned text is seeded as Bower’s').toEqual({ by: 'bower' });
  expect(at(NOTE)?.appProperties, 'a person’s note carries no ownership').toBeUndefined();
  expect(await drive.readText(at(NOTE)?.id ?? ''), 'a text is seeded as written').toBe(NOTE_TEXT);
  const journal = JSON.parse(await drive.readText(at(`${SYSTEM.changes}/change-1.json`)?.id ?? '')) as Record<string, unknown>;
  expect(journal, 'the journal line is one request record').toMatchObject({ v: 1, id: 'change-1', kind: 'request', text: 'Keep the seed list with Gardening.' });
  expect(JSON.parse(await drive.readText(at(SYSTEM.questions)?.id ?? '')), 'the open questions are seeded').toEqual({ v: 1, questions: c.questions });
  const extra = fixedDrive();
  const owned = await seedCase(extra, { ...c, bowerOwned: [] }, { [PDF]: { kept: 'older-run' } });
  const pdf = (await extra.listAll(owned)).find((f) => extra.pathOf(f.id, owned) === PDF);
  expect(pdf?.appProperties, 'a binary keeps the extra properties a run left on it').toEqual({ kept: 'older-run' });
});

it('corpus-live-runtime AC2: live mode reaches the production provider for every semantic phase', async () => {
  const c = await loadCase(B4);
  const { spawn, calls } = model({ execution: await json(join(B4, 'replies.json')) as unknown[],
    consolidation: await json(join(B4, 'consolidation-reply.json')), judge: await json(join(B4, 'judge-reply.json')) });
  const run = await runLive(c, spawn);
  expect(calls.map((x) => x.kind), 'every call of both presses reaches the transport, consolidation and judge as themselves')
    .toEqual(['selection', 'execution', 'selection', 'execution', 'consolidation', 'judge']);
  expect(calls.every((x) => !x.keys.includes('fixture')), 'no call carries the seeded Drive').toBe(true);
  expect(run.score?.unmet, 'the case scores clean from the transport’s own replies').toEqual([]);
  expect(run.after[SYSTEM.index], 'maintenance runs after the model calls').toBeDefined();
  // A press whose model call was lost is redispatched to the same transport, as it is.
  const once = { ...c, presses: undefined };
  const lost = model();
  let cut = true;
  const first = await runLive(once, async (call) => {
    if (!cut) return lost.spawn(call);
    cut = false;
    throw new Error('The model call was lost.');
  });
  await redispatchCase(once, first, 2, { claude: lost.spawn, live: true });
  expect(lost.calls.map((x) => x.kind), 'the redispatched press calls the transport again').toEqual(['selection', 'execution']);
  expect(lost.calls.every((x) => !x.keys.includes('fixture')), 'a redispatched call carries no seeded Drive').toBe(true);
});

it('corpus-live-runtime AC3: live executor receives no evaluation oracle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bower-live-'));
  await writeFile(join(dir, 'replies.json'), JSON.stringify([{ kind: 'tidy-intent', v: 1, things: [], note: SENTINEL }]));
  await writeFile(join(dir, 'expected-tag-results.json'), JSON.stringify({ tags: [SENTINEL] }));
  const seed = await gardenCase();
  const c: LoadedCase = { ...seed, dir, id: `${SENTINEL}-id`, title: `${SENTINEL} title`, rubric: `${SENTINEL} rubric`,
    expected: { notes: [{ path: NOTE, contains: [`${SENTINEL} expected`] }] }, presses: [{}] };
  // Which fields of the loaded case are read, and after how many model calls.
  const reads: Array<{ key: string; after: number }> = [];
  const { spawn, calls } = model();
  const watched = new Proxy(c, { get: (target, key, receiver) => {
    reads.push({ key: String(key), after: calls.length });
    return Reflect.get(target, key, receiver) as unknown;
  } });
  await runLive(watched, spawn);
  expect(calls.length, 'both presses called the model').toBeGreaterThan(1);
  expect(reads.filter((r) => r.after > 0 && r.after < calls.length).map((r) => r.key), 'between its model calls the executor reads only its narrowed copy').toEqual([]);
  expect(calls.filter((x) => x.prompt.includes(SENTINEL)).map((x) => x.kind), 'no expectation, rubric, case name, reply or tag result reaches the model').toEqual([]);
  expect(calls[0]?.prompt, 'the model reads the person’s words').toContain('Alex sows basil in May.');
  expect([...new Set(calls.flatMap((x) => x.keys))].sort(), 'the call is the production call alone')
    .toEqual(['args', 'command', 'cwd', 'env', 'input', 'maxBytes', 'timeoutMs']);
});

it('corpus-live-runtime AC4: existing deterministic corpus behavior remains available explicitly', async () => {
  const c = await loadCase(B4);
  await expect(runLive(c, undefined as unknown as ClaudeSpawn), 'live mode with no transport refuses, never the scripted replies')
    .rejects.toThrow('Live mode needs a model transport.');
  const { spawn, calls } = model();
  const live = await runLive(c, spawn);
  expect(calls.filter((x) => x.kind === 'execution'), 'each execution is the transport’s, not replies.json').toHaveLength(2);
  expect(live.after['About me.md'], 'the transport’s empty intents remember nothing').not.toContain(REMEMBERED);
  const scripted = await runScripted(c);
  expect(scripted.after['About me.md'], 'the scripted mode still runs replies.json, when asked for by name').toContain(REMEMBERED);
});
