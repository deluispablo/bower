/** B12d through production main: a set over 200 notes waits for one yes; a yes runs exactly the stored first part (TL-P4-39 addendum 3, TL-P4-52 Q2, Q9). */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTypeTable } from '../../src/data/contracts/note-format';
import { subjectOf } from '../../src/data/contracts/questions';
import { answerRun } from '../../src/data/answer-loop';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { REQUEST_DONE } from '../../src/data/spine/scripted';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { RunnerStatus } from '../src/status';
import { caseReplies, redispatchCase, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-b12';
const HUNT = 'Projects/Job hunt';
const OLD = `${HUNT}/Oldwick offer.md`;
const LATE = `${HUNT}/Latewick offer.md`;
const NOTE = `${HUNT}/Request - Review offers.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'concept', properties: { review_state: { type: 'enum', values: ['new', 'reviewed'] } }, table: ['review_state'] }] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const QUESTION = { text: 'There are 201 active offers. Start with the 200 most recent?', yes: 'Start with these', no: 'Leave them' };
const WORDS = 'Mark every active offer in Job hunt as reviewed; ask me first if there are many.';
const offer = (name: string, created = '2026-10-01', by = true) => `---\n${by ? 'by: bower\n' : ''}type: offer\nsummary: ${name} offers Alex remote work.\nstatus: active\n`
  + `created: ${created}\nreview_state: new\n---\n\n## Notes\n${name} offers Alex remote work.\n`;
const offerPath = (i: number) => `${HUNT}/Offer ${String(i).padStart(3, '0')}.md`;

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

async function folder(given: Record<string, string> = {}) {
  // The seed makes questions.json from the case's questions: one such file, never a second at its path.
  const { [SYSTEM.questions]: asked, ...files } = given;
  const c: LoadedCase = { id: 'b12-large-part', capability: 'C05', title: 'Alex maps a large set', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: asked ? (JSON.parse(asked) as { questions: LoadedCase['questions'] }).questions : [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n',
      [`Resources/Gardening/Gardening.md`]: '---\nby: bower\ntype: moc\nsummary: Gardening notes.\n---\n\n## Notes\nGardening.\n', [OLD]: offer('Oldwick', '2026-09-01'), ...files } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  return { c, drive, root, id, press: 0 };
}
type Folder = Awaited<ReturnType<typeof folder>>;
type Ctx = { request: string; hunt: string; id: (path: string) => Promise<string>; frame: string };
const empty = { kind: 'tidy-intent', v: 1, things: [] };
type Press = { words?: string; request?: false; inbox?: { name: string; text: string }; answer?: { question: Question; yes: boolean };
  around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch };
type Question = { id: string; askedAt: number; text: string; yes: string; no: string } & Record<string, unknown>;

async function press(f: Folder, intent: (ctx: Ctx, attempt: number) => unknown, o: Press = {}) {
  f.press++;
  const changes = await f.id(SYSTEM.changes);
  if (o.inbox) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'File this garden notice with Gardening.\n');
    await f.drive.createText(pile.id, o.inbox.name, o.inbox.text);
  }
  if (o.answer) await f.drive.createText(changes, `answer-${f.press}.json`, JSON.stringify({ v: 1, id: `answer-${f.press}`, device: 'device-1', at: DAY + f.press,
    kind: 'answer', what: 'Answered a question', questionId: o.answer.question.id, askedAt: o.answer.question.askedAt, answer: o.answer.yes, text: o.answer.yes ? 'yes' : 'no' }));
  const words = o.words ?? WORDS;
  const request = o.request === false || o.answer ? undefined : await f.drive.createText(changes, `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const scope = o.inbox ? 'all' : 'instructions';
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b12-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  const frames: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    calls.push(phase);
    frames.push(call.input);
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }> };
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt, wants: [] })), asks: [] });
    return reply(await intent({ request: request?.id ?? '', hunt, id: f.id, frame: call.input }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: `b12-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, frames, request: request?.id, record: request ? `press-${f.press}` : undefined };
}
/** 200 more active offers, added at once; idle runs read them in, a run that cannot read them all keeping its progress (cold-discovery-progress). */
async function grow(f: Folder, n = 200) {
  const hunt = await f.id(HUNT);
  for (let i = 1; i <= n; i++) await f.drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
  for (let runs = 0; runs < 3; runs++) if ((await press(f, () => empty, { words: 'Update these notes.' })).calls.length) return;
  throw new Error('The folder was not read within 3 runs.');
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const set = (ctx: Ctx) => ({ type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE });
const asking = (ctx: Ctx, extra: Record<string, unknown> = {}) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers', set: set(ctx), ops: [REVIEWED], question: QUESTION, ...extra }] });
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const reviewed = (run: CaseRun) => Object.entries(run.after).filter(([path, text]) => path.startsWith(`${HUNT}/`) && text.includes('review_state: reviewed\n')).map(([path]) => path);
const archived = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const bodyOf = async (init?: RequestInit) => (init?.body == null ? '' : await new Response(init.body).text());
const noModel = () => { throw new Error('A yes runs its stored part with no model call.'); };
type Op = { operationId: string; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
/** The manifest of the run's own press (the latest run folder): an earlier press's manifest stays in the folder. */
const manifestOf = (run: CaseRun): Manifest => JSON.parse(Object.entries(run.after).filter(([path]) => /\/manifest-[^/]+\.json$/.test(path))
  .sort(([a], [b]) => Number(/b12-run-(\d+)\//.exec(b)?.[1] ?? 0) - Number(/b12-run-(\d+)\//.exec(a)?.[1] ?? 0))[0]?.[1] ?? '{}') as Manifest;
const editsOf = (m: Manifest, fileId: string) => (m.operations ?? []).filter((o) => o.effect.kind === 'edit-text' && (o.effect.before as { fileId: string }).fileId === fileId);
const rowsOf = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done?: string }> }).done;
const EXISTING = { id: 'q-folder-1', text: 'Is the garden notice about the allotment?', yes: 'Yes', no: 'No', askedAt: DAY - 86_400_000 };
const LONG_SOURCE = (name: string) => offer(name).replace('---\n\n## Notes', `note: ${'x'.repeat(190)}\n`.repeat(25) + 'bower_template: source\n---\n\n## Notes');
/** A warm folder of 201 active offers (Oldwick the oldest) and the run that asks. */
async function asked(o: Press = {}, files: Record<string, string> = {}) {
  const f = await folder(files);
  await grow(f);
  const run = await press(f, (ctx) => asking(ctx), o);
  return { f, run };
}

/**
 * A warm folder of 201 active offers and a request held by its stored question, written as the asking run stores it,
 * so each answer and recovery red stands on its own finding (never on the ask).
 */
async function seeded(files: Record<string, string> = {}, part: Record<string, unknown> = {}) {
  const f = await folder(files);
  await grow(f);
  const held = await f.drive.createText(await f.id(SYSTEM.changes), 'held-1.json', JSON.stringify({ v: 1, id: 'held-1', device: 'device-1', at: DAY,
    kind: 'request', what: `Asked Bower: "${WORDS}"`, text: WORDS }));
  const members = await Promise.all(Array.from({ length: 200 }, (_, i) => f.id(offerPath(i + 1))));
  const q: Question = { id: 'q-request-held-1', text: QUESTION.text, yes: QUESTION.yes, no: QUESTION.no, askedAt: DAY,
    request: { id: 'held-1', title: 'Review offers', set: { type: 'offer', folderId: await f.id(HUNT), recursive: false, where: ACTIVE }, ops: [REVIEWED], members, total: 201, ...part } };
  const body = `${JSON.stringify({ v: 1, questions: [q] }, null, 2)}\n`;
  const there = (await f.drive.listAll(f.root)).find((x) => f.drive.pathOf(x.id, f.root) === SYSTEM.questions);
  if (there) await f.drive.writeText(there.id, body, there.modifiedTime);
  else await f.drive.createText(await f.id(SYSTEM.dir), 'questions.json', body);
  return { f, q, heldId: held.id, run: { record: 'held-1' } };
}

describe('B12d a set over 200 notes asks once; a yes runs exactly its stored first part', () => {
  it('AC19 b12-large-part-asks: one question with the model\'s words; the first 200 are stored; nothing is written', async () => {
    // An open question already there is kept as read: the questions file is never rebuilt from a narrower shape (R80).
    const { f, run } = await asked({}, { [SYSTEM.questions]: JSON.stringify({ v: 1, questions: [EXISTING] }) });
    expect(questions(run)[0], 'the open question already there, whole').toEqual(EXISTING);
    const q = questions(run)[1];
    expect(q, 'one question about the request').toMatchObject({ id: `q-request-${run.record}`, text: QUESTION.text, yes: QUESTION.yes, no: QUESTION.no });
    const stored = q?.request as { id: string; title: string; members: string[]; total: number } | undefined;
    expect(stored?.id).toBe(run.record);
    expect(stored?.total).toBe(201);
    expect(stored?.members, 'the first 200, newest created first, then by path').toHaveLength(200);
    expect(stored?.members[0]).toBe(await f.id(offerPath(1)));
    expect(stored?.members).not.toContain(await f.id(OLD));
    expect(reviewed(run), 'no member is written before the yes').toEqual([]);
    expect(Object.keys(run.after).some((p) => p.includes('/Request - ')), 'no result note').toBe(false);
    expect(archived(run, run.record ?? ''), 'the request waits for its answer').toBe(false);
    expect(phase(run)).toBe('done');
  }, 120_000);

  it('AC19 b12-large-part-other-work: the rest of the tidy-up runs while the request waits', async () => {
    const f = await folder();
    await grow(f);
    // The reply files the notice and maps the request, as the model's one reply does.
    const run = await press(f, (ctx) => {
      const piles = (JSON.parse(ctx.frame.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ fileId: string; name: string }> }> }).piles;
      const notice = piles.flatMap((p) => p.things).find((t) => t.name === 'Garden notice.txt');
      return { ...asking(ctx), things: [{ fileId: notice?.fileId, to: HUNT, name: 'Garden notice.txt',
        note: { name: 'Garden notice.md', summary: 'Alex can collect mulch at the amber gate.', body: 'Alex can collect mulch at the amber gate.\n\nRelated: [[Gardening]].' } }] };
    }, { inbox: { name: 'Garden notice.txt', text: 'Alex can collect mulch at the amber gate.\n' } });
    expect(questions(run).map((q) => q.id)).toEqual([`q-request-${run.record}`]);
    expect(Object.keys(run.after).filter((p) => p.endsWith('Garden notice.txt')).map((p) => p.startsWith('Inbox/')), 'the notice is filed, out of the inbox').toEqual([false]);
  }, 120_000);

  it('AC19 b12-large-part-held: while its question is open the request is not shown again and asked once', async () => {
    const { f, run } = await asked();
    const later = await press(f, () => empty, { words: 'Update these notes.' });
    expect(later.frames.join('\n'), 'the waiting request is not in the model\'s input').not.toContain(WORDS);
    expect(questions(later).map((q) => q.id)).toEqual([`q-request-${run.record}`]);
    expect(questions(later), 'the same asking, its frozen part whole (compared as values)').toEqual(questions(run));
    expect(archived(later, run.record ?? '')).toBe(false);
    expect(reviewed(later)).toEqual([]);
  }, 120_000);

  it('AC20 b12-large-part-yes: a yes writes exactly the stored 200 with no model call; a later arrival is not added; the result says one was not included', async () => {
    // Another note named Oldwick offer: the result note links the member by its place (R72).
    const twin = '---\nby: bower\ntype: concept\nsummary: Another Oldwick note.\n---\n\n## Notes\nNot the offer.\n';
    const { f, run, q } = await seeded({ 'Areas/Career/Oldwick offer.md': twin });
    await f.drive.createText(await f.id(HUNT), 'Latewick offer.md', offer('Latewick', '2026-10-07'));
    const yes = await press(f, noModel, { answer: { question: q, yes: true } });
    expect(yes.calls, 'no model call').toEqual([]);
    expect(reviewed(yes), 'exactly the stored 200').toHaveLength(200);
    expect(yes.after[OLD], 'the oldest was not in the part').toBe(offer('Oldwick', '2026-09-01'));
    expect(yes.after[LATE], 'a later arrival is not in the answer').toBe(offer('Latewick', '2026-10-07'));
    for (const line of ['Done: 200', 'Not included: 1', '- [[Projects/Job hunt/Oldwick offer]]: not included in this part']) expect(yes.after[NOTE] ?? '', line).toContain(`${line}\n`);
    expect(yes.after['Areas/Career/Oldwick offer.md']).toBe(twin);
    expect(yes.after[NOTE]).not.toContain('Latewick');
    expect(questions(yes), 'the question is settled').toEqual([]);
    expect(archived(yes, run.record ?? ''), 'the request is done').toBe(true);
    const rows = (JSON.parse(yes.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done?: string }> }).done;
    expect(rows.find((r) => r.id === run.record)?.done).toBe(REQUEST_DONE);
    expect(phase(yes)).toBe('done');
  }, 120_000);

  it('AC20 b12-large-part-yes-revalidated: at the yes, a member binned or no longer Bower\'s is not written; the rest are', async () => {
    const { f, run, q } = await seeded();
    const gone = await f.id(offerPath(2));
    await f.drive.trash(gone);
    const mine = await f.id(offerPath(3));
    await f.drive.writeText(mine, offer('Offer 3', '2026-10-01', false), (await f.drive.get(mine)).modifiedTime);
    // Now a Source, its marker past the 4,096-byte prefix: the yes reads each member whole, never the prefix or cached evidence.
    const sourced = await f.id(offerPath(4));
    await f.drive.writeText(sourced, LONG_SOURCE('Offer 4'), (await f.drive.get(sourced)).modifiedTime);
    const yes = await press(f, noModel, { answer: { question: q, yes: true } });
    expect(yes.after[offerPath(3)], 'now the person\'s note: unchanged').toBe(offer('Offer 3', '2026-10-01', false));
    expect(yes.after[offerPath(4)], 'a Source: unchanged').toBe(LONG_SOURCE('Offer 4'));
    expect(reviewed(yes)).toHaveLength(197);
    expect(yes.after[NOTE] ?? '').toContain('- [[Offer 003]]: unavailable, Bower changes details only on its own notes\n');
    expect(yes.after[NOTE] ?? '').toContain('- [[Offer 004]]: unavailable, Bower changes details only on its own notes\n');
    expect(yes.after[NOTE] ?? '').toContain('Done: 197\n');
    expect(archived(yes, run.record ?? '')).toBe(true);
  }, 120_000);

  it('AC21 b12-large-part-no: a no writes nothing, settles the request without saying done, and leaves no result note', async () => {
    const { f, run, q } = await seeded();
    const no = await press(f, () => empty, { answer: { question: q, yes: false } });
    expect(questions(no)).toEqual([]);
    expect(archived(no, run.record ?? ''), 'the request is settled').toBe(true);
    const row = (JSON.parse(no.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done?: string }> }).done.find((r) => r.id === run.record);
    expect(row?.done, 'a row that does not say done').toEqual(expect.any(String));
    expect(row?.done).not.toBe(REQUEST_DONE);
    expect(reviewed(no)).toEqual([]);
    expect(Object.keys(no.after).some((p) => p.includes('/Request - '))).toBe(false);
  }, 120_000);

  it('AC20 b12-large-part-yes-person-edit: a member the person edits during the yes run keeps the edit; the answer waits and the next run completes the part', async () => {
    const { f, run, q } = await seeded();
    const target = await f.id(offerPath(5));
    let edited = false;
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      if (!edited && init?.method === 'PATCH' && url(input).pathname.startsWith('/upload/drive/v3/files/')) {
        edited = true;
        await f.drive.writeText(target, `${offer('Offer 5')}Alex added this line during the run.\n`, (await f.drive.get(target)).modifiedTime);
      }
      return next(input, init);
    } });
    expect(edited).toBe(true);
    expect(yes.after[offerPath(5)]).toBe(`${offer('Offer 5')}Alex added this line during the run.\n`);
    expect(archived(yes, run.record ?? ''), 'the request waits').toBe(false);
    const next = await press(f, noModel, { request: false });
    expect(next.calls, 'the part completes with no model call').toEqual([]);
    expect(next.after[offerPath(5)]).toContain('Alex added this line during the run.\n');
    expect(next.after[offerPath(5)]).toContain('review_state: reviewed\n');
    expect(reviewed(next)).toHaveLength(200);
    expect(archived(next, run.record ?? '')).toBe(true);
  }, 120_000);

  it('AC20 b12-large-part-ask-ack-lost: a lost answer after the question is written completes once on redispatch, with no model call', async () => {
    const f = await folder();
    await grow(f);
    const questionsId = await f.id(SYSTEM.questions).catch(() => '');
    let crashed = false;
    const first = await press(f, (ctx) => asking(ctx), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      const path = url(input).pathname;
      if ((path === `/upload/drive/v3/files/${questionsId}` || path === '/upload/drive/v3/files') && (await bodyOf(init)).includes('"q-request-')) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the question.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main wrote the question').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(questions(resumed).map((q) => q.id)).toEqual([`q-request-${first.record}`]);
  }, 120_000);

  it('AC20 b12-large-part-yes-crash-before-write: a crash before a yes write is sent completes the part once on redispatch', async () => {
    const { f, run, q } = await seeded();
    const target = await f.id(offerPath(7));
    const state = { reached: false };
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${target}`) {
        state.reached = true;
        throw new TypeError('Made-up crash before the write.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the write').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, yes, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(reviewed(resumed)).toHaveLength(200);
    expect(archived(resumed, run.record ?? '')).toBe(true);
  }, 120_000);

  it('AC20 b12-large-part-yes-manifest: the yes run\'s edits cite the yes answer; each other record, resealed alone, is refused', async () => {
    const { f, run, q } = await seeded();
    // An admitted record that is not this request's yes: the authority rule, not journal membership, must refuse it.
    await f.drive.createText(await f.id(SYSTEM.changes), 'rule-1.json', JSON.stringify({ v: 1, id: 'rule-1', device: 'device-1', at: DAY,
      kind: 'rule', what: 'A rule', text: 'Keep offers in Job hunt.' }));
    const yes = await press(f, noModel, { answer: { question: q, yes: true } });
    const stored = manifestOf(yes);
    const memberId = await f.id(offerPath(1));
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const changes = (editsOf(stored, memberId)[0]?.effect.changes ?? []) as Array<{ kind: string; recordIds: string[] }>;
    expect(changes.map((c) => [c.kind, c.recordIds]), 'one property-set change citing the answer (R22)').toEqual([['property-set', [`answer-${f.press}`]]]);
    expect(await ok(stored)).toBe(true);
    expect(await ok(await resealed(stored, memberId, () => undefined)), 'the reseal itself keeps it valid').toBe(true);
    const records = (ids: string[]) => (e: Record<string, unknown>) => { for (const c of e.changes as Array<Record<string, unknown>>) c.recordIds = ids; };
    expect(await ok(await resealed(stored, memberId, records(['not-a-record']))), 'a record outside this run').toBe(false);
    expect(await ok(await resealed(stored, memberId, records([run.record ?? '']))), 'the held request alone, without its yes').toBe(false);
    expect(JSON.stringify(stored.capture ?? {}), 'the rule record was admitted in this run').toContain('"rule-1"');
    expect(await ok(await resealed(stored, memberId, records(['rule-1']))), 'an admitted record that is not the yes').toBe(false);
    expect(await ok(await resealed(stored, memberId, records([]))), 'no record').toBe(false);
  }, 120_000);

  it('AC20 b12-large-part-yes-ack-lost: a lost answer after the yes run\'s questions write completes once on redispatch: one requests row, the question gone', async () => {
    const { f, run, q } = await seeded();
    const questionsId = await f.id(SYSTEM.questions);
    let crashed = false;
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${questionsId}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the questions write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main wrote the questions file').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, yes, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(reviewed(resumed)).toHaveLength(200);
    expect(questions(resumed)).toEqual([]);
    expect(rowsOf(resumed).filter((r) => r.id === run.record), 'one requests row').toHaveLength(1);
    expect(Object.keys(resumed.after).filter((p) => /\/Request - [^/]*\.md$/.test(p)), 'one result note').toEqual([NOTE]);
  }, 120_000);

  it('AC20 b12-large-part-yes-left-set: at the yes, a member that no longer matches the set, or has left its folder, is not written', async () => {
    const { f, q, run } = await seeded();
    const closed = await f.id(offerPath(8));
    await f.drive.writeText(closed, offer('Offer 8').replace('status: active', 'status: closed'), (await f.drive.get(closed)).modifiedTime);
    const away = await f.id(offerPath(9));
    await f.drive.update(away, { addParent: await f.id('Resources/Gardening'), removeParent: await f.id(HUNT) });
    const yes = await press(f, noModel, { answer: { question: q, yes: true } });
    expect(yes.after[offerPath(8)], 'no longer matches: unchanged').toBe(offer('Offer 8').replace('status: active', 'status: closed'));
    expect(yes.after['Resources/Gardening/Offer 009.md'], 'left the folder: unchanged').toBe(offer('Offer 9'));
    expect(reviewed(yes)).toHaveLength(198);
    for (const line of ['Done: 198', 'Not included: 3', '- [[Offer 008]]: not included in this part', '- [[Offer 009]]: not included in this part'])
      expect(yes.after[NOTE] ?? '', line).toContain(`${line}\n`);
    expect(archived(yes, run.record)).toBe(true);
  }, 120_000);

  it('AC20 b12-large-part-malformed-part: a stored part that fails the contract authorizes no write; the request stays pending and is asked again', async () => {
    // The person's edit leaves the stored total below its members: the questions file is unreadable (R87).
    const { f, q, heldId, run } = await seeded({}, { total: 199 });
    const yes = await press(f, () => empty, { answer: { question: q, yes: true } });
    expect(reviewed(yes), 'no member is written').toEqual([]);
    expect(archived(yes, run.record), 'the request stays pending').toBe(false);
    // The existing stale-yes handling of an unreadable question (scripted.ts, `staleYes`): nothing applied, the details logged.
    expect(vi.mocked(console.error).mock.calls.flat().map(String).some((l) => l.includes('q-request-held-1 cannot be read')), 'its details go to the console').toBe(true);
    const again = await press(f, (ctx) => asking({ ...ctx, request: heldId }), { request: false });
    expect(questions(again).map((x) => [x.id, (x.request as { total?: number } | undefined)?.total]), 'asked again from the current set').toEqual([['q-request-held-1', 201]]);
  }, 120_000);

  it('AC20 b12-large-part-malformed-part-shrunk: with the stored part unreadable and the set down to 200, a map the model replies with writes and settles nothing in that run', async () => {
    const { f, q, heldId, run } = await seeded({}, { total: 199 });
    const old = await f.id(OLD);
    await f.drive.writeText(old, offer('Oldwick', '2026-09-01').replace('status: active', 'status: closed'), (await f.drive.get(old)).modifiedTime);
    const yes = await press(f, (ctx, attempt) => (attempt === 0 ? asking({ ...ctx, request: heldId }, { question: undefined }) : empty), { answer: { question: q, yes: true } });
    expect(reviewed(yes), 'no member is written').toEqual([]);
    expect(archived(yes, run.record), 'the request stays pending').toBe(false);
    expect(Object.keys(yes.after).some((p) => p.includes('/Request - ')), 'no result note').toBe(false);
    expect(rowsOf(yes).filter((r) => r.id === run.record), 'no requests row').toEqual([]);
  }, 120_000);

  it.each([
    ['its property is gone', { properties: {}, table: [] }],
    ['its enum no longer holds the value', { properties: { review_state: { type: 'enum', values: ['new', 'done'] } } }],
    ['its property is computed now', { views: [{ v: 1, id: 'calc', kind: 'formula', type: 'offer', outputs: [{ property: 'review_state', type: 'number', expr: { number: 1 } }] }] }],
  ])('AC20 b12-large-part-yes-type-changed: %s since the ask: no member is written, the request stays pending and is asked again (R87, R89)', async (_why, change) => {
    const { f, q, heldId, run } = await seeded();
    const tableId = await f.id(SYSTEM.typeTable);
    const write = async (row: Record<string, unknown>) => f.drive.writeText(tableId, JSON.stringify({ v: 1, rows: [{ ...TABLE.rows[0], ...row }] }, null, 2), (await f.drive.get(tableId)).modifiedTime);
    await write(change);
    const yes = await press(f, () => empty, { answer: { question: q, yes: true } });
    expect(reviewed(yes), 'no member is written').toEqual([]);
    expect(archived(yes, run.record), 'the request stays pending').toBe(false);
    expect(questions(yes), 'the yes is settled and its question gone').toEqual([]);
    expect(Object.keys(yes.after).some((p) => p.includes('/Request - ')), 'no result note').toBe(false);
    await write({});
    const again = await press(f, (ctx) => asking({ ...ctx, request: heldId }), { request: false });
    expect(questions(again).map((x) => x.id), 'asked again from the current state').toEqual(['q-request-held-1']);
  }, 120_000);

  it('AC20 b12-large-part-yes-read-failed: a member that cannot be read now stops the run without consuming the yes; the retry completes the part', async () => {
    const { f, q, run } = await seeded();
    const target = await f.id(offerPath(6));
    let failing = true;
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      const at = url(input);
      if (failing && at.pathname === `/drive/v3/files/${target}` && at.searchParams.get('alt') === 'media') return new Response('{"error":{"code":503,"message":"Made-up outage."}}', { status: 503 });
      return next(input, init);
    } });
    expect(reviewed(yes), 'nothing is written').toEqual([]);
    expect(archived(yes, run.record), 'the request waits').toBe(false);
    expect(questions(yes).map((x) => x.id), 'the yes is not consumed: its question stays').toEqual([q.id]);
    failing = false;
    const retry = await press(f, noModel, { request: false });
    expect(retry.calls, 'no model call').toEqual([]);
    expect(reviewed(retry)).toHaveLength(200);
    expect(questions(retry)).toEqual([]);
    expect(archived(retry, run.record)).toBe(true);
  }, 120_000);

  it('AC20 b12-large-part-yes-requests-refused: Drive refuses the requests write: the yes is not consumed, its question stays, and the next run reapplies it with no model call (R40)', async () => {
    const { f, run, q } = await seeded();
    const requestsId = await f.id(SYSTEM.requests);
    let refusing = true;
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      if (refusing && init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${requestsId}`) return new Response('{"error":{"code":403,"message":"Made-up refusal."}}', { status: 403 });
      return next(input, init);
    } });
    expect(archived(yes, run.record), 'the request waits').toBe(false);
    expect(archived(yes, `answer-${f.press}`), 'the yes stays unconsumed').toBe(false);
    expect(questions(yes).map((x) => x.id), 'its question stays').toEqual([q.id]);
    refusing = false;
    const next = await press(f, noModel, { request: false });
    expect(next.calls, 'reapplied with no model call').toEqual([]);
    expect(reviewed(next)).toHaveLength(200);
    expect(questions(next)).toEqual([]);
    expect(archived(next, run.record), 'the request settles').toBe(true);
    expect(archived(next, `answer-${f.press - 1}`), 'the yes is consumed').toBe(true);
    expect(rowsOf(next).filter((r) => r.id === run.record), 'one requests row').toHaveLength(1);
    expect(Object.keys(next.after).filter((p) => /\/Request - [^/]*\.md$/.test(p)), 'one result note').toEqual([NOTE]);
  }, 120_000);

  it('AC20 b12-large-part-yes-cross-wired: with two yes answers admitted, an edit citing the other request\'s yes is refused; the matching one is admitted', async () => {
    const { f, q } = await seeded();
    const hunt = await f.id(HUNT);
    const closed = [await f.drive.createText(hunt, 'Closed 1.md', offer('Closed 1').replace('status: active', 'status: closed')),
      await f.drive.createText(hunt, 'Closed 2.md', offer('Closed 2').replace('status: active', 'status: closed'))];
    await f.drive.createText(await f.id(SYSTEM.changes), 'held-2.json', JSON.stringify({ v: 1, id: 'held-2', device: 'device-1', at: DAY, kind: 'request', what: 'Asked Bower: "Mark closed offers."', text: 'Mark closed offers.' }));
    const q2: Question = { id: 'q-request-held-2', text: QUESTION.text, yes: QUESTION.yes, no: QUESTION.no, askedAt: DAY,
      request: { id: 'held-2', title: 'Review closed offers', set: { type: 'offer', folderId: hunt, recursive: false, where: { op: 'eq', property: 'status', value: 'closed' } }, ops: [REVIEWED], members: closed.map((c) => c.id), total: 2 } } as Question;
    const file = await f.id(SYSTEM.questions);
    await f.drive.writeText(file, `${JSON.stringify({ v: 1, questions: [q, q2] }, null, 2)}\n`, (await f.drive.get(file)).modifiedTime);
    await f.drive.createText(await f.id(SYSTEM.changes), 'answer-b.json', JSON.stringify({ v: 1, id: 'answer-b', device: 'device-1', at: DAY + 5, kind: 'answer', what: 'Answered a question',
      questionId: q2.id, askedAt: q2.askedAt, answer: true, text: 'yes' }));
    const yes = await press(f, noModel, { answer: { question: q, yes: true } });
    expect(reviewed(yes), '200 and the two closed offers').toHaveLength(202);
    const stored = manifestOf(yes);
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const first = await f.id(offerPath(1));
    const cites = (m: Manifest, id: string) => ((editsOf(m, id)[0]?.effect.changes ?? []) as Array<{ recordIds: string[] }>).flatMap((c) => c.recordIds);
    expect(cites(stored, first), 'each edit cites its own yes').toEqual([`answer-${f.press}`]);
    expect(cites(stored, closed[0]?.id ?? ''), 'each edit cites its own yes').toEqual(['answer-b']);
    expect(await ok(stored), 'the matching yes is admitted').toBe(true);
    const wire = (ids: string[]) => (e: Record<string, unknown>) => { for (const c of e.changes as Array<Record<string, unknown>>) c.recordIds = ids; };
    expect(await ok(await resealed(stored, first, wire(['answer-b']))), 'the other request\'s yes is refused').toBe(false);
    expect(await ok(await resealed(stored, closed[0]?.id ?? '', wire([`answer-${f.press}`]))), 'and the other way').toBe(false);
  }, 120_000);

  it('AC22 b12-large-part-public-status: a request question keeps its stored part through the status projection; its yes starts the stored instructions', async () => {
    const posts: Array<{ questions?: Question[] }> = [];
    const status = new RunnerStatus({ api: 'https://api.example.com', runId: 'run-1', ticket: 'made-up-ticket', attempt: 1, pacing: { baseMs: 0, sleep: async () => {} },
      fetch: async (_url, init) => { posts.push(JSON.parse(String(init?.body ?? '{}')) as { questions?: Question[] }); return new Response('{}', { status: 200 }); } });
    const stored = { id: 'q-request-held-1', text: QUESTION.text, yes: QUESTION.yes, no: QUESTION.no, askedAt: DAY,
      request: { id: 'held-1', title: 'Review offers', set: { type: 'offer', folderId: 'folder-1', recursive: false, where: ACTIVE }, ops: [REVIEWED], members: ['file-1', 'file-2'], total: 201 } } as unknown as Question;
    await status.publishQuestions([stored]);
    const card = posts.at(-1)?.questions?.[0];
    expect(card, 'published, never omitted').toEqual(stored);
    if (!card) return;
    expect(subjectOf(card)).toEqual({ kind: 'request', id: 'held-1' });
    expect(answerRun(card, true), 'its yes starts the stored instructions').toEqual({ scope: 'instructions' });
  });

  it('AC22 b12-large-part-two-large: two large requests in one run share the ten-question bound: the older asks, the younger waits unasked', async () => {
    const open = Array.from({ length: 9 }, (_, i) => ({ id: `q-folder-${i}`, text: `Made-up question ${i}?`, yes: 'Yes', no: 'No', askedAt: DAY - 86_400_000 + i }));
    const f = await folder({ [SYSTEM.questions]: JSON.stringify({ v: 1, questions: open }) });
    await grow(f);
    const older = await f.drive.createText(await f.id(SYSTEM.changes), 'other-1.json', JSON.stringify({ v: 1, id: 'other-1', device: 'device-1', at: DAY - 1,
      kind: 'request', what: `Asked Bower: "${WORDS}"`, text: WORDS }));
    const run = await press(f, (ctx) => ({ ...empty, maps: [{ ...asking(ctx).maps[0], title: 'Review offers again' }, asking({ ...ctx, request: older.id }).maps[0]] }),
      { words: 'Mark every active offer in Job hunt as reviewed again; ask me first.' });
    expect(questions(run).map((q) => q.id), 'one more question fits: the older request\'s').toEqual([...open.map((q) => q.id), 'q-request-other-1']);
    expect(archived(run, 'other-1')).toBe(false);
    expect(archived(run, run.record ?? ''), 'the younger waits unasked').toBe(false);
    expect(reviewed(run)).toEqual([]);
  }, 120_000);

  it('AC22 b12-large-part-questions-full: with ten questions open the request waits unasked and nothing is written', async () => {
    const open = Array.from({ length: 10 }, (_, i) => ({ id: `q-folder-${i}`, text: `Made-up question ${i}?`, yes: 'Yes', no: 'No', askedAt: DAY - 86_400_000 + i }));
    const f = await folder({ [SYSTEM.questions]: JSON.stringify({ v: 1, questions: open }) });
    await grow(f);
    const run = await press(f, (ctx) => asking(ctx));
    expect(questions(run).map((q) => q.id), 'no eleventh question').toEqual(open.map((q) => q.id));
    expect(archived(run, run.record ?? ''), 'the request waits').toBe(false);
    expect(reviewed(run)).toEqual([]);
    expect(phase(run)).toBe('done');
  }, 120_000);
});

