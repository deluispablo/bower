/**
 * An answer applies at once (C05, TL-P4-08 addendum 8, `ask-answer-loop`; the owner chose (A)). The app stores the
 * answer with its question, once however often it is given, and a yes the run can act on starts a small tidy-up scoped
 * to what it is about: the notes for keeping one note, the one pile for a thing asked about. The Worker admits it as
 * any press (the same daily quota, one run at a time, one run per request id), and the model is shown the question
 * and the answer. A run already going keeps what it took: the answer waits for the next run. A no starts nothing and
 * closes the question; the next tidy-up drops it from Bower's list.
 *
 * Everything is the real code over replayed transports (`real-world.ts`): the app's vault and answer, the Worker's
 * app in-process with its person object, the runner's `main` with `claude` answered here. No live call.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDIT_FILE_LIMIT, applyChanges, currentStateOf, stateMark, undoChanges, undoEdit } from '../../src/data/contracts/note-edit';
import { pairQuestionId } from '../../src/data/contracts/questions';
import type { Change, EditText, ManifestV2 } from '../../src/data/contracts/run-manifest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { parseNote } from '../../src/data/vault/note-format';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { seedCase } from './corpus-run';
import { ORIGIN, realWorld } from './real-world';
import type { Hop, RealWorld } from './real-world-types';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const KEEP_Q = 'q-merge-flat-3';
const KEPT = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const OTHER = 'Projects/Flat hunt/Flat 3 (second).md';

/** The app's side, loaded at run time: its modules type-check with the browser's types, not Node's. */
interface AppQuestion { id: string; text: string }
interface AppVault {
  questions(): Promise<AppQuestion[]>;
  answer(id: string, yes: boolean): Promise<void>;
  addPile(pile: { text: string; items: [] }): Promise<{ id: string }>;
  settled(): Promise<void>;
}
interface StartOptions { allowWeb?: boolean; subject?: string; requestId?: string; answer?: boolean }
interface AppRun { id: string; phase: string; waits?: true }
interface AppRuns { start(scope: 'all' | 'instructions', opts?: StartOptions): Promise<AppRun>; current(): Promise<AppRun | null> }
type Outcome = { kind: 'now'; run: AppRun } | { kind: 'waits' | 'next' } | { kind: 'failed'; error: unknown };
type AnswerQuestion = (vault: AppVault, runs: AppRuns, id: string, yes: boolean, opts: { allowWeb: boolean }) => Promise<{ outcome: Outcome } | null>;
type VaultClass = new (opts: { drive: FakeDrive; rootId: () => Promise<string>; runningPiles: () => ReadonlySet<string>; device: string }) => AppVault;

async function app(): Promise<{ answerQuestion: AnswerQuestion; DriveVault: VaultClass }> {
  const loop = new URL('../../src/data/answer-loop.ts', import.meta.url).pathname;
  const vault = new URL('../../src/data/vault/drive-vault.ts', import.meta.url).pathname;
  const { answerQuestion } = (await import(/* @vite-ignore */ loop)) as { answerQuestion: AnswerQuestion };
  const { DriveVault } = (await import(/* @vite-ignore */ vault)) as { DriveVault: VaultClass };
  return { answerQuestion, DriveVault };
}

/** This device's storage, as a browser keeps it (the app's journal outbox lives there). */
function deviceStorage(): Storage {
  const kept = new Map<string, string>();
  return {
    get length() {
      return kept.size;
    },
    clear: () => kept.clear(),
    getItem: (k) => kept.get(k) ?? null,
    key: (i) => [...kept.keys()][i] ?? null,
    removeItem: (k) => void kept.delete(k),
    setItem: (k, v) => void kept.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', deviceStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = { 'content-type': 'application/json' };

/** The app's runs as the live source sends them: the lease checked, then `POST /process` from the place that holds it. */
function runsOf(w: RealWorld): AppRuns {
  return {
    start: async (scope, opts = {}) => {
      const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
      const body = { scope, allowWeb: !!opts.allowWeb, requestId: opts.requestId ?? crypto.randomUUID(), ...(opts.subject !== undefined ? { subject: opts.subject } : {}), ...(opts.answer ? { answer: true } : {}) };
      const res = await w.api.browser(`${ORIGIN}/process`, { method: 'POST', headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) }, body: JSON.stringify(body) });
      expect(res.status).toBe(200);
      const reply = (await res.json()) as { run: AppRun; waits?: true };
      return reply.waits ? { ...reply.run, waits: true } : reply.run;
    },
    current: async () => ((await (await w.api.browser(`${ORIGIN}/status`)).json()) as { run: AppRun | null }).run,
  };
}

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });
interface Shown { piles: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>; answers?: Array<{ question: string; answer: string; fileId?: string; pileId?: string; note?: string; notes?: string[] }> }
const shownOf = (call: ClaudeCall): Shown => JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Shown;

/** The model: keeps one note only when it is shown the person's yes to that question, and files nothing else. */
const keepWhenAnswered: ClaudeSpawn = async (call) => {
  const yes = (shownOf(call).answers ?? []).some((a) => /Keep one note\?/.test(a.question) && a.answer === 'Yes, keep one');
  const intent = { kind: 'tidy-intent', v: 1, things: [], ...(yes ? { keep: [{ kept: KEPT, other: OTHER }] } : {}) };
  return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
};

async function corpusCase(id: string): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === id);
  if (!c) throw new Error(`no corpus case ${id}`);
  return c;
}

/** The keep-one-note folder with its question open and not yet answered (and any other changes of yours). */
async function keepWorld(journal: LoadedCase['journal'] = []): Promise<RealWorld> {
  const c = await corpusCase('c05-keep-one-note');
  return await realWorld({ seed: (drive) => seedCase(drive, { ...c, journal }), claude: keepWhenAnswered });
}

async function vaultOf(w: RealWorld): Promise<{ vault: AppVault; answerQuestion: AnswerQuestion }> {
  const { answerQuestion, DriveVault } = await app();
  return { vault: new DriveVault({ drive: w.drive, rootId: async () => w.rootId, runningPiles: () => new Set(), device: 'device-1' }), answerQuestion };
}

