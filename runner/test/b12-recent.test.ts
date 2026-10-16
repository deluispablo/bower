/** B12e through production main: successes kept 30 days in requests.json; a new request skips what still holds (TL-P4-39 addendum 3, TL-P4-52 Q6). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { caseReplies, redispatchCase, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const DAY = Date.UTC(2026, 9, 7, 9);
const MONTH = 30 * 86_400_000;
const TOKEN = 'made-up-credential-b12';
const HUNT = 'Projects/Job hunt';
const FERRO = `${HUNT}/Ferrowick offer.md`;
const MALLO = `${HUNT}/Mallowick offer.md`;
const NOTE = `${HUNT}/Request - Review offers.md`;
const REST = `${HUNT}/Request - Review the rest.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'concept', properties: { review_state: { type: 'enum', values: ['new', 'reviewed'] } }, table: ['review_state'] }] };
const TAGS = { v: 1, tags: ['shortlist'] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const SHORTLIST = { kind: 'tag', mode: 'add', value: 'shortlist' };
const offer = (name: string, created = '2026-10-01', review = 'new') => `---\nby: bower\ntype: offer\nsummary: ${name} offers Alex remote work.\nstatus: active\n`
  + `created: ${created}\nreview_state: ${review}\n---\n\n## Notes\n${name} offers Alex remote work.\n`;

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

async function folder(files: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'b12-recent', capability: 'C05', title: 'Alex asks again', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.tags]: JSON.stringify(TAGS, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }),
      'Rules.md': '# Rules\n', [FERRO]: offer('Ferrowick', '2026-10-06'), [MALLO]: offer('Mallowick', '2026-10-06'), ...files } };
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
type Ctx = { request: string; hunt: string; id: (path: string) => Promise<string> };
const empty = { kind: 'tidy-intent', v: 1, things: [] };
type Question = { id: string; askedAt: number } & Record<string, unknown>;

type Around = (fetch: typeof globalThis.fetch) => typeof globalThis.fetch;
async function press(f: Folder, intent: (ctx: Ctx) => unknown, o: { words?: string; at?: number; answer?: { question: Question; yes: boolean }; around?: Around } = {}) {
  f.press++;
  const at = (o.at ?? DAY) + f.press;
  vi.setSystemTime(at);
  const changes = await f.id(SYSTEM.changes);
  if (o.answer) await f.drive.createText(changes, `answer-${f.press}.json`, JSON.stringify({ v: 1, id: `answer-${f.press}`, device: 'device-1', at,
    kind: 'answer', what: 'Answered a question', questionId: o.answer.question.id, askedAt: o.answer.question.askedAt, answer: o.answer.yes, text: o.answer.yes ? 'yes' : 'no' }));
  const words = o.words ?? 'Mark the active offers in Job hunt as reviewed.';
  const request = o.answer ? undefined : await f.drive.createText(changes, `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => at, newId: () => `b12-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (_call, _step, _attempt, phase) => {
    calls.push(phase);
    return phase === 'selection' ? reply({ items: [], asks: [] }) : reply(await intent({ request: request?.id ?? '', hunt, id: f.id }));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, ...(o.around ? { around: o.around } : {}), pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: `b12-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN } }, f.press);
  return { ...run, calls, at, record: request ? `press-${f.press}` : undefined };
}
const set = (ctx: Ctx) => ({ type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE });
const opsMap = (ctx: Ctx, ops: unknown[], title = 'Review offers', extra: Record<string, unknown> = {}) => ({ ...empty, maps: [{ requestId: ctx.request, title, set: set(ctx), ops, ...extra }] });
type Recent = { key: string; at: number };
const recent = (run: CaseRun): Recent[] => (JSON.parse(run.after[SYSTEM.requests] ?? '{}') as { recent?: Recent[] }).recent ?? [];
/** The key in the form the plan records: target-qualified ops (a move through its destination), whichever form the reply used. */
const keyOf = async (memberId: string, ops: unknown[], move?: unknown) => (await canonical(move ? [memberId, ops, move] : [memberId, ops])).hash.slice(0, 16);
const reviewedOn = (id: string) => ({ targetId: id, key: 'review_state', mode: 'set', value: 'reviewed' });
type Op = { effect: Record<string, unknown> & { kind: string } };
/** The run's own manifest by its run id: an earlier press's manifest stays in its run folder (as b12-set-properties.test.ts does). */
const manifestOf = (run: CaseRun): { operations?: Op[] } => JSON.parse(Object.entries(run.after)
  .find(([path]) => path.includes(`/${run.dispatch?.runId ?? 'no-run'}/`) && /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as { operations?: Op[] };
const memberEdits = (run: CaseRun) => (manifestOf(run).operations ?? []).filter((o) => o.effect.kind === 'edit-text' && String(o.effect.path).startsWith(`${HUNT}/`));
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;

const MOC = '---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: Job hunt reference notes.\n---\n'
  + ['current', 'personal', 'timeline', 'bower-note', 'moc-overview', 'moc-figures', 'moc-members']
    .map((r) => `<!-- bower:ownership/2 begin ${r} -->\n${r === 'moc-figures' ? '## Figures\n' : r === 'moc-members' ? '## Notes\n' : ''}<!-- bower:ownership/2 end ${r} -->\n`).join('');
/** A request that settles with no map: it installs a figure in the Bower map (B11), so requests.json is written. `recent` is as stored. */
async function withoutMap(stored: unknown) {
  const f = await folder({ [SYSTEM.requests]: JSON.stringify({ v: 1, done: [], recent: stored }), [`${HUNT}/Job hunt.md`]: MOC });
  return press(f, async (ctx) => ({ ...empty, views: [{ requestId: ctx.request, home: { kind: 'moc', fileId: await ctx.id(`${HUNT}/Job hunt.md`) }, mode: 'install',
    definition: { v: 1, id: 'offers', kind: 'aggregate', title: 'Offers', set: { type: 'offer', folderId: ctx.hunt, recursive: true }, groupBy: [],
      measures: [{ id: 'n', label: 'Offers', op: 'count' }] } }] }), { words: 'Show how many offers there are in the Job hunt map.' });
}

describe('B12e successes kept 30 days, skipped while they hold', () => {
  it('AC25 b12-recent-recorded: each done member of a settled request leaves one compact row: its key and the admission time', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(recent(run).sort((a, b) => a.key < b.key ? -1 : 1)).toEqual((await Promise.all([FERRO, MALLO].map(async (path) => ({ key: await keyOf(await f.id(path), [reviewedOn(await f.id(path))]), at: run.at }))))
      .sort((a, b) => a.key < b.key ? -1 : 1));
    expect((JSON.parse(run.after[SYSTEM.requests] ?? '{}') as { done: Array<{ id: string }> }).done.map((r) => r.id), 'the done rows are as before').toEqual(['press-1']);
  });

  it('AC26 b12-recent-skip: the same change asked again skips the members it still holds for; the result note counts them', async () => {
    const f = await folder();
    await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const again = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'));
    expect(memberEdits(again), 'no member is written again').toEqual([]);
    for (const line of ['Done: 0', 'Skipped from recent results: 2']) expect(again.after[REST] ?? '', line).toContain(`${line}\n`);
  });

  it('AC26 b12-recent-key-order: the same ops with their keys in another order are the same change (JSON values)', async () => {
    const f = await folder();
    await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const again = await press(f, (ctx) => opsMap(ctx, [{ value: 'reviewed', mode: 'set', key: 'review_state', kind: 'property' }], 'Review the rest'));
    expect(again.after[REST] ?? '').toContain('Skipped from recent results: 2\n');
  });

  it('AC26 b12-recent-array-order: ops in another order are another change; members already as asked are done with no write', async () => {
    const f = await folder();
    await press(f, (ctx) => opsMap(ctx, [REVIEWED, SHORTLIST]));
    const again = await press(f, (ctx) => opsMap(ctx, [SHORTLIST, REVIEWED], 'Review the rest'));
    expect(again.after[REST] ?? '').toContain('Skipped from recent results: 0\n');
    expect(again.after[REST] ?? '').toContain('Done: 2\n');
    expect(memberEdits(again), 'already as asked: nothing to write').toEqual([]);
  });

  it('AC26 b12-recent-changed-since: a member changed since (an edit or an Undo) no longer holds, so it is written again', async () => {
    const f = await folder();
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const ferro = await f.id(FERRO);
    await f.drive.writeText(ferro, first.after[FERRO]?.replace('review_state: reviewed', 'review_state: new') ?? '', (await f.drive.get(ferro)).modifiedTime);
    const again = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'));
    expect(again.after[FERRO]).toContain('review_state: reviewed\n');
    for (const line of ['Done: 1', 'Skipped from recent results: 1']) expect(again.after[REST] ?? '', line).toContain(`${line}\n`);
  });

  it('AC26 b12-recent-results-form: a result that matches a recent row and still holds is skipped too', async () => {
    const f = await folder();
    const results = async (ctx: Ctx) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review the rest', set: set(ctx),
      results: await Promise.all([FERRO, MALLO].map(async (path) => ({ memberId: await ctx.id(path), ops: [{ ...REVIEWED, targetId: await ctx.id(path) }] }))) }] });
    await press(f, async (ctx) => { const v = await results(ctx); v.maps[0] = { ...v.maps[0], title: 'Review offers' } as typeof v.maps[0]; return v; });
    const again = await press(f, results, { words: 'Review them again.' });
    expect(again.after[REST] ?? '').toContain('Skipped from recent results: 2\n');
  });

  it.each([[MONTH - 1, true], [MONTH, false]])('AC26 b12-recent-expiry: %i ms after a success it is skipped: %s', async (later, skipped) => {
    const f = await folder();
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    // Admission times are exact: the next press is admitted `later` after the first one's.
    const again = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'), { at: first.at + later - 2 });
    expect(again.at - first.at).toBe(later);
    expect(again.after[REST] ?? '').toContain(skipped ? 'Skipped from recent results: 2\n' : 'Skipped from recent results: 0\n');
  });

  it('AC25 b12-recent-lenient: unreadable recent rows are read as none and logged, never a refusal; the run writes good rows', async () => {
    const f = await folder({ [SYSTEM.requests]: JSON.stringify({ v: 1, done: [], recent: [{ key: 'not hex', at: 'soon' }, 7] }) });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
    expect(recent(run)).toHaveLength(2);
    expect(recent(run).every((r) => /^[a-f0-9]{16}$/.test(r.key) && r.at === run.at)).toBe(true);
    expect(vi.mocked(console.error).mock.calls.flat().map(String).some((l) => /recent/i.test(l)), 'logged').toBe(true);
  });

  it('AC25 b12-recent-bounded: expired rows go when the file is written, and at most 2,000 rows are kept, the newest', async () => {
    const old = Array.from({ length: 1999 }, (_, i) => ({ key: i.toString(16).padStart(16, '0'), at: DAY - 5000 + i }));
    const expired = { key: 'ffffffffffffffff', at: DAY - MONTH - 1 };
    const f = await folder({ [SYSTEM.requests]: JSON.stringify({ v: 1, done: [], recent: [expired, ...old] }) });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const rows = recent(run);
    expect(rows, 'at most 2,000').toHaveLength(2000);
    expect(rows.some((r) => r.key === expired.key), 'an expired row went').toBe(false);
    expect(rows.some((r) => r.key === old[0]?.key), 'the oldest went to make room').toBe(false);
    expect(rows.filter((r) => r.at === run.at)).toHaveLength(2);
  });

  it('AC25 b12-recent-untouched: a run that settles no map keeps every recent row as read, even an expired one', async () => {
    const rows = [{ key: '00000000000000aa', at: DAY - 1000 }, { key: '00000000000000bb', at: DAY - MONTH - 1 }];
    const plain = await withoutMap(rows);
    expect((JSON.parse(plain.after[SYSTEM.requests] ?? '{}') as { done: Array<{ id: string }> }).done.map((r) => r.id), 'the request row is written').toEqual(['press-1']);
    expect(recent(plain), 'the rows a map wrote are kept by every other write').toEqual(rows);
  });

  it.each([['a bad row among good ones', [{ key: '00000000000000aa', at: DAY - 1000 }, { key: 'not hex', at: 'soon' }, 7]], ['a field that is no list', { key: '00000000000000aa' }]])(
    'AC25 b12-recent-untouched-malformed: %s is copied back exactly as read by a run that settles no map', async (_name, raw) => {
      const plain = await withoutMap(raw);
      expect((JSON.parse(plain.after[SYSTEM.requests] ?? '{}') as { recent?: unknown }).recent).toEqual(raw);
      expect((JSON.parse(plain.after[SYSTEM.requests] ?? '{}') as { done: Array<{ id: string }> }).done.map((r) => r.id)).toEqual(['press-1']);
    });
});