describe('B12d refusals', () => {
  it('AC24 b12-large-part-question-small: a question for a set of 200 or fewer is refused once (mapLimit); the corrected reply applies', async () => {
    const f = await folder({ [offerPath(1)]: offer('Offer 1') });
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? asking(ctx) : asking(ctx, { question: undefined }));
    expect(refusals().slice(0, 2)).toEqual(['mapLimit', 'a question for a set of 200 notes or fewer']);
    expect(reviewed(run)).toHaveLength(2);
    expect(phase(run)).toBe('done');
  });

  it.each([
    ['a move with a question', async (ctx: Ctx) => ({ ops: [{ kind: 'move', parentId: await ctx.id('Resources/Gardening') }] })],
    ['a move without a question', async (ctx: Ctx) => ({ ops: [{ kind: 'move', parentId: await ctx.id('Resources/Gardening') }], question: undefined })],
    ['results with a rename and a move', async (ctx: Ctx) => {
      const id = await ctx.id(offerPath(1));
      return { ops: undefined, question: undefined, results: [{ memberId: id, ops: [{ kind: 'rename', targetId: id, name: 'Offer one.md' },
        { kind: 'move', targetId: id, parentId: await ctx.id('Resources/Gardening') }] }] };
    }],
  ])('AC24 b12-large-part-large-move: %s for a set over 200 is refused once (mapLimit); the corrected property-only reply asks', async (_name, wrong) => {
    const f = await folder();
    await grow(f);
    const run = await press(f, async (ctx, attempt) => asking(ctx, attempt === 0 ? await wrong(ctx) : {}));
    expect(refusals().slice(0, 2), 'the move reason, never the hint to give a question').toEqual(['mapLimit',
      'a move or rename for a set over 200 notes: only properties and tags can wait for one yes, so ask for a move or rename in a set of 200 notes or fewer']);
    expect(refusals(), 'refused once').toHaveLength(2);
    expect(questions(run).map((q) => q.text), 'the property-only reply asks').toEqual([QUESTION.text]);
    expect(reviewed(run)).toEqual([]);
    expect(phase(run)).toBe('done');
  }, 120_000);

  it.each([
    ['a question of 201 characters', { ...QUESTION, text: `${'A'.repeat(200)}?` }],
    ['an answer of 41 characters', { ...QUESTION, yes: 'Y'.repeat(41) }],
    ['a question over two lines', { ...QUESTION, text: 'Start with these?\nOr not?' }],
  ])('AC24 b12-large-part-question-text: %s is refused once (askText)', async (_name, question) => {
    const f = await folder();
    await grow(f);
    const run = await press(f, async (ctx, attempt) => asking(ctx, attempt === 0 ? { question } : {}));
    expect(refusals().slice(0, 2)).toEqual(['askText', 'a question that is not one short plain line']);
    expect(questions(run).map((q) => q.text)).toEqual([QUESTION.text]);
  }, 120_000);

  it('AC24 b12-large-part-question-at-max: a question of exactly 200 characters and answers of 40 are asked as written', async () => {
    const f = await folder();
    await grow(f);
    const question = { text: `${'A'.repeat(199)}?`, yes: 'Y'.repeat(40), no: 'N'.repeat(40) };
    const run = await press(f, (ctx) => asking(ctx, { question }));
    expect(questions(run)[0]).toMatchObject(question);
  }, 120_000);
});