async function textAt(w: RealWorld, path: string): Promise<string | null> {
  const f = (await w.drive.listAll(w.rootId)).find((x) => !x.folder && w.drive.pathOf(x.id, w.rootId) === path);
  return f ? await w.drive.readText(f.id) : null;
}
const openQuestions = async (w: RealWorld): Promise<string[]> => (JSON.parse((await textAt(w, '.bower/questions.json')) ?? '{"questions":[]}') as { questions: Array<{ id: string }> }).questions.map((q) => q.id);
/** Your answers to `questionId` waiting in `.bower/changes` (not archived). */
async function answersWaiting(w: RealWorld, questionId: string): Promise<Array<{ text?: string }>> {
  const out: Array<{ text?: string }> = [];
  for (const f of await w.drive.listAll(w.rootId)) {
    const path = w.drive.pathOf(f.id, w.rootId);
    if (f.folder || !/^\.bower\/changes\/[^/]+\.json$/.test(path)) continue;
    const rec = JSON.parse(await w.drive.readText(f.id)) as { kind?: string; questionId?: string; text?: string };
    if (rec.kind === 'answer' && rec.questionId === questionId) out.push(rec);
  }
  return out;
}

const HUB = 'Projects/Job hunt/Job hunt.md';
/** What Bower last wrote in the hub's Current state (its mark), and the person's own lines since. */
const BOWER_LAST = ['One application open.'];
const PERSON = ['Two applications open, one interview on Friday.'];
/** Bower's update, as the model computes it in the answer's run. */
const UPDATE = ['Two applications open.', 'An interview on Friday.'];
const WRITE_IT = 'You changed the current state of Job hunt. Should Bower write its update there?';
/** The one re-ask (TL-P4-19 addendum 12, the designer's words): the note changed after the update was shown. */
const REASK = 'The current state of Job hunt changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?';
/** Drive's `md5Checksum`: the MD5 of the stored bytes, hex (RFC 1321). */
const md5 = (text: string): string => createHash('md5').update(Buffer.from(text, 'utf8')).digest('hex');
/** What the model was shown of your answers, run by run. */
let stateSeen: Array<Shown['answers']> = [];

/** The model: writes the hub's Current state only when shown a yes to Write it about that note, and files nothing. */
const writeWhenAnswered: ClaudeSpawn = async (call) => {
  const answers = shownOf(call).answers;
  stateSeen.push(answers);
  const yes = (answers ?? []).some((a) => a.answer === 'Write it' && a.note === HUB);
  const intent = { kind: 'tidy-intent', v: 1, things: [], ...(yes ? { states: [{ note: HUB, lines: UPDATE }] } : {}) };
  return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
};

/**
 * The hub-lines folder, the hub's Current state edited by the person since Bower last wrote it, and the question
 * Bower asked about it then (its `state`: the mark of PERSON, the section the person was asked about).
 */
async function stateWorld(lines: readonly string[], pad = ''): Promise<RealWorld> {
  const c = await corpusCase('c05-hub-lines');
  const hub = (c.folder[HUB] ?? '').replace('by: bower\n', `by: bower\nbower_state: ${stateMark(BOWER_LAST)}\n`).replace('- One application open.', lines.map((l) => `- ${l}`).join('\n')) + pad;
  stateSeen = [];
  const seed = async (drive: FakeDrive): Promise<string> => {
    const root = await seedCase(drive, { ...c, folder: { ...c.folder, [HUB]: hub }, journal: [], questions: [] });
    const all = await drive.listAll(root);
    const id = all.find((f) => drive.pathOf(f.id, root) === HUB)?.id ?? '';
    const q = all.find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
    const ask = { id: `q-state-${id}`, text: WRITE_IT, yes: 'Write it', no: 'Keep mine', about: HUB, state: stateMark(PERSON), askedAt: 1 };
    if (q) await drive.writeText(q.id, JSON.stringify({ v: 1, questions: [ask] }), q.modifiedTime);
    return root;
  };
  return await realWorld({ seed, claude: writeWhenAnswered });
}

async function hubId(w: RealWorld): Promise<string> {
  return (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === HUB)?.id ?? '';
}
/** The hub's edits in the run's manifest. */
async function hubEdits(w: RealWorld): Promise<EditText[]> {
  const path = (await w.drive.listAll(w.rootId)).map((f) => w.drive.pathOf(f.id, w.rootId)).find((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p));
  const m = JSON.parse((path ? await textAt(w, path) : null) ?? '{"operations":[]}') as ManifestV2;
  return m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === HUB ? [o.effect] : []));
}
const hubChanges = async (w: RealWorld): Promise<Change[]> => (await hubEdits(w)).flatMap((e) => e.changes);

/** Every call the model was asked, in order: each proposes Bower's update of the hub's Current state. */
let proposed: string[] = [];
const proposeUpdate: ClaudeSpawn = async (call) => {
  proposed.push(call.input);
  // The offer is filed beside the hub (so the hub is shown), and the hub's Current state is brought up to date,
  // citing the offer: a news line Bower writes in its place cites its source (TL-P4-19 addendum 20).
  const offer = shownOf(call).piles.flatMap((p) => p.things).find((t) => t.name === 'Offer_letter_final(2).pdf')?.fileId;
  const things = offer ? [{ fileId: offer, to: 'Projects/Job hunt/Applications', basis: HUB, name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. [[Job hunt]]' } }] : [];
  return { code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things, states: [{ note: HUB, lines: UPDATE, ...(offer ? { cites: offer } : {}) }] }) };
};
/** The hub-lines folder with the hub's section edited by the person since Bower last wrote it, and nothing asked yet. */
async function shownWorld(): Promise<RealWorld> {
  const c = await corpusCase('c05-hub-lines');
  const hub = (c.folder[HUB] ?? '').replace('by: bower\n', `by: bower\nbower_state: ${stateMark(BOWER_LAST)}\n`).replace('- One application open.', PERSON.map((l) => `- ${l}`).join('\n'));
  proposed = [];
  return await realWorld({ seed: (drive) => seedCase(drive, { ...c, scope: 'all', folder: { ...c.folder, [HUB]: hub }, inbox: [{ line: 'The Job hunt offer came in.', files: ['Offer_letter_final(2).pdf'] }], journal: [], questions: [] }), claude: proposeUpdate });
}
type StoredQuestion = { id: string; text: string; state?: string; shown?: { lines: string[]; md5: string; stamp?: string } };
const questionsNow = (text: string | null): StoredQuestion[] => (JSON.parse(text ?? '{"questions":[]}') as { questions: StoredQuestion[] }).questions;
/** The hub's changes in the manifest of the `i`th dispatched run. */
async function changesOfRun(w: RealWorld, i: number): Promise<Change[]> {
  const runId = w.dispatched[i]?.run_id ?? '';
  const path = (await w.drive.listAll(w.rootId)).map((f) => w.drive.pathOf(f.id, w.rootId)).find((p) => p.startsWith(`.bower/runs/${runId}/manifest-`));
  const m = JSON.parse((path ? await textAt(w, path) : null) ?? '{"operations":[]}') as ManifestV2;
  return m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === HUB ? o.effect.changes : []));
}

