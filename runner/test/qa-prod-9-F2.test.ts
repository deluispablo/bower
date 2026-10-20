/**
 * qa-prod-9-F2: a request no view can serve is answered with why, never left empty. The Views clause gives the model a way
 * out (no view: an answer saying what is missing), and the answers clause admits a request Bower cannot do as asked; the
 * system prompt goes with the retry, so the way out is in front of the model on both attempts (specs/qa-prod-9/plan.md, F2).
 * Prior art: Anthropic, "Allow Claude to say I don't know" and "Be clear and direct". The way out reuses the answers path
 * (request-settles-on-suggestion). The instructions are read as qa-prod-8-F1b reads them; the press is b11-proposals' harness.
 * Every run goes through production main over a made-up folder; only the model is replaced.
 */
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../../src/data/contracts/types';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { NOTHING_FOUND_WHY } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { type ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, promptOf, replySequence, runOnDrive, runWithClaude, seedCase, splitPrompt, systemOf, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const CASE = resolve(import.meta.dirname, '../../testing/corpus/c17-b11-proposal-authority');
const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Job hunt';
const MAP = `${HUNT}/Job hunt.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' }, deadline: { type: 'date' } }, table: ['skills', 'deadline'] }] };
const BY_START = { v: 1, id: 'offer-starts', kind: 'aggregate', title: 'Offers by start date',
  set: { type: 'offer', folderId: '$folder', recursive: true }, groupBy: [], measures: [{ id: 'first', label: 'Earliest start', op: 'earliest', property: 'start' }] };
const ASK = { text: 'Save a start-date view in Job hunt?', yes: 'Save it', no: 'Not now' };
const WORDS = 'Suggest a view of my offers sorted by start date, but ask me before saving it.';
const ANSWER = 'No view fits: offer notes declare no start date.';
const WAY_OUT = 'A view uses only properties its type row declares in the type table below, and a "moc" home is one of Bower\'s maps below, never another note.';

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

/** qa-prod-8-F1b's reading: the case on its own replies, and its first execution call's instructions as the model reads them. */
async function instructions(): Promise<string> {
  const c = await loadCase(CASE);
  const answer = replySequence(JSON.parse(await readFile(join(CASE, 'replies.json'), 'utf8')) as unknown[]);
  const executions: string[] = [];
  const spawn: ClaudeSpawn = async (call) => {
    if ((frameOf(call) as { selection?: unknown }).selection !== undefined) executions.push(promptOf(call));
    return answer(call);
  };
  const r = await runWithClaude(c, spawn);
  expect(r.code, 'the case files on its own replies').toBe(0);
  const text = splitPrompt(executions[0] ?? '').instructions;
  expect(text, 'the execution prompt was sent').toMatch(/You plan one Bower tidy-up/);
  return text;
}

/** The map as a run leaves it: its figures and members already list both offers, so a run that changes nothing leaves it byte-identical. */
function map(): string {
  return '---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: Job hunt reference notes.\n---\n'
    + '<!-- bower:ownership/2 begin current -->\n<!-- bower:ownership/2 end current -->\n'
    + '<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these job hunt notes together.\n<!-- bower:ownership/2 end personal -->\n'
    + '<!-- bower:ownership/2 begin timeline -->\n<!-- bower:ownership/2 end timeline -->\n'
    + '<!-- bower:ownership/2 begin bower-note -->\n<!-- bower:ownership/2 end bower-note -->\n'
    + '<!-- bower:ownership/2 begin moc-overview -->\n## Overview\nJob hunt reference notes.\n<!-- bower:ownership/2 end moc-overview -->\n'
    + '<!-- bower:ownership/2 begin moc-figures -->\n## Figures\n\n2 direct notes; 2 notes in all.\n<!-- bower:ownership/2 end moc-figures -->\n'
    + '<!-- bower:ownership/2 begin moc-members -->\n## Notes\n\n- [[Ferrowick offer]] — Ferrowick offers Alex remote work.\n'
    + '- [[Mallowick offer]] — Mallowick offers Alex remote work.\n<!-- bower:ownership/2 end moc-members -->\n';
}
const offer = (name: string, deadline: string) => `---\nsummary: ${name} offers Alex remote work.\ntype: offer\nby: bower\ncreated: 2026-10-01\n`
  + `status: active\ndeadline: ${deadline}\n---\n\n${name} offers Alex remote work.\nRelated: [[Job hunt]].\n`;
const OFFERS = { [`${HUNT}/Ferrowick offer.md`]: offer('Ferrowick', '2026-10-14'), [`${HUNT}/Mallowick offer.md`]: offer('Mallowick', '2026-11-02') };

/** A made-up folder (b11-proposals' `folder`, without seeded questions or suggestions). */
async function folder() {
  const c: LoadedCase = { id: 'qa-prod-9-F2', capability: 'C05', title: 'Alex asks for a view no type supports', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), 'Rules.md': '# Rules\n', [MAP]: map(), ...OFFERS } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  return { c, drive, root, folderId: await id(HUNT), mapId: await id(MAP), changesId: await id(SYSTEM.changes) };
}
type Folder = Awaited<ReturnType<typeof folder>>;
type Intent = (ctx: { request: string }, attempt: number) => unknown;
type Seen = { system: string | null; input: string };

/** One tidy-up of the request alone (b11-proposals' `press`, scope "instructions"); each execution call's prompt file and input are kept. */
async function press(f: Folder, intent: Intent) {
  const request = await f.drive.createText(f.changesId, 'press-1.json', JSON.stringify({ v: 1, id: 'press-1', device: 'device-1', at: DAY + 1, kind: 'request',
    what: `Asked Bower: "${WORDS}"`, text: WORDS }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + 1, newId: () => 'qa9-admission-1' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const executions: Seen[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'offer', destination: f.folderId, wants: [] })), asks: [] });
    executions.push({ system: systemOf(call), input: call.input });
    return reply(await intent({ request: request.id }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: 'qa9-run-1' } }, 1);
  return { ...run, executions };
}
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const doneRows = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done?: string }> }).done.map((r) => [r.id, r.done]);
type Row = { name: string; why: string };
const reportOf = (run: CaseRun) => (run.lastRun as { run?: { report?: { setAside?: Row[]; leftAsWritten?: Row[] } } } | null)?.run?.report;
/** Each refusal of the run as [kind, reason], from the provider's first-attempt log line (b11-proposals' `refused`). */
const refused = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [[m[1], m[2]]] : []; });

describe('qa-prod-9-F2: a request no view can serve is answered with why, never left empty', () => {
  it('AC1 qa9-views-way-out: the Views clause gives no view and an answer when no view fits, over the type table below', async () => {
    const text = await instructions();
    expect(text).toMatch(/When no view fits, give none: answer the request in "answers"/);
    expect(text).toMatch(/declares in the type table below/);
  });

  it('AC2 qa9-answers-cannot-do: the answers clause admits a request Bower cannot do as asked, and still takes no map or view', async () => {
    const text = await instructions();
    const clause = /^- "answers".*(?:\n {2}.*)*/m.exec(text)?.[0] ?? '';
    expect(clause).toMatch(/asks a question about the folder, or that you cannot do as asked \(say why\)/);
    expect(clause).toContain('A request you answer takes no map or view.');
  });

  it('AC3 qa9-retry-way-out-in-front: a view on an undeclared property is refused; the retry, with the way out in front, answers why and settles', async () => {
    const f = await folder();
    const run = await press(f, (ctx, attempt) => attempt === 0
      ? { ...empty, views: [{ requestId: ctx.request, home: { kind: 'moc', fileId: f.mapId }, mode: 'propose', definition: { ...BY_START, set: { ...BY_START.set, folderId: f.folderId } }, ...ASK }] }
      : { ...empty, answers: [{ requestId: ctx.request, text: ANSWER }] });
    const retry = run.executions[1];
    expect(retry?.system ?? '', 'the retry\'s system prompt file holds the way out').toContain(WAY_OUT);
    expect(refused(), 'the first attempt is refused for the undeclared property').toEqual([['viewKeys', 'a view the grammar refuses: The view uses a property the type does not declare.']]);
    expect(retry?.input ?? '', 'the retry\'s input holds the viewKeys reason').toContain('Your reply was refused: a view the grammar refuses: The view uses a property the type does not declare.');
    expect(run.executions).toHaveLength(2);
    expect(phase(run)).toBe('done');
    expect(doneRows(run), 'the request settles with the answer (Done for you)').toEqual([['press-1', ANSWER]]);
    expect([...reportOf(run)?.setAside ?? [], ...reportOf(run)?.leftAsWritten ?? []].filter((r) => r.why === NOTHING_FOUND_WHY), 'no nothing-found row').toEqual([]);
    expect(doneRows(run).filter(([, done]) => done === NOTHING_FOUND_WHY), 'no nothing-found done row').toEqual([]);
    expect(questions(run), 'no question is written').toEqual([]);
    expect(run.after[MAP], 'the map is byte-identical').toBe(map());
  });
});