describe('B12d the large corpus case in the landed grammar', () => {
  it('AC23 b12-large-part-fixture-landed: c17-b12-large-first-part uses the landed grammar, its late arrival a between step', async () => {
    const id = 'c17-b12-large-first-part';
    const c = await loadCase(join(ROOT, id));
    const table = c.folder[SYSTEM.typeTable];
    expect(JSON.parse(table ?? '{}'), 'every row is a valid stored row').toEqual(readTypeTable(table ?? null).table);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ maps?: Array<Record<string, unknown>> }>;
    expect(replies[0]?.maps?.[0], 'the first reply asks with one rule for all').toMatchObject({ requestId: '$request:change-1', ops: expect.any(Array) as unknown,
      question: { text: expect.any(String) as unknown, yes: expect.any(String) as unknown, no: expect.any(String) as unknown } });
    const text = [table, JSON.stringify(replies), JSON.stringify(c.expected), JSON.stringify(c), c.rubric].join('\n');
    for (const stale of ['$set:', '"setId"', '$script:', '$question:', 'Pending B12', 'future scripts']) expect(text, `no stale specimen ${stale}`).not.toContain(stale);
    for (const hand of ['oracle.json', 'inventory.json', 'late-arrival.txt']) expect(existsSync(join(ROOT, id, hand)), `${hand} is gone`).toBe(false);
    expect(JSON.stringify(c.presses ?? []), 'the late arrival is created between presses').toContain('"kind":"create"');
  });

  it('AC23 b12-large-part-case: c17-b12-large-first-part through main asks, takes a late arrival, and its yes writes the first part; every press is scored', async () => {
    const c = await loadCase(join(ROOT, 'c17-b12-large-first-part'));
    const presses = JSON.stringify(c.presses ?? []);
    expect(presses, 'a late arrival, then a yes').toMatch(/"kind":"create"[\s\S]*"kind":"answer"[\s\S]*"yes":true/);
    expect((c.expected.runs ?? []).length, 'every press is scored').toBe((c.presses ?? []).length + 1);
    const run = await runWithClaude(c, caseReplies(c.id));
    expect(run.score).toEqual({ pass: true, unmet: [] });
  }, 240_000);
});

