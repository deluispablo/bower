/** B12d settlement: a stored request question holds its request by the question's identity; its yes closes only once the request is archived (R87, R40). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-b12-settle';
const HUNT = 'Projects/Job hunt';
const OLD = `${HUNT}/Oldwick offer.md`;
const NOTE = `${HUNT}/Request - Review offers.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'concept', properties: { review_state: { type: 'enum', values: ['new', 'reviewed'] } }, table: ['review_state'] }] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const QUESTION = { text: 'There are 201 active offers. Start with the 200 most recent?', yes: 'Start with these', no: 'Leave them' };
const WORDS = 'Mark every active offer in Job hunt as reviewed; ask me first if there are many.';
const offer = (name: string, created = '2026-10-01') => `---\nby: bower\ntype: offer\nsummary: ${name} offers Alex remote work.\nstatus: active\n`
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

type Question = { id: string; askedAt: number; text: string; yes: string; no: string } & Record<string, unknown>;
type Ctx = { request: string; hunt: string };
type Press = { request?: false; answer?: { question: Question; yes: boolean }; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch };
const empty = { kind: 'tidy-intent', v: 1, things: [] };

/** The made-up folder of b12-large-part.test.ts: Gardening, a type table for offers and Oldwick, the oldest offer. */
async function folder() {
  const c: LoadedCase = { id: 'b12-large-part-settle', capability: 'C05', title: 'Alex maps a large set', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n',
      'Resources/Gardening/Gardening.md': '---\nby: bower\ntype: moc\nsummary: Gardening notes.\n---\n\n## Notes\nGardening.\n', [OLD]: offer('Oldwick', '2026-09-01') } };
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

/** One press through production main, as b12-large-part.test.ts presses. */
async function press(f: Folder, intent: (ctx: Ctx, attempt: number) => unknown, o: Press = {}) {
  f.press++;
  const changes = await f.id(SYSTEM.changes);
  if (o.answer) await f.drive.createText(changes, `answer-${f.press}.json`, JSON.stringify({ v: 1, id: `answer-${f.press}`, device: 'device-1', at: DAY + f.press,
    kind: 'answer', what: 'Answered a question', questionId: o.answer.question.id, askedAt: o.answer.question.askedAt, answer: o.answer.yes, text: o.answer.yes ? 'yes' : 'no' }));
  const words = 'Update these notes.';
  const request = o.request === false || o.answer ? undefined : await f.drive.createText(changes, `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + f.press, newId: () => `b12s-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    calls.push(phase);
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }> };
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt, wants: [] })), asks: [] });
    return reply(await intent({ request: request?.id ?? '', hunt }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: `b12s-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls };
}

/** 200 more active offers; idle runs read them in (b12-large-part.test.ts `grow`). */
async function grow(f: Folder) {
  const hunt = await f.id(HUNT);
  for (let i = 1; i <= 200; i++) await f.drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
  for (let runs = 0; runs < 3; runs++) if ((await press(f, () => empty)).calls.length) return;
  throw new Error('The folder was not read within 3 runs.');
}

/** A warm folder of 201 active offers and request held-1 held by its stored question, written as the asking run stores it; `part` overrides the stored part. */
async function seeded(part: Record<string, unknown> = {}) {
  const f = await folder();
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
  return { f, q, heldId: held.id };
}

const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const reviewed = (run: CaseRun) => Object.entries(run.after).filter(([path, text]) => path.startsWith(`${HUNT}/`) && text.includes('review_state: reviewed\n')).map(([path]) => path);
const archived = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
const rowsOf = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string }> }).done;
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const noModel = () => { throw new Error('A yes runs its stored part with no model call.'); };
const asking = (ctx: Ctx, extra: Record<string, unknown> = {}) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers',
  set: { type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE }, ops: [REVIEWED], question: QUESTION, ...extra }] });

describe('B12d settlement keeps the person\'s consent', () => {
  it('AC1 altered question keeps the hold', async () => {
    // Alex's edit changes the stored request id but keeps the question's own id: the question still names held-1 (R87).
    const { f, heldId } = await seeded({ id: 'held-altered' });
    const old = await f.id(OLD);
    await f.drive.writeText(old, offer('Oldwick', '2026-09-01').replace('status: active', 'status: closed'), (await f.drive.get(old)).modifiedTime);
    // The set is down to 200: a fresh map with no question could write it all, were the request the model's again.
    const run = await press(f, (ctx, attempt) => (attempt === 0 ? asking({ ...ctx, request: heldId }, { question: undefined }) : empty), { request: false });
    expect(reviewed(run), 'the held request is not released: no member is written').toEqual([]);
    expect(archived(run, 'held-1'), 'the request stays pending').toBe(false);
    expect(rowsOf(run).filter((r) => r.id === 'held-1'), 'no requests row').toEqual([]);
  }, 120_000);

  it('AC2 refused archive keeps the question open', async () => {
    const { f, q, heldId } = await seeded();
    let moves = 0;
    const yes = await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      const at = url(input);
      if (init?.method === 'PATCH' && at.pathname === `/drive/v3/files/${heldId}` && at.searchParams.has('addParents')) {
        moves++;
        return new Response('{"error":{"code":403,"message":"Made-up refusal."}}', { status: 403 });
      }
      return next(input, init);
    } });
    expect(moves, 'the request\'s archive move was tried and refused').toBeGreaterThan(0);
    expect(reviewed(yes), 'the writes succeeded').toHaveLength(200);
    expect(archived(yes, 'held-1'), 'the request stays pending').toBe(false);
    expect(questions(yes).map((x) => x.id), 'its question stays open').toEqual([q.id]);
    expect(archived(yes, `answer-${f.press}`), 'the yes is not archived').toBe(false);
  }, 120_000);

  it('AC3 retry closes on the next run', async () => {
    const { f, q, heldId } = await seeded();
    let refusing = true;
    await press(f, noModel, { answer: { question: q, yes: true }, around: (next) => async (input, init) => {
      const at = url(input);
      if (refusing && init?.method === 'PATCH' && at.pathname === `/drive/v3/files/${heldId}` && at.searchParams.has('addParents')) {
        return new Response('{"error":{"code":403,"message":"Made-up refusal."}}', { status: 403 });
      }
      return next(input, init);
    } });
    refusing = false;
    const next = await press(f, noModel, { request: false });
    expect(next.calls, 'the retry needs no model call').toEqual([]);
    expect(reviewed(next)).toHaveLength(200);
    expect(archived(next, 'held-1'), 'the request is archived').toBe(true);
    expect(questions(next), 'only then the question closes').toEqual([]);
    expect(archived(next, `answer-${f.press - 1}`), 'and the yes is archived').toBe(true);
    expect(rowsOf(next).filter((r) => r.id === 'held-1'), 'one requests row').toHaveLength(1);
    expect(Object.keys(next.after).filter((p) => /\/Request - [^/]*\.md$/.test(p)), 'one result note').toEqual([NOTE]);
  }, 120_000);
});