const PAIR_ASK = { text: 'Flat 3, 12 Larkspur Lane and Flat 3 (second) look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both' };
const NEWS = 'Second viewing booked for Saturday.';
const fileNothing: ClaudeSpawn = async () => ({ code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things: [] }) });
/** The model: the pile of words shown is news about the kept note, a Timeline line citing it. */
const citeNews: ClaudeSpawn = async (call) => {
  const pile = shownOf(call).piles[0]?.pileId;
  return { code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things: [], ...(pile ? { lines: [{ note: KEPT, text: NEWS, cites: pile }] } : {}) }) };
};

/**
 * The keep-one-note folder with a pair question asked by the notes' file ids, the other note in the Bin since. With
 * `stuck`, also your yes to it (a change of yours) and a pile of words whose news the kept note holds already.
 */
async function pairGoneSeed(drive: FakeDrive, stuck: boolean, bin = true): Promise<string> {
  const c = await corpusCase('c05-keep-one-note');
  const kept = stuck ? (c.folder[KEPT] ?? '').replace(/\n*$/, `\n- 2026-10-07 · ${NEWS}\n`) : c.folder[KEPT] ?? '';
  const root = await seedCase(drive, { ...c, scope: 'all', folder: { ...c.folder, [KEPT]: kept }, journal: [], questions: [], inbox: stuck ? [{ line: `Flat 3 at 12 Larkspur Lane: ${NEWS.toLowerCase()}`, files: [] }] : [] });
  const all = await drive.listAll(root);
  const idOf = (path: string): string => all.find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
  const id = pairQuestionId(idOf(KEPT), idOf(OTHER));
  const q = all.find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
  if (q) await drive.writeText(q.id, JSON.stringify({ v: 1, questions: [{ id, ...PAIR_ASK, about: KEPT, askedAt: 1 }] }), q.modifiedTime);
  if (stuck) await drive.createText(idOf('.bower/changes'), 'change-1.json', `${JSON.stringify({ v: 1, id: 'change-1', device: 'device-1', at: 1, kind: 'answer', what: 'Answered a question', text: 'yes', questionId: id })}\n`);
  if (bin) await drive.trash(idOf(OTHER));
  pairIdSeen = id;
  return root;
}
let pairIdSeen = '';

/** A press of Tidy up; false when the Worker finds nothing waiting (no run). */
async function press(w: RealWorld): Promise<boolean> {
  const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
  const res = await w.api.browser(`${ORIGIN}/process`, { method: 'POST', headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) }, body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: crypto.randomUUID() }) });
  return res.status === 200;
}

/** The report of the run, as its last checkpoint in `.bower/runs` holds it. */
async function reportOf(w: RealWorld): Promise<{ setAside: unknown[]; answered?: unknown[] } | undefined> {
  let found: { setAside: unknown[]; answered?: unknown[] } | undefined;
  for (const f of await w.drive.listAll(w.rootId)) {
    if (f.folder || !w.drive.pathOf(f.id, w.rootId).startsWith('.bower/runs/')) continue;
    const text = await w.drive.readText(f.id);
    const m = /"kind":\s*"run-report"/.test(text) ? (JSON.parse(text) as { kind?: string; report?: { setAside: unknown[] }; reportRecord?: { report: { setAside: unknown[] } } }) : null;
    found = m?.report ?? m?.reportRecord?.report ?? found;
  }
  return found;
}

/** Every set-aside and answered row of every run, as each run's last checkpoint in `.bower/runs` holds its report. */
async function reportRowsAll(w: RealWorld): Promise<{ setAside: unknown[]; answered: unknown[] }> {
  const byRun = new Map<string, { setAside: unknown[]; answered?: unknown[] }>();
  for (const f of await w.drive.listAll(w.rootId)) {
    const run = /^\.bower\/runs\/([^/]+)\//.exec(w.drive.pathOf(f.id, w.rootId))?.[1];
    if (f.folder || run === undefined) continue;
    const text = await w.drive.readText(f.id);
    const m = /"kind":\s*"run-report"/.test(text) ? (JSON.parse(text) as { report?: { setAside: unknown[]; answered?: unknown[] }; reportRecord?: { report: { setAside: unknown[]; answered?: unknown[] } } }) : null;
    const report = m?.report ?? m?.reportRecord?.report;
    if (report) byRun.set(run, report);
  }
  const all = [...byRun.values()];
  return { setAside: all.flatMap((r) => r.setAside), answered: all.flatMap((r) => r.answered ?? []) };
}

