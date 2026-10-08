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
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { seedCase } from './corpus-run';
import { ORIGIN, realWorld } from './real-world';
import type { RealWorld } from './real-world-types';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
const KEEP_Q = 'q-merge-flat-3';
const KEPT = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const OTHER = 'Projects/Flat hunt/Flat 3 (second).md';

/** The app's side, loaded at run time: its modules type-check with the browser's types, not Node's. */
interface AppQuestion { id: string; text: string }
interface AppVault {
  questions(): Promise<AppQuestion[]>;
  answer(id: string, yes: boolean): Promise<void>;
}
interface StartOptions { allowWeb?: boolean; subject?: string; requestId?: string }
interface AppRuns { start(scope: 'all' | 'instructions', opts?: StartOptions): Promise<{ id: string }> }
type AnswerQuestion = (vault: AppVault, runs: AppRuns, id: string, yes: boolean, opts: { allowWeb: boolean }) => Promise<{ run: Promise<{ id: string }> | null } | null>;
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
      const body = { scope, allowWeb: !!opts.allowWeb, requestId: opts.requestId ?? crypto.randomUUID(), ...(opts.subject !== undefined ? { subject: opts.subject } : {}) };
      const res = await w.api.browser(`${ORIGIN}/process`, { method: 'POST', headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) }, body: JSON.stringify(body) });
      expect(res.status).toBe(200);
      const reply = (await res.json()) as { run: { id: string } };
      return reply.run;
    },
  };
}

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });
interface Shown { piles: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>; answers?: Array<{ question: string; answer: string; fileId?: string; pileId?: string }> }
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

describe('an answer applies at once (TL-P4-08 addendum 8)', () => {
  it('a yes to keep one note starts a scoped run that merges', async () => {
    const w = await keepWorld();
    const { vault, answerQuestion } = await vaultOf(w);
    const done = await answerQuestion(vault, runsOf(w), KEEP_Q, true, { allowWeb: false });
    expect(done?.run).not.toBeNull();
    await done?.run;
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

  it('answering twice starts one run', async () => {
    const w = await keepWorld();
    const { vault, answerQuestion } = await vaultOf(w);
    const runs = runsOf(w);
    // Twice at once (a double tap), then once more.
    const both = await Promise.all([answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false }), answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false })]);
    const ids = await Promise.all(both.map((b) => b?.run));
    const again = await answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false });
    await again?.run;
    expect(new Set(ids.map((r) => r?.id)).size).toBe(1);
    expect(w.dispatched).toHaveLength(1);
    // One answer, stored once with its question.
    expect(await answersWaiting(w, KEEP_Q)).toEqual([expect.objectContaining({ text: 'yes' })]);
    expect((await vault.questions()).map((q) => q.id)).not.toContain(KEEP_Q);
  });

  it('an answer during a run is applied by the next', async () => {
    const w = await keepWorld([{ kind: 'rule', text: 'Receipts go in Areas/Money' }]);
    const { vault, answerQuestion } = await vaultOf(w);
    const runs = runsOf(w);
    // A tidy-up is going (pressed before the answer): the answer does not join it and starts no other.
    const going = await runs.start('instructions', { allowWeb: false });
    const done = await answerQuestion(vault, runs, KEEP_Q, true, { allowWeb: false });
    expect((await done?.run)?.id).toBe(going.id);
    expect(w.dispatched).toHaveLength(1);
    expect(await w.runJob(0)).toBe(0);
    expect(await w.paths()).toContain(OTHER);
    expect(await answersWaiting(w, KEEP_Q)).toHaveLength(1);
    expect(await openQuestions(w)).toEqual([KEEP_Q]);
    // The next run takes it and keeps one note.
    await runs.start('instructions', { allowWeb: false });
    expect(w.dispatched).toHaveLength(2);
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
    expect(done?.run).toBeNull();
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
    await done?.run;
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
});