describe('B12e now the rest', () => {
  it('AC27 b12-recent-rest: after a yes to the first 200, the rest is a new request that skips them and writes the others, with its own result note', async () => {
    const f = await folder({ [`${HUNT}/Oldwick offer.md`]: offer('Oldwick', '2026-09-01') });
    const hunt = await f.id(HUNT);
    for (let from = 1; from <= 198; from += 60) {
      for (let i = from; i < Math.min(from + 60, 199); i++) await f.drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
      if (!(await press(f, () => empty, { words: 'Update these notes.' })).calls.length) throw new Error('The folder did not grow warm.');
    }
    const question = { text: 'There are 201 active offers. Start with the 200 most recent?', yes: 'Start with these', no: 'Leave them' };
    const asked = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review offers', { question }));
    const [q] = questions(asked);
    if (!q) throw new Error('no question');
    await f.drive.createText(hunt, 'Latewick offer.md', offer('Latewick', '2026-10-07'));
    const yes = await press(f, () => { throw new Error('A yes runs with no model call.'); }, { answer: { question: q, yes: true } });
    expect(yes.after[NOTE] ?? '').toContain('Done: 200\n');
    const rest = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'), { words: 'Now do the rest.' });
    expect(questions(rest), 'no new question: 2 are left').toEqual([]);
    expect(rest.after[`${HUNT}/Oldwick offer.md`]).toContain('review_state: reviewed\n');
    expect(rest.after[`${HUNT}/Latewick offer.md`]).toContain('review_state: reviewed\n');
    for (const line of ['Done: 2', 'Skipped from recent results: 200']) expect(rest.after[REST] ?? '', line).toContain(`${line}\n`);
    expect(rest.after[NOTE], 'the first result note is not widened').toBe(yes.after[NOTE]);
  }, 120_000);

  it('AC27 b12-recent-fixture-landed: c17-b12-large-first-part\'s third press is a new request in the landed grammar', async () => {
    const replies = JSON.parse(await readFile(join(ROOT, 'c17-b12-large-first-part', 'replies.json'), 'utf8')) as Array<{ maps?: Array<Record<string, unknown>> }>;
    const last = replies.at(-1)?.maps?.[0];
    expect(last, 'one rule for all, no question').toMatchObject({ ops: expect.any(Array) as unknown });
    expect(last?.question).toBeUndefined();
    expect(String(last?.requestId)).toMatch(/^\$request:press-/);
    expect(existsSync(join(ROOT, 'c17-b12-large-first-part', 'oracle.json'))).toBe(false);
  });
});