describe('an answer applies at once (TL-P4-08 addendum 8)', () => {
  it('a yes to keep one note starts a scoped run that merges', async () => {
    const w = await keepWorld();
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), KEEP_Q, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    // A small tidy-up, scoped to your changes and notes: it takes no pile of the inbox.
    expect(w.dispatched).toHaveLength(1);
    expect(w.dispatched[0]?.scope).toBe('instructions');
    expect(await w.runJob(0)).toBe(0);
    // The merge (keep-one-note-merge): the other note in the Bin, its fact on the kept note's Timeline.
    expect(await w.paths()).not.toContain(OTHER);
    expect(await textAt(w, KEPT)).toContain('The listing says the lease is twelve months.');
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([]);
  });

  // c3-planner-split: the answer the app stored reaches the model's input and the plan built from its reply, through
  // the Claude provider, with no scripted stand-in on the way.
  it('answers reach the model path', async () => {
    const c = await corpusCase('c05-keep-one-note');
    const shown: Shown[] = [];
    const w = await realWorld({ seed: (drive) => seedCase(drive, { ...c, journal: [] }), claude: async (call) => {
      shown.push(shownOf(call));
      return keepWhenAnswered(call);
    } });
    const { vault, answerQuestion } = await vaultOf(w);
    await answerQuestion(vault, runsOf(w), KEEP_Q, true, { allowWeb: false });
    expect(await w.runJob(0)).toBe(0);
    // The model was shown the person's yes...
    expect(shown).toHaveLength(2);
    for (const call of shown) expect(call.answers).toEqual([expect.objectContaining({ answer: 'Yes, keep one' })]);
    // ...the plan took that answer's record and archived it with the merge it asked for.
    const path = (await w.drive.listAll(w.rootId)).map((f) => w.drive.pathOf(f.id, w.rootId)).find((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p));
    const m = JSON.parse((path ? await textAt(w, path) : null) ?? '{}') as ManifestV2;
    expect(m.capture.journal).toHaveLength(1);
    expect(m.operations.some((o) => o.effect.kind === 'bin' && o.effect.before.name === 'Flat 3 (second).md')).toBe(true);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([]);
    expect(await openQuestions(w)).toEqual([]);
  });

  // c3-pair-ask (keep-one-not-asked): nothing seeded. The model asks about the two notes as a pair in a full run, the
  // person says yes in the app, and the answer's run merges them through keep-one-note-merge.
  it('a yes to a pair ask merges through keep-one-note-merge', async () => {
    const c = await corpusCase('c05-keep-one-note');
    const WORDS = 'Flat 3 at 12 Larkspur Lane: second viewing booked for Saturday.';
    const ask = { text: 'Flat 3, 12 Larkspur Lane and Flat 3 (second) look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both' };
    const shown: Shown[] = [];
    const model: ClaudeSpawn = async (call) => {
      const s = shownOf(call);
      shown.push(s);
      const pile = s.piles[0]?.pileId;
      const yes = (s.answers ?? []).some((a) => a.answer === ask.yes);
      const intent = yes
        ? { kind: 'tidy-intent', v: 1, things: [], keep: [{ kept: KEPT, other: OTHER }] }
        : { kind: 'tidy-intent', v: 1, things: [], ...(pile ? { notes: [{ pileId: pile, to: 'Projects/Flat hunt', name: 'Flat 3, second viewing.md' }] } : {}), asks: [{ notes: [KEPT, OTHER], ...ask }] };
      return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
    };
    const w = await realWorld({ seed: (drive) => seedCase(drive, { ...c, scope: 'all', journal: [], questions: [], inbox: [{ line: WORDS, files: [] }] }), claude: model });
    const runs = runsOf(w);
    await runs.start('all', { allowWeb: false });
    expect(await w.runJob(0)).toBe(0);
    // Bower asked, in plain words; the app shows the question.
    const { vault, answerQuestion } = await vaultOf(w);
    const asked = (await vault.questions()).find((q) => q.text === ask.text);
    expect(asked).toBeDefined();
    const done = await answerQuestion(vault, runs, asked?.id ?? '', true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(w.dispatched[1]?.scope).toBe('instructions');
    expect(await w.runJob(1)).toBe(0);
    // The model was shown the yes with the two notes it is about...
    expect(shown.at(-1)?.answers).toEqual([expect.objectContaining({ answer: ask.yes, notes: expect.arrayContaining([KEPT, OTHER]) as unknown })]);
    // ...and the merge ran: the other note in the Bin, its fact on the kept note, the question and answer gone.
    expect(await w.paths()).not.toContain(OTHER);
    expect(await textAt(w, KEPT)).toContain('The listing says the lease is twelve months.');
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, asked?.id ?? '')).toEqual([]);
  });

  it('a yes to a pair whose other note is in the Bin settles and says nothing was merged', async () => {
    // Answered yes while both notes were there; the other note went to the Bin before the run.
    const w = await realWorld({ seed: (drive) => pairGoneSeed(drive, false, false), claude: fileNothing });
    const runs = runsOf(w);
    const { vault, answerQuestion } = await vaultOf(w);
    const asked = (await vault.questions()).find((q) => q.text === PAIR_ASK.text);
    expect(asked).toBeDefined();
    const done = await answerQuestion(vault, runs, asked?.id ?? '', true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    const other = (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === OTHER);
    await w.drive.trash(other?.id ?? '');
    expect(await w.runJob(0)).toBe(0);
    // The answer settles: its question closed, the answer read, the note kept as it was, and the report says why.
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, asked?.id ?? '')).toEqual([]);
    expect(await w.paths()).toContain(KEPT);
    // Not set aside (TL-P4-19 addendum 10): an answered row, on the note that stays.
    expect((await reportOf(w))?.setAside).toEqual([]);
    expect((await reportOf(w))?.answered).toEqual([{ questionId: asked?.id, kind: 'pair', outcome: 'subject-gone', why: 'Not merged: Flat 3 (second) was already in the Bin.', note: KEPT }]);
  });

  it('with no new input a second run leaves nothing held or waiting for the same reason', async () => {
    // Both stuck cases at once: a pile of words whose line its note holds already, and a yes to a pair whose other
    // note is in the Bin. A run, then a second press with nothing new: whatever the first left held or waiting, the
    // second must not leave so again.
    const w = await realWorld({ seed: (drive) => pairGoneSeed(drive, true), claude: citeNews });
    const left: string[][] = [];
    for (const i of [0, 1]) {
      if (await press(w)) expect(await w.runJob(i)).toBe(0);
      left.push([...(await w.paths()).filter((p) => p.startsWith('Inbox/')), ...(await answersWaiting(w, pairIdSeen)).map(() => 'answer')]);
    }
    expect(left[1]?.filter((x) => left[0]?.includes(x))).toEqual([]);
    expect(left[0]).toEqual([]);
  });

  it('answering twice starts one run', async () => {
    const w = await keepWorld();
    const { vault, answerQuestion } = await vaultOf(w);
    const runs = runsOf(w);
    // Twice at once (a double tap), then once more.
    const both = await Promise.all([answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false }), answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false })]);
    const ids = both.map((b) => (b?.outcome.kind === 'now' ? b.outcome.run.id : null));
    const again = await answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false });
    expect(again).toBeNull();
    expect(ids[0]).not.toBeNull();
    expect(new Set(ids).size).toBe(1);
    expect(w.dispatched).toHaveLength(1);
    // One answer, stored once with its question.
    expect(await answersWaiting(w, KEEP_Q)).toEqual([expect.objectContaining({ text: 'yes' })]);
    expect((await vault.questions()).map((q) => q.id)).not.toContain(KEEP_Q);
  });

  it('an answer during a run is applied by the next', async () => {
    const w = await keepWorld([{ kind: 'rule', text: 'Receipts go in Areas/Money' }]);
    const { vault, answerQuestion } = await vaultOf(w);
    const runs = runsOf(w);
    // A tidy-up is going (pressed before the answer): the answer does not join it and starts no other now.
    const going = await runs.start('instructions', { allowWeb: false });
    const done = await answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false });
    expect(done?.outcome).toEqual({ kind: 'waits' });
    expect(going.id).not.toBe('');
    expect(w.dispatched).toHaveLength(1);
    expect(await w.runJob(0)).toBe(0);
    expect(await w.paths()).toContain(OTHER);
    expect(await answersWaiting(w, KEEP_Q)).toHaveLength(1);
    expect(await openQuestions(w)).toEqual([KEEP_Q]);
    // The run ended: the person object's alarm, due at once, starts the answer's run and dispatches it, with no press
    // (TL-P4-13 addendum; a retried alarm still starts one: api/test/process.test.ts).
    expect(w.dispatched).toHaveLength(2);
    expect(w.dispatched[1]?.scope).toBe('instructions');
    expect(await w.runJob(1)).toBe(0);
    expect(await w.paths()).not.toContain(OTHER);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([]);
    expect(await openQuestions(w)).toEqual([]);
  });

  it('a no closes the question with no run', async () => {
    const w = await keepWorld();
    const { vault, answerQuestion } = await vaultOf(w);
    const runs = runsOf(w);
    const done = await answerQuestion(vault, runs, KEEP_Q, false, { allowWeb: false });
    expect(done?.outcome).toEqual({ kind: 'next' });
    expect(w.dispatched).toEqual([]);
    expect((await vault.questions()).map((q) => q.id)).not.toContain(KEEP_Q);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([expect.objectContaining({ text: 'no' })]);
    // The next tidy-up drops it from Bower's list for good and keeps both notes.
    await runs.start('instructions', { allowWeb: false });
    expect(await w.runJob(0)).toBe(0);
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([]);
    expect(await w.paths()).toContain(OTHER);
  });

  it('a yes to a thing asked about starts a run that takes only its pile, with the answer shown', async () => {
    const c = await corpusCase('c04-offer-and-flat');
    const photoPile = { line: 'The flat viewing, and the payslip.', files: ['IMG_2301.jpg', 'Payslip_Aug.pdf'] };
    const otherPile = { line: 'A flat listing.', files: ['listing-88213.example.url'] };
    let photo = '';
    const seed = async (drive: FakeDrive): Promise<string> => {
      const root = await seedCase(drive, { ...c, inbox: [otherPile, photoPile], journal: [], questions: [] });
      const all = await drive.listAll(root);
      photo = all.find((f) => f.name === 'IMG_2301.jpg')?.id ?? '';
      const q = all.find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
      const ask = { id: `q-ask-${photo}`, text: 'Is the kitchen photo from the Wrenfield Road viewing?', yes: 'Yes', no: 'No', subject: photo, askedAt: 1 };
      if (q) await drive.writeText(q.id, JSON.stringify({ v: 1, questions: [ask] }), q.modifiedTime);
      return root;
    };
    const seen: Shown[] = [];
    const model: ClaudeSpawn = async (call) => {
      const shown = shownOf(call);
      seen.push(shown);
      const id = (name: string): string => shown.piles.flatMap((p) => p.things).find((t) => t.name === name)?.fileId ?? `no ${name}`;
      const things = [
        { fileId: id('IMG_2301.jpg'), to: 'Projects/Flat hunt', name: 'Kitchen, Wrenfield Road.jpg' },
        { fileId: id('Payslip_Aug.pdf'), to: 'Resources/Pay', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } },
      ];
      return { code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things }) };
    };
    const w = await realWorld({ seed, claude: model });
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-ask-${photo}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(w.dispatched).toHaveLength(1);
    expect(w.dispatched[0]?.scope).toBe('all');
    expect(await w.runJob(0)).toBe(0);
    // Only the photo's pile was taken; the model saw the question and the answer, as data about that thing.
    expect(seen[0]?.piles.flatMap((p) => p.things.map((t) => t.name)).sort()).toEqual(['IMG_2301.jpg', 'Payslip_Aug.pdf']);
    expect(seen[0]?.answers).toEqual([{ question: 'Is the kitchen photo from the Wrenfield Road viewing?', answer: 'Yes', fileId: photo }]);
    const paths = await w.paths();
    expect(paths).toContain('Projects/Flat hunt/Kitchen, Wrenfield Road.jpg');
    expect(paths.some((p) => p.startsWith('Inbox/') && p.endsWith('listing-88213.example.url'))).toBe(true);
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, `q-ask-${photo}`)).toEqual([]);
  });

  it('a yes to Write it writes the update in a scoped run', async () => {
    const w = await stateWorld(PERSON);
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    // A small tidy-up of your changes and notes, at once: it takes no pile of the inbox.
    expect(done?.outcome.kind).toBe('now');
    expect(w.dispatched).toHaveLength(1);
    expect(w.dispatched[0]?.scope).toBe('instructions');
    expect(await w.runJob(0)).toBe(0);
    // The model was shown the yes and the note it is about, and computed the update in this run.
    expect(stateSeen[0]).toEqual([{ question: WRITE_IT, answer: 'Write it', note: HUB }]);
    const after = await textAt(w, HUB) ?? '';
    expect(parseNote(HUB, after).currentState).toEqual(UPDATE);
    // Marked as Bower's; the rest of the note as it was (no "New:" line instead).
    expect(currentStateOf(new TextEncoder().encode(after))?.owner).toBe('bower');
    expect(parseNote(HUB, after).timeline).toEqual(parseNote(HUB, before ?? '').timeline);
    // The person's yes is the grant for that one write, recorded in the manifest with the mark it saw.
    const change = (await hubChanges(w)).find((c) => c.kind === 'state-rewrite');
    const answer = change?.kind === 'state-rewrite' ? change.recordIds[0] : undefined;
    expect(change).toEqual({ kind: 'state-rewrite', recordIds: [expect.any(String)], previous: PERSON, lines: UPDATE, granted: { answer, mark: stateMark(BOWER_LAST) } });
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    expect((await w.paths()).some((p) => p.startsWith('Inbox/') && p.endsWith('listing-88213.example.url'))).toBe(true);
  });

  it('a person edit after the question stops Write it', async () => {
    // Asked about PERSON; the person changed the section again before saying yes.
    const again = ['Two applications open, interview moved to Monday.'];
    const w = await stateWorld(again);
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(0)).toBe(0);
    // Nothing is written: the note is byte for byte as the person left it.
    expect(await textAt(w, HUB)).toBe(before);
    expect((await hubChanges(w)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    // The question is asked again, honestly, about the section as it is now; the old answer is used up.
    const asked = (JSON.parse((await textAt(w, '.bower/questions.json')) ?? '{}') as { questions: Array<{ id: string; text: string; askedAt: number; state?: string }> }).questions;
    expect(asked).toEqual([expect.objectContaining({ id: `q-state-${id}`, text: REASK, yes: 'Write it', no: 'Keep mine', state: stateMark(again) })]);
    expect(asked[0]?.askedAt).not.toBe(1);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    // The write itself checks what it read: a grant for other lines than the section's is refused.
    const grant: Change = { kind: 'state-rewrite', recordIds: ['change-x'], previous: PERSON, lines: UPDATE, granted: { answer: 'change-x', mark: stateMark(BOWER_LAST) } };
    expect(applyChanges(new TextEncoder().encode(before ?? ''), [grant])).toEqual({ ok: false, reason: 'state-changed' });
  });

  it('undo of Write it restores the person\'s section', async () => {
    const w = await stateWorld(PERSON);
    const id = await hubId(w);
    const before = await textAt(w, HUB) ?? '';
    const { vault, answerQuestion } = await vaultOf(w);
    await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(w.dispatched).toHaveLength(1);
    expect(await w.runJob(0)).toBe(0);
    const after = new TextEncoder().encode(await textAt(w, HUB) ?? '');
    const edit = (await hubEdits(w))[0];
    expect(edit).toBeDefined();
    if (!edit) return;
    // The edit's before-image puts the note back byte for byte (C13).
    const back = await undoEdit(edit, after);
    expect(back.ok && back.text).toBe(before);
    // The change alone gives the person's lines back with the mark they had: the section is theirs again.
    const undone = applyChanges(after, undoChanges(edit.changes));
    expect(undone.ok).toBe(true);
    const state = currentStateOf(new TextEncoder().encode(undone.ok ? undone.text : ''));
    expect(state).toEqual({ owner: 'person', lines: PERSON });
    expect(undone.ok && undone.text).toBe(before);
    // A section the person changed after Bower's write is never taken back over them.
    const edited = new TextEncoder().encode(new TextDecoder().decode(after).replace(`- ${UPDATE[1]}`, '- Interview went well.'));
    expect(await undoEdit(edit, edited)).toEqual({ ok: false, reason: 'person-edited' });
  });

  it('a yes to write it applies the shown text with no model call', async () => {
    const w = await shownWorld();
    // The tidy-up that asks: the model proposes its update, the person's section is kept, and the question keeps the
    // text it was shown with the note as the run left it.
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const asked = questionsNow(await textAt(w, '.bower/questions.json'));
    expect(asked.find((q) => q.id === `q-state-${id}`)?.shown?.lines).toEqual(UPDATE);
    expect(parseNote(HUB, await textAt(w, HUB) ?? '').currentState).toEqual(PERSON);
    const calls = proposed.length;
    // Write it: the stored text is applied through the fence, and the model is not asked again.
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(1)).toBe(0);
    expect(proposed.length).toBe(calls);
    const after = await textAt(w, HUB) ?? '';
    expect(parseNote(HUB, after).currentState).toEqual(UPDATE);
    expect(currentStateOf(new TextEncoder().encode(after))?.owner).toBe('bower');
    const change = (await changesOfRun(w, 1)).find((c) => c.kind === 'state-rewrite');
    const answer = change?.kind === 'state-rewrite' ? change.recordIds[0] : undefined;
    expect(change).toEqual({ kind: 'state-rewrite', recordIds: [expect.any(String)], previous: PERSON, lines: UPDATE, granted: { answer, mark: stateMark(BOWER_LAST) } });
    expect(questionsNow(await textAt(w, '.bower/questions.json')).some((q) => q.id === `q-state-${id}`)).toBe(false);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
  });

  it('write it re-asks when the section changed since it was shown', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    // The person edits their section again after the question was asked.
    const again = ['Two applications open, interview moved to Monday.'];
    const shown = await textAt(w, HUB) ?? '';
    const hub = (await w.drive.listAll(w.rootId)).find((f) => f.id === id);
    await w.drive.writeText(id, shown.replace(`- ${PERSON[0]}`, `- ${again[0]}`), hub?.modifiedTime ?? '');
    const before = await textAt(w, HUB);
    const calls = proposed.length;
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(1)).toBe(0);
    // Nothing is written, no model is asked, and the question is asked again with its reason and the same text.
    expect(proposed.length).toBe(calls);
    expect(await textAt(w, HUB)).toBe(before);
    expect((await changesOfRun(w, 1)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    const q = questionsNow(await textAt(w, '.bower/questions.json')).find((x) => x.id === `q-state-${id}`);
    expect(q).toEqual(expect.objectContaining({ text: REASK, state: stateMark(again) }));
    expect(q?.shown?.lines).toEqual(UPDATE);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
  });

  it('a write it yes whose note is gone writes one answered row', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    // Write it, answered while the note was there; the note went to the Bin before Bower's run.
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    await w.drive.trash(id);
    const calls = proposed.length;
    expect(await w.runJob(1)).toBe(0);
    // Nothing written, no model asked, the answer settled and its question closed; one answered row says why.
    expect(proposed.length).toBe(calls);
    expect((await changesOfRun(w, 1)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    expect(questionsNow(await textAt(w, '.bower/questions.json')).some((q) => q.id === `q-state-${id}`)).toBe(false);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    const rows = await reportRowsAll(w);
    expect(rows.setAside).toEqual([]);
    expect(rows.answered).toEqual([{ questionId: `q-state-${id}`, kind: 'state', outcome: 'subject-gone', why: 'Not written: Job hunt had moved or gone to the Bin before Bower got to it.' }]);
  });

  it('write it re-asks when the note changed elsewhere since it was shown', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    // On another device the person adds a Timeline line: the section reads as asked about, the note does not.
    const shown = await textAt(w, HUB) ?? '';
    const hub = await w.drive.get(id);
    await w.drive.writeText(id, shown.replace('## Timeline\n', '## Timeline\n- 2026-10-08 · Called the recruiter.\n'), hub.modifiedTime);
    const before = await textAt(w, HUB) ?? '';
    expect(before).not.toBe(shown);
    expect(parseNote(HUB, before).currentState).toEqual(PERSON);
    const calls = proposed.length;
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(1)).toBe(0);
    // The stamp and checksum the question kept no longer match: nothing is written, and it is asked again, with the
    // reason, about the same section and update, and the note as it reads now.
    expect(proposed.length).toBe(calls);
    expect(await textAt(w, HUB)).toBe(before);
    expect((await changesOfRun(w, 1)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    const q = questionsNow(await textAt(w, '.bower/questions.json')).find((x) => x.id === `q-state-${id}`);
    expect(q).toEqual(expect.objectContaining({ text: REASK, state: stateMark(PERSON) }));
    expect(q?.shown).toEqual(expect.objectContaining({ lines: UPDATE, md5: md5(before) }));
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    const rows = await reportRowsAll(w);
    expect(rows.answered).toEqual([]);
  });

  it('a clash at write time leads to the re-ask with the new sentence and no extra press', async () => {
    // TL-P4-19 addendum 15 (option a): the note changes on another device after the run planned the write and before
    // the write's own read (the engine's NOTE_CHANGED). The edit is refused, the answer stays in your changes, and the
    // runner's end status says so: the Worker's alarm starts the run that asks again, with no press.
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    // Once the run's records start (its plan made), the next read of the note finds it changed on another device.
    let planned = false;
    let changed = false;
    const elsewhere: Hop = async (url, init, next) => {
      if (!changed && (init.method ?? 'GET') === 'POST' && url.pathname === '/upload/drive/v3/files') planned = true;
      if (planned && !changed && url.pathname === `/drive/v3/files/${id}` && url.searchParams.get('alt') === 'media') {
        changed = true;
        const text = await textAt(w, HUB) ?? '';
        await w.drive.writeText(id, text.replace('## Timeline\n', '## Timeline\n- 2026-10-08 · Called the recruiter.\n'), (await w.drive.get(id)).modifiedTime);
      }
      return await next();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatched = w.dispatched.length;
    expect(await w.runJob(1, elsewhere)).toBe(0);
    expect(changed).toBe(true);
    const before = await textAt(w, HUB) ?? '';
    expect(parseNote(HUB, before).currentState).toEqual(PERSON);
    expect(await answersWaiting(w, `q-state-${id}`)).toHaveLength(1);
    // No press: at the run's end the Worker's own alarm (due at once, as the runtime fires it) starts the next run of
    // your changes, once.
    expect(w.dispatched).toHaveLength(dispatched + 1);
    expect(w.dispatched.at(-1)?.scope).toBe('instructions');
    expect(await w.runJob(dispatched)).toBe(0);
    // Asked again in the one re-ask wording, about the same update and the note as it reads now; nothing written.
    expect(await textAt(w, HUB)).toBe(before);
    const q = questionsNow(await textAt(w, '.bower/questions.json')).find((x) => x.id === `q-state-${id}`);
    expect(q).toEqual(expect.objectContaining({ text: REASK, state: stateMark(PERSON) }));
    expect(q?.shown).toEqual(expect.objectContaining({ lines: UPDATE, md5: md5(before) }));
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    // The re-ask used the answer up: nothing more starts on its own.
    expect(await w.api.fireAlarm().then(() => w.dispatched.length)).toBe(dispatched + 1);
  });

  it('only a clash keeps an answer for a re-ask', async () => {
    // TL-P4-19 addendum 16: a refusal that is not a clash (Drive answers 503 to the write, every time) needs no new
    // answer from the person, so a run that asks again would loop. The run's end does not say the answer stayed, and
    // nothing starts on its own.
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    let refused = 0;
    const busy: Hop = async (url, init, next) => {
      if ((init.method ?? 'GET') === 'PATCH' && url.pathname === `/upload/drive/v3/files/${id}`) {
        refused += 1;
        return new Response(null, { status: 503 });
      }
      return await next();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatched = w.dispatched.length;
    expect(await w.runJob(1, busy)).toBe(0);
    expect(refused).toBeGreaterThan(0);
    expect(await textAt(w, HUB)).toBe(before);
    expect(w.dispatched).toHaveLength(dispatched);
    expect(await w.api.fireAlarm().then(() => w.dispatched.length)).toBe(dispatched);
  });

  it('the same non-clash refusal never starts more runs than the cap, then shows the not-written row', async () => {
    // TL-P4-19 addendum 21: Drive answers 503 to the granted write, every time. The engine is untouched: the answer's
    // archive waits for its write, so the answer stays in your changes and nothing starts on its own. The run says so
    // in one answered row (not a thing set aside), and the next press tries the write once more.
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    const writes = { refused: 0, tried: 0 };
    const busy: Hop = async (url, init, next) => {
      if ((init.method ?? 'GET') === 'PATCH' && url.pathname === `/upload/drive/v3/files/${id}`) {
        writes.refused += 1;
        return new Response(null, { status: 503 });
      }
      return await next();
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatched = w.dispatched.length;
    expect(await w.runJob(1, busy)).toBe(0);
    expect(writes.refused).toBeGreaterThan(0);
    expect(await textAt(w, HUB)).toBe(before);
    // No further run, on its own or by the alarm.
    expect(w.dispatched).toHaveLength(dispatched);
    expect(await w.api.fireAlarm().then(() => w.dispatched.length)).toBe(dispatched);
    // The answer is kept, and its row shows under the answered label, once.
    expect(await answersWaiting(w, `q-state-${id}`)).toHaveLength(1);
    const rows = await reportRowsAll(w);
    expect(rows.setAside).toEqual([]);
    expect(rows.answered).toEqual([{ questionId: `q-state-${id}`, kind: 'state', outcome: 'refused', why: "Not written: Bower couldn't reach Drive to change Job hunt. Bower will try again in the next tidy-up.", note: HUB }]);
    // The next tidy-up (something new in the inbox) tries the write once, under the stamp-plus-checksum check, and it lands.
    const inbox = (await w.drive.listAll(w.rootId)).find((f) => f.folder && w.drive.pathOf(f.id, w.rootId) === 'Inbox');
    await w.drive.createText(inbox?.id ?? '', 'Call back.md', 'Call Alex back on Monday.\n');
    const tries: Hop = async (url, init, next) => {
      if ((init.method ?? 'GET') === 'PATCH' && url.pathname === `/upload/drive/v3/files/${id}`) writes.tried += 1;
      return await next();
    };
    expect(await press(w)).toBe(true);
    expect(await w.runJob(w.dispatched.length - 1, tries)).toBe(0);
    expect(writes.tried).toBe(1);
    expect(parseNote(HUB, (await textAt(w, HUB)) ?? '').currentState).toEqual(UPDATE);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
  });

  it('a write it refused for good writes one answered row on Home and on the note', async () => {
    // A note past the size Bower edits (1 MiB), asked about before questions kept the update they showed: the yes is
    // checked and its write refused for good. Nothing is written and the person's section is as they left it.
    const w = await stateWorld(PERSON, `\n## Notes\n${'Notes kept by hand. '.repeat(Math.ceil(EDIT_FILE_LIMIT / 20))}\n`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(0)).toBe(0);
    expect(await textAt(w, HUB)).toBe(before);
    expect((await hubChanges(w)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    // The answer settles and its question closes; one answered row says why, under the result and on the note.
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    const rows = await reportRowsAll(w);
    expect(rows.setAside).toEqual([]);
    expect(rows.answered).toEqual([{ questionId: `q-state-${id}`, kind: 'state', outcome: 'refused', why: 'Not written: Drive would not let Bower change Job hunt. Your current state is as you left it.', note: HUB }]);
  });

  it('a write it with nothing to write writes one answered row', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    // The person types Bower's update into the section themselves before saying yes.
    const shown = await textAt(w, HUB) ?? '';
    const hub = await w.drive.get(id);
    await w.drive.writeText(id, shown.replace(`- ${PERSON[0]}`, UPDATE.map((l) => `- ${l}`).join('\n')), hub.modifiedTime);
    const before = await textAt(w, HUB);
    expect(parseNote(HUB, before ?? '').currentState).toEqual(UPDATE);
    const calls = proposed.length;
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), `q-state-${id}`, true, { allowWeb: false });
    expect(done?.outcome.kind).toBe('now');
    expect(await w.runJob(1)).toBe(0);
    // Nothing written, no model asked, no question asked again: the answer settles with one answered row.
    expect(proposed.length).toBe(calls);
    expect(await textAt(w, HUB)).toBe(before);
    expect((await changesOfRun(w, 1)).some((c) => c.kind === 'state-rewrite')).toBe(false);
    expect(questionsNow(await textAt(w, '.bower/questions.json')).some((q) => q.id === `q-state-${id}`)).toBe(false);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
    const rows = await reportRowsAll(w);
    expect(rows.setAside).toEqual([]);
    expect(rows.answered).toEqual([{ questionId: `q-state-${id}`, kind: 'state', outcome: 'nothing-to-write', why: 'Nothing to write: Job hunt already said what Bower would have written.', note: HUB }]);
  });

  it('a lone no to write it closes the question with no model call', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const before = await textAt(w, HUB);
    const calls = proposed.length;
    const { vault, answerQuestion } = await vaultOf(w);
    // A no starts no run; the next run of your changes takes it alone, with no pile.
    await answerQuestion(vault, runsOf(w), `q-state-${id}`, false, { allowWeb: false });
    expect(w.dispatched).toHaveLength(1);
    await runsOf(w).start('instructions', { allowWeb: false });
    expect(await w.runJob(1)).toBe(0);
    expect(proposed.length).toBe(calls);
    expect(await textAt(w, HUB)).toBe(before);
    expect(questionsNow(await textAt(w, '.bower/questions.json')).some((q) => q.id === `q-state-${id}`)).toBe(false);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
  });

  it('a yes to write it beside a pile asks the model', async () => {
    const w = await shownWorld();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(0)).toBe(0);
    const id = await hubId(w);
    const calls = proposed.length;
    // The yes is kept with no run of its own, and a pile is in the inbox when Tidy up is pressed: the model is asked.
    const { vault } = await vaultOf(w);
    await vault.answer(`q-state-${id}`, true);
    await vault.addPile({ text: 'Ask about the notice period', items: [] });
    await vault.settled();
    expect(await press(w)).toBe(true);
    expect(await w.runJob(1)).toBe(0);
    expect(proposed.length).toBe(calls + 2); // Selection and execution both count.
    expect(parseNote(HUB, await textAt(w, HUB) ?? '').currentState).toEqual(UPDATE);
    expect(await answersWaiting(w, `q-state-${id}`)).toEqual([]);
  });

  it('of two answers to one question, the later one counts', async () => {
    // A yes on one device, then a no on another: the no is the person's answer, so both notes stay.
    const w = await keepWorld([{ kind: 'answer', text: 'yes', questionId: KEEP_Q }, { kind: 'answer', text: 'no', questionId: KEEP_Q }]);
    await runsOf(w).start('instructions', { allowWeb: false });
    expect(await w.runJob(0)).toBe(0);
    expect(await w.paths()).toContain(OTHER);
    expect(await openQuestions(w)).toEqual([]);
    expect(await answersWaiting(w, KEEP_Q)).toEqual([]);
  });
});