const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
/** The stored manifest with one file's edit changed, digests and every id sealed again in order. */
async function resealed(stored: Manifest, fileId: string, change: (e: Record<string, unknown>) => void): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const edit = editsOf(m, fileId)[0];
  if (!edit) throw new Error('The manifest has no edit of that file');
  change(edit.effect);
  edit.effect.content = raw(String(edit.effect.text));
  const renamed = new Map<string, string>();
  const swap = (id: string) => renamed.get(id) ?? id;
  for (const [ordinal, op] of m.operations.entries()) {
    op.dependsOn = op.dependsOn.map(swap);
    const parent = op.effect.parent as { createdBy?: string } | undefined;
    if (parent?.createdBy) parent.createdBy = swap(parent.createdBy);
    if (op.effect.kind === 'maintain') (op.effect.inputs as { operationIds: string[] }).operationIds = m.operations.slice(0, ordinal).map((x) => x.operationId);
    const id = (await canonical({ runId: m.runId, captureId: m.captureId, ordinal, effect: op.effect })).hash;
    renamed.set(op.operationId, id);
    op.operationId = id;
  }
  const json = JSON.stringify({ ...m, operations: undefined });
  const remapped = JSON.parse([...renamed].reduce((t, [from, to]) => t.split(from).join(to), json)) as Manifest;
  return { ...remapped, operations: m.operations };
}