/** Seeds requests.json as stored, once the folder's ids are known. */
async function storeRequests(f: Folder, file: Record<string, unknown>): Promise<void> {
  const id = await f.id(SYSTEM.requests);
  await f.drive.writeText(id, JSON.stringify(file), (await f.drive.get(id)).modifiedTime);
}
const resultsOf = (target: (path: string, ctx: Ctx) => Promise<string>, paths = [FERRO, MALLO], title = 'Review the rest') => async (ctx: Ctx) => ({ ...empty, maps: [{ requestId: ctx.request,
  title, set: set(ctx), results: await Promise.all(paths.map(async (path) => ({ memberId: await ctx.id(path), ops: [{ ...REVIEWED, targetId: await target(path, ctx) }] }))) }] });
const own = (path: string, ctx: Ctx) => ctx.id(path);
const flat = (run: CaseRun) => run.after[REST] ?? '';
/** The first press of a pair settles under its own title, so the second one's result note is the one read. */
const firstTitled = (intent: (ctx: Ctx) => unknown) => async (ctx: Ctx) => {
  const value = await intent(ctx) as { maps: Array<{ title: string }> };
  value.maps.forEach((m) => { m.title = 'Review offers'; });
  return value;
};

describe('B12e what a key is: the plan\'s normalized ops, a move or rename through its destination', () => {
  it.each([['one rule for all', 'a result per member'], ['a result per member', 'one rule for all']])('AC26 b12-recent-key-cross-form: %s, then %s, is one key', async (first, second) => {
    const f = await folder();
    const form = (name: string) => (name === 'one rule for all' ? (ctx: Ctx) => opsMap(ctx, [REVIEWED], 'Review the rest') : resultsOf(own));
    await press(f, firstTitled(form(first)));
    const again = await press(f, form(second));
    expect(flat(again)).toContain('Skipped from recent results: 2\n');
    expect(memberEdits(again)).toEqual([]);
  });

  describe('a move', () => {
    const ARCHIVE = `${HUNT}/Archive`;
    const LATER = `${HUNT}/Later`;
    const homes = { [`${ARCHIVE}/Keep.md`]: '# Keep\n', [`${LATER}/Keep.md`]: '# Keep\n' };
    const moveTo = (to: string) => async (ctx: Ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(to) }], 'Review the rest', { set: { ...set(ctx), recursive: true } });
    it.each([[ARCHIVE, 2, `${ARCHIVE}/Ferrowick offer.md`], [LATER, 0, `${LATER}/Ferrowick offer.md`]])('AC26 b12-recent-key-destination: the same move to %s skips %i members', async (to, skipped, landed) => {
      const f = await folder(homes);
      await press(f, firstTitled(moveTo(ARCHIVE)), { words: 'Move the active offers to Archive.' });
      const again = await press(f, moveTo(to), { words: 'Move the active offers.' });
      expect(flat(again)).toContain(`Skipped from recent results: ${skipped}\n`);
      expect(again.after[landed], 'it is where the last move asked').toBeDefined();
      if (to === LATER) expect(again.after[`${ARCHIVE}/Ferrowick offer.md`], 'and no longer in the first destination').toBeUndefined();
    });
  });

  it.each([['Ferro offer.md', 1, 'Done: 0\n'], ['Other offer.md', 0, 'Done: 1\n']])('AC26 b12-recent-key-rename: the same rename to %s skips %i members', async (name, skipped, done) => {
    const f = await folder();
    const ferro = await f.id(FERRO);
    const rename = (to: string) => async (ctx: Ctx) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review the rest', set: set(ctx),
      results: [{ memberId: ferro, ops: [{ kind: 'rename', targetId: ferro, name: to }] }] }] });
    await press(f, firstTitled(rename('Ferro offer.md')), { words: 'Rename Ferrowick.' });
    const again = await press(f, rename(name), { words: 'Rename Ferrowick again.' });
    expect(flat(again)).toContain(`Skipped from recent results: ${skipped}\n`);
    expect(flat(again)).toContain(done);
    expect(again.after[`${HUNT}/${name}`], 'it is named as the last rename asked').toBeDefined();
  });
});

describe('B12e a row is kept as it was, and a skip is counted in full', () => {
  it('AC26 b12-recent-skip-no-refresh: a skip keeps the row\'s own time, so asking again inside a month never keeps a result for ever', async () => {
    const f = await folder();
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const skipped = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'), { at: DAY + 10 * 86_400_000 });
    expect(flat(skipped)).toContain('Skipped from recent results: 2\n');
    expect(recent(skipped).map((r) => r.at), 'the rows are the first press\'s, not refreshed').toEqual([first.at, first.at]);
    const expired = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest again'), { at: first.at + MONTH + 5 * 86_400_000 });
    expect(expired.after[`${HUNT}/Request - Review the rest again.md`], 'a month after the first success, whatever was asked since').toContain('Skipped from recent results: 0\n');
    expect(expired.after[`${HUNT}/Request - Review the rest again.md`]).toContain('Done: 2\n');
    expect(recent(expired).map((r) => r.at), 'the expired rows went, two new ones came').toEqual([expired.at, expired.at]);
  });

  it('AC26 b12-recent-reapplied: a later success of the same key is a new row beside the old one, and a member that holds is still skipped', async () => {
    const f = await folder();
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const ferro = await f.id(FERRO);
    await f.drive.writeText(ferro, first.after[FERRO]?.replace('review_state: reviewed', 'review_state: new') ?? '', (await f.drive.get(ferro)).modifiedTime);
    const again = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'), { at: DAY + 1000 });
    expect(flat(again)).toContain('Skipped from recent results: 1\n');
    const key = await keyOf(ferro, [reviewedOn(ferro)]);
    expect(recent(again).filter((r) => r.key === key).map((r) => r.at).sort(), 'one row per success').toEqual([first.at, again.at]);
    expect(recent(again), 'the skipped member got none').toHaveLength(3);
  });

  it('AC26 b12-recent-all-skipped: a request whose members are all skipped still settles with a result note that accounts for them, with no member lines', async () => {
    const f = await folder();
    await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const again = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'));
    expect(flat(again)).toMatch(/Done: 0\nUnavailable: 0\nSkipped from recent results: 2\n\n?/);
    expect(flat(again), 'a skipped member has no line of its own').not.toMatch(/^- /m);
    expect(Object.keys(again.after).some((path) => path.startsWith(`${SYSTEM.changes}/`) && !path.startsWith(`${SYSTEM.archive}/`)), 'the request is settled').toBe(false);
  });

  it('AC26 b12-recent-shared-target: a result whose own note is unchanged still holds only while the note it changes does', async () => {
    const f = await folder();
    const mallo = await f.id(MALLO);
    const onMallo = resultsOf(async () => mallo, [FERRO]);
    const first = await press(f, firstTitled(onMallo));
    expect(first.after[FERRO], 'the member itself is not what changes').toContain('review_state: new\n');
    const skipped = await press(f, onMallo, { at: DAY + 1000 });
    expect(flat(skipped), 'the shared note still has it').toContain('Skipped from recent results: 1\n');
    await f.drive.writeText(mallo, skipped.after[MALLO]?.replace('review_state: reviewed', 'review_state: new') ?? '', (await f.drive.get(mallo)).modifiedTime);
    const again = await press(f, resultsOf(async () => mallo, [FERRO], 'Review once more'), { at: DAY + 2000 });
    expect(again.after[`${HUNT}/Request - Review once more.md`],'the shared note was undone: the result is written again').toContain('Skipped from recent results: 0\n');
    expect(again.after[MALLO]).toContain('review_state: reviewed\n');
    expect(again.after[FERRO], 'its own note is still as it was').toContain('review_state: new\n');
  });
});

describe('B12e unreadable rows', () => {
  it('AC25 b12-recent-mixed: a bad row is dropped and the good rows still skip; done rows are kept', async () => {
    const f = await folder({ [FERRO]: offer('Ferrowick', '2026-10-06', 'reviewed') });
    const ferro = await f.id(FERRO);
    await storeRequests(f, { v: 1, done: [{ id: 'older', text: 'Earlier', at: DAY - 5000, done: 'done' }],
      recent: [{ key: await keyOf(ferro, [reviewedOn(ferro)]), at: DAY - 1000 }, { key: 'zz', at: 1 }, 7] });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    for (const line of ['Done: 1', 'Skipped from recent results: 1']) expect(run.after[NOTE] ?? '', line).toContain(`${line}\n`);
    expect(run.after[MALLO]).toContain('review_state: reviewed\n');
    expect(recent(run).map((r) => r.at).sort(), 'the good row and the new one').toEqual([DAY - 1000, run.at]);
    expect((JSON.parse(run.after[SYSTEM.requests] ?? '{}') as { done: Array<{ id: string }> }).done.map((r) => r.id).sort()).toEqual(['older', 'press-1']);
    expect(vi.mocked(console.error).mock.calls.flat().map(String).some((l) => /recent/i.test(l)), 'logged').toBe(true);
  });

  it('AC25 b12-recent-no-list: a recent that is no list is read as none, logged, and the run still works', async () => {
    const f = await folder();
    await storeRequests(f, { v: 1, done: [{ id: 'older', text: 'Earlier', at: DAY - 5000, done: 'done' }], recent: { key: 'x' } });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
    expect(recent(run)).toHaveLength(2);
    expect((JSON.parse(run.after[SYSTEM.requests] ?? '{}') as { done: Array<{ id: string }> }).done.map((r) => r.id).sort()).toEqual(['older', 'press-1']);
    expect(vi.mocked(console.error).mock.calls.flat().map(String).some((l) => /recent/i.test(l)), 'logged').toBe(true);
  });
});

describe('B12e rows survive an interrupted write', () => {
  const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  it('AC25 b12-recent-lost-ack: a lost answer after a member write completes once on redispatch: one row per success at the admission time, then a skip', async () => {
    const f = await folder();
    const ferro = await f.id(FERRO);
    let crashed = false;
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ferro}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main reached the member write').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    vi.setSystemTime(DAY + 5000);
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(model).not.toHaveBeenCalled();
    expect(resumed.after[FERRO]).toContain('review_state: reviewed\n');
    expect(recent(resumed).map((r) => r.at), 'one row per success, at the first admission').toEqual([first.at, first.at]);
    expect(new Set(recent(resumed).map((r) => r.key)).size).toBe(2);
    const later = await press(f, (ctx) => opsMap(ctx, [REVIEWED], 'Review the rest'), { at: DAY + 10_000 });
    expect(flat(later)).toContain('Skipped from recent results: 2\n');
  });
});

describe('B12e the large case runs to its fourth press', () => {
  it('AC27 b12-recent-fixture-executed: c17-b12-large-first-part\'s follow-up press runs, writes the notes left, and leaves the first result note as it was', async () => {
    const c = await loadCase(join(ROOT, 'c17-b12-large-first-part'));
    expect(c.presses?.length, 'the follow-up is a fourth run').toBe(3);
    const run = await runWithClaude(c, caseReplies(c.id));
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(run.runs?.length, 'three runs before the last').toBe(3);
    const first = run.after['Resources/Reading/Request - Review Reading.md'] ?? '';
    for (const line of ['Done: 200', 'Skipped from recent results: 0', 'Not included: 1']) expect(first, line).toContain(`${line}\n`);
    const rest = run.after['Resources/Reading/Request - Review the rest.md'] ?? '';
    for (const line of ['Done: 2', 'Skipped from recent results: 200']) expect(rest, line).toContain(`${line}\n`);
    for (const path of ['Reading 201', 'Late reading']) expect(run.after[`Resources/Reading/${path}.md`], path).toContain('review_state: reviewed\n');
  }, 600_000);
});
