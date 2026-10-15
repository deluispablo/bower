/** B12a through production main: a person's request sets a property or a tag on each note of a script-bound set (TL-P4-52 Q1, Q3-Q5). */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { frontValues, propertyValue, readTypeTable } from '../../src/data/contracts/note-format';
import { viewFault } from '../../src/data/contracts/view-format';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { REQUEST_DONE } from '../../src/data/spine/scripted';
import { canonical } from '../../src/data/spine/records';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-b12';
const HUNT = 'Projects/Job hunt';
const PROFILE = 'Areas/Career/Career profile.md';
const FERRO = `${HUNT}/Ferrowick offer.md`;
const MALLO = `${HUNT}/Mallowick offer.md`;
const PAST = `${HUNT}/Past offer.md`;
const ROW = { id: 'offer', match: ['job offer'], template: 'concept', properties: { skills: { type: 'list' }, review_state: { type: 'enum', values: ['new', 'reviewed'] },
  level: { type: 'enum', values: ['junior', 'senior'] }, note: { type: 'text' } }, table: ['skills', 'review_state'] };
const PROFILE_ROW = { id: 'career-profile', match: ['career profile'], template: 'concept', properties: { skills: { type: 'list' }, focus: { type: 'text' } }, table: ['skills'] };
const TABLE = { v: 1, rows: [ROW, PROFILE_ROW] };
const TAGS = { v: 1, tags: ['career', 'shortlist', 'remote', 'gardening'] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
/** Text and enum values the one scalar writer quotes (a colon, quotes, edge spaces, a date, a YAML boolean). */
const QUOTED: Array<[string, string]> = [['q1', 'C: senior'], ['q2', 'Alex\'s "remote" plan'], ['q3', ' padded '], ['q4', '2026-10-07'], ['answer', 'yes']];
const QUOTED_TABLE = { v: 1, rows: [{ ...ROW, properties: { ...ROW.properties, q1: { type: 'text' }, q2: { type: 'text' }, q3: { type: 'text' }, q4: { type: 'text' },
  answer: { type: 'enum', values: ['yes', 'no'] } } }, PROFILE_ROW] };
const QUOTED_ROW = () => {
  const row = readTypeTable(JSON.stringify(QUOTED_TABLE)).table.rows[0];
  if (!row) throw new Error('The made-up table has no offer row');
  return row;
};

type Offer = { status?: string; created?: string; skills?: string; review?: string; tags?: string; by?: boolean; extra?: string; body?: string };
const offer = (name: string, o: Offer = {}) => `---\n${o.by === false ? '' : 'by: bower\n'}type: offer\nsummary: ${name} offers Alex remote work.\n`
  + `status: ${o.status ?? 'active'}\ncreated: ${o.created ?? '2026-10-01'}\n${o.skills ? `skills: ${o.skills}\n` : ''}review_state: ${o.review ?? 'new'}\n`
  + `${o.tags ? `tags: ${o.tags}\n` : ''}${o.extra ?? ''}---\n\n## Notes\n${o.body ?? `${name} offers Alex remote work.`}\nRelated: [[Career profile]].\n`;
const PROFILE_TEXT = '---\nby: bower\ntype: career-profile\nsummary: Alex keeps a list of skills.\nskills: [Python]\n---\n\n## Notes\nAlex wants to keep this paragraph exactly.\n';
const OFFERS: Record<string, string> = {
  [FERRO]: offer('Ferrowick', { created: '2026-10-06', skills: '[SQL, TypeScript]' }),
  [MALLO]: offer('Mallowick', { created: '2026-10-06', skills: '[dbt, SQL]' }),
  [PAST]: offer('Past', { status: 'closed', skills: '[Rust]' }),
};

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

async function folder(files: Record<string, string> = {}, o: { table?: unknown } = {}) {
  const all: Record<string, string> = { [SYSTEM.typeTable]: JSON.stringify(o.table ?? TABLE, null, 2), [SYSTEM.tags]: JSON.stringify(TAGS, null, 2),
    [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }), 'Rules.md': '# Rules\n', [PROFILE]: PROFILE_TEXT, ...OFFERS, ...files };
  const c: LoadedCase = { id: 'b12-set-properties', capability: 'C05', title: 'Alex maps a set', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: all };
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
type Ctx = { request: string; hunt: string; id: (path: string) => Promise<string>; frame: Record<string, unknown> };
type Intent = (ctx: Ctx, attempt: number) => unknown;
const empty = { kind: 'tidy-intent', v: 1, things: [] };

/** One press through main: an explicit request, or a filing press, with the scripted model given. */
async function press(f: Folder, intent: Intent, o: { words?: string; inbox?: { name: string; text: string }; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  if (o.inbox) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'File this offer with my job hunt.\n');
    await f.drive.createText(pile.id, o.inbox.name, o.inbox.text);
  }
  const words = o.words ?? 'Mark the active offers in Job hunt as reviewed.';
  const request = o.inbox ? undefined : await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const scope = o.inbox ? 'all' : 'instructions';
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b12-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'offer', destination: hunt, wants: [] })), asks: [] });
    return reply(await intent({ request: request?.id ?? '', hunt, id: f.id, frame }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: `b12-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, request: request?.id };
}
/**
 * `n` more active offers, added at once; idle runs read them in, a run that cannot read them all keeping its progress
 * (cold-discovery-progress), so the map press finds every offer read.
 */
async function grow(f: Folder, n: number) {
  const hunt = await f.id(HUNT);
  for (let i = 1; i <= n; i++) await f.drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
  for (let runs = 0; runs < 3; runs++) if ((await press(f, () => empty, { words: 'Update these notes.' })).calls.length) return;
  throw new Error('The folder was not read within 3 runs.');
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const set = (ctx: Ctx, extra: Record<string, unknown> = {}) => ({ type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE, ...extra });
const map = (ctx: Ctx, body: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ requestId: ctx.request, title: 'Review offers', set: set(ctx), ...body, ...extra });
const opsMap = (ctx: Ctx, ops: unknown[], extra: Record<string, unknown> = {}) => ({ ...empty, maps: [map(ctx, { ops }, extra)] });
const resultsMap = (ctx: Ctx, results: unknown[], extra: Record<string, unknown> = {}) => ({ ...empty, maps: [map(ctx, { results }, extra)] });
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const prop = (targetId: string, key: string, mode: 'set' | 'union', value: unknown) => ({ kind: 'property', targetId, key, mode, value });
const result = async (ctx: Ctx, path: string, ops: unknown[]) => ({ memberId: await ctx.id(path), ops });
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const archived = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
/** The exact expected text: `before` with each `[from, to]` replaced once, each `from` there. */
function swap(before: string | undefined, ...pairs: Array<[string, string]>): string {
  return pairs.reduce((text, [from, to]) => {
    if (!text.includes(from)) throw new Error(`The made-up text has no ${JSON.stringify(from)}`);
    return text.replace(from, to);
  }, before ?? '');
}
const REVIEW: [string, string] = ['review_state: new\n', 'review_state: reviewed\n'];
/** A request record written before the press, older or younger than the press's own by `at`; its Drive id. */
async function ask(f: Folder, name: string, words: string, at: number): Promise<string> {
  const file = await f.drive.createText(await f.id(SYSTEM.changes), `${name}.json`, JSON.stringify({ v: 1, id: name, device: 'device-1', at,
    kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  return file.id;
}
const guardOk = async (f: Folder, m: unknown) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
type Op = { operationId: string; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
/** The manifest of the run's own press (the latest run folder): an earlier press's manifest stays in the folder. */
const manifestOf = (run: CaseRun): Manifest => JSON.parse(Object.entries(run.after).filter(([path]) => /\/manifest-[^/]+\.json$/.test(path))
  .sort(([a], [b]) => Number(/b12-run-(\d+)\//.exec(b)?.[1] ?? 0) - Number(/b12-run-(\d+)\//.exec(a)?.[1] ?? 0))[0]?.[1] ?? '{}') as Manifest;
const editsOf = (m: Manifest, fileId: string) => (m.operations ?? []).filter((o) => o.effect.kind === 'edit-text' && (o.effect.before as { fileId: string }).fileId === fileId);
const changeKinds = (op: Op | undefined) => ((op?.effect.changes ?? []) as Array<{ kind: string }>).map((c) => c.kind);

describe('B12a a request maps a property or a tag over a set', () => {
  it('AC1 b12-set-properties-ops: one rule for every note of the set sets review_state on each active offer; the request is done', async () => {
    const f = await folder({ [`${HUNT}/Nested/Lindenwick offer.md`]: offer('Lindenwick') });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[FERRO], 'only the review_state line of Ferrowick changes').toBe(swap(OFFERS[FERRO], REVIEW));
    expect(run.after[MALLO]).toBe(swap(OFFERS[MALLO], REVIEW));
    expect(run.after[PAST], 'a closed offer is not in the set').toBe(OFFERS[PAST]);
    expect(run.after[`${HUNT}/Nested/Lindenwick offer.md`], 'a nested offer is not in a set that is not recursive').toBe(offer('Lindenwick'));
    expect(run.after[PROFILE]).toBe(PROFILE_TEXT);
    expect(phase(run)).toBe('done');
    expect(run.calls, 'selection and execution only').toEqual(['selection', 'execution']);
    expect(archived(run, 'press-1'), 'the request is done').toBe(true);
    const again = await press(f, () => empty, { words: 'Update these notes.' });
    expect(again.after[FERRO], 'a later run changes nothing').toBe(run.after[FERRO]);
  });

  it('AC1 b12-set-properties-results: one result per note sets each its own value', async () => {
    const f = await folder();
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'senior')]),
      await result(ctx, MALLO, [prop(await ctx.id(MALLO), 'level', 'set', 'junior')])]), { words: 'Set the level of each active offer in Job hunt.' });
    expect(run.after[FERRO], 'an absent property is one new last front-matter line').toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', 'review_state: new\nlevel: senior\n---\n']));
    expect(run.after[MALLO]).toBe(swap(OFFERS[MALLO], ['review_state: new\n---\n', 'review_state: new\nlevel: junior\n---\n']));
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC3 b12-set-properties-membership: a set is its type in its folder (nested only when recursive) where its condition holds', async () => {
    const other = 'Areas/Career/Saltmere offer.md';
    const files = {
      [`${HUNT}/Nested/Lindenwick offer.md`]: offer('Lindenwick'),
      [`${HUNT}/Job hunt idea.md`]: '---\nby: bower\ntype: concept\nsummary: An idea about offers.\nstatus: active\n---\n\n## Notes\nAn idea.\n',
      [other]: offer('Saltmere'),
      [`${HUNT}/No status offer.md`]: offer('Nostatus').replace('status: active\n', ''),
    };
    const f = await folder(files);
    const run = await press(f, (ctx) => opsMap(ctx, [{ kind: 'tag', mode: 'add', value: 'shortlist' }], { set: set(ctx, { recursive: true }) }),
      { words: 'Add shortlist to every active offer under Job hunt.' });
    expect(run.after[FERRO]).toContain('tags: [shortlist]\n');
    expect(run.after[`${HUNT}/Nested/Lindenwick offer.md`], 'recursive: a nested offer is a member').toContain('tags: [shortlist]\n');
    expect(run.after[`${HUNT}/Job hunt idea.md`], 'another type is never a member').toBe(files[`${HUNT}/Job hunt idea.md`]);
    expect(run.after[other], 'an offer in another folder is never a member').toBe(files[other]);
    expect(run.after[`${HUNT}/No status offer.md`], 'a condition that cannot be told selects nothing').toBe(files[`${HUNT}/No status offer.md`]);
    expect(run.after[PAST]).toBe(OFFERS[PAST]);
    expect(phase(run)).toBe('done');
  });

  it('AC3 b12-set-properties-past-prefix: a member whose front matter passes the indexed prefix is read whole and is a member', async () => {
    const long = offer('Longwick', { extra: `note: ${'x'.repeat(190)}\n`.repeat(30) }).replace('status: active\n', '').replace('---\n\n## Notes', 'status: active\n---\n\n## Notes');
    expect(new TextEncoder().encode(long.split('status: active')[0] ?? '').length, 'its status line starts past the 4,096-byte prefix').toBeGreaterThan(4096);
    const f = await folder({ [`${HUNT}/Longwick offer.md`]: long });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[`${HUNT}/Longwick offer.md`]).toBe(swap(long, REVIEW));
    expect(phase(run)).toBe('done');
  });

  it('AC3 b12-set-properties-fresh-evidence: membership reads the version of now, never an earlier run\'s evidence', async () => {
    const f = await folder();
    const first = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(first)).toBe('done');
    const pastId = await f.id(PAST);
    await f.drive.writeText(pastId, OFFERS[PAST]?.replace('status: closed', 'status: active') ?? '', (await f.drive.get(pastId)).modifiedTime);
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[PAST], 'the offer made active since the last run is a member').toContain('review_state: reviewed\n');
    expect(phase(run)).toBe('done');
  });

  it('AC3 b12-set-properties-body-front-matter: body text that looks like front matter is neither a value nor written', async () => {
    const body = 'status: active\n---\nreview_state: new\nskills: [Body]';
    const closed = offer('Bodywick', { status: 'closed', body });
    const active = offer('Pagewick', { body });
    const f = await folder({ [`${HUNT}/Bodywick offer.md`]: closed, [`${HUNT}/Pagewick offer.md`]: active });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED, { kind: 'property', key: 'skills', mode: 'union', value: ['Go'] }]));
    expect(run.after[`${HUNT}/Bodywick offer.md`], 'a closed offer whose body says active is not a member').toBe(closed);
    expect(run.after[`${HUNT}/Pagewick offer.md`], 'the body lines stay; the new list is the last front-matter line')
      .toBe(swap(active, ['review_state: new\n---\n', 'review_state: reviewed\nskills: [Go]\n---\n']));
    expect(phase(run)).toBe('done');
  });

  it('AC4 b12-set-properties-union-keeps-bytes: a union appends to the stored list and keeps every stored byte of it', async () => {
    const profile = PROFILE_TEXT.replace('skills: [Python]', 'skills: ["Python",  \'R&D\']');
    const f = await folder({ [PROFILE]: profile });
    const run = await press(f, async (ctx) => resultsMap(ctx, [await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL', 'R&D', 'C, C++'])])]),
      { words: 'Add the skills of the active offers to Career profile.' });
    expect(run.after[PROFILE]).toBe(swap(profile, ['skills: ["Python",  \'R&D\']\n', 'skills: ["Python",  \'R&D\', SQL, "C, C++"]\n']));
    expect(phase(run)).toBe('done');
  });

  it('AC4 b12-set-properties-tags: a tag is added to the stored list, removed alone, or starts the line', async () => {
    const files = { [FERRO]: offer('Ferrowick', { tags: '[career]' }), [MALLO]: offer('Mallowick', { tags: '["career",  remote]' }) };
    const f = await folder({ ...files, [`${HUNT}/Zelwick offer.md`]: offer('Zelwick') });
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [{ kind: 'tag', targetId: await ctx.id(FERRO), mode: 'add', value: 'shortlist' }]),
      await result(ctx, MALLO, [{ kind: 'tag', targetId: await ctx.id(MALLO), mode: 'remove', value: 'career' }]),
      await result(ctx, `${HUNT}/Zelwick offer.md`, [{ kind: 'tag', targetId: await ctx.id(`${HUNT}/Zelwick offer.md`), mode: 'add', value: 'remote' }])]),
    { words: 'Tidy the tags of the active offers.' });
    expect(run.after[FERRO]).toBe(swap(files[FERRO], ['tags: [career]\n', 'tags: [career, shortlist]\n']));
    expect(run.after[MALLO], 'only that item and its separator go').toBe(swap(files[MALLO], ['tags: ["career",  remote]\n', 'tags: [remote]\n']));
    expect(run.after[`${HUNT}/Zelwick offer.md`]).toBe(swap(offer('Zelwick'), ['review_state: new\n---\n', 'review_state: new\ntags: [remote]\n---\n']));
    expect(run.after[SYSTEM.tags], 'the folder\'s tags are not changed').toBe(JSON.stringify(TAGS, null, 2));
    expect(phase(run)).toBe('done');
  });

  it('AC4 b12-set-properties-crlf: a note with CRLF line ends keeps them, in a replaced line and in a new one', async () => {
    const crlf = offer('Ferrowick').replace(/\n/g, '\r\n');
    const f = await folder({ [FERRO]: crlf });
    const run = await press(f, async (ctx) => resultsMap(ctx, [await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'review_state', 'set', 'reviewed'),
      prop(await ctx.id(FERRO), 'level', 'set', 'senior')])]));
    expect(run.after[FERRO]).toBe(crlf.replace('review_state: new\r\n---\r\n', 'review_state: reviewed\r\nlevel: senior\r\n---\r\n'));
    expect(phase(run)).toBe('done');
  });

  it('AC5 b12-set-properties-shared-target: two members add to one list in one edit, in the set\'s order', async () => {
    const f = await folder();
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL', 'TypeScript'])]),
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['dbt', 'SQL'])])]), { words: 'Add the skills from the active offers to Career profile.' });
    expect(run.after[PROFILE]).toBe(swap(PROFILE_TEXT, ['skills: [Python]\n', 'skills: [Python, SQL, TypeScript, dbt]\n']));
    expect(editsOf(manifestOf(run), await f.id(PROFILE)), 'one edit of the shared note').toHaveLength(1);
    expect(run.after[FERRO]).toBe(OFFERS[FERRO]);
    expect(run.after[MALLO]).toBe(OFFERS[MALLO]);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC5 b12-set-properties-reverse-order: the reply\'s order never changes the combined list; the set\'s order does', async () => {
    const f = await folder();
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['dbt', 'SQL'])]),
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL', 'TypeScript'])])]), { words: 'Add the skills from the active offers to Career profile.' });
    expect(run.after[PROFILE]).toContain('skills: [Python, SQL, TypeScript, dbt]\n');
  });

  it('AC5 b12-set-properties-order: the set\'s order is newest created first, then path', async () => {
    const f = await folder({ [`${HUNT}/Aldwick offer.md`]: offer('Aldwick', { created: '2026-09-01' }), [`${HUNT}/Zelwick offer.md`]: offer('Zelwick', { created: '2026-10-07' }) });
    const run = await press(f, async (ctx) => resultsMap(ctx, await Promise.all([FERRO, MALLO, `${HUNT}/Aldwick offer.md`, `${HUNT}/Zelwick offer.md`].map(async (path, i) =>
      result(ctx, path, [prop(await ctx.id(PROFILE), 'skills', 'union', [`S${i}`])])))), { words: 'Add the skills from the active offers to Career profile.' });
    // Zelwick (10-07), then Ferrowick and Mallowick (10-06, by path), then Aldwick (09-01).
    expect(run.after[PROFILE]).toContain('skills: [Python, S3, S0, S1, S2]\n');
  });

  it('AC5 b12-set-properties-coalesce: identical values on one note are one change; conflicting ones leave that note and their members alone', async () => {
    const zel = `${HUNT}/Zelwick offer.md`;
    const f = await folder({ [zel]: offer('Zelwick') });
    const same = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'focus', 'set', 'data')]),
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'focus', 'set', 'data')])]), { words: 'Set the focus of Career profile from the active offers.' });
    expect(same.after[PROFILE]).toBe(swap(PROFILE_TEXT, ['skills: [Python]\n---\n', 'skills: [Python]\nfocus: data\n---\n']));
    const g = await folder({ [zel]: offer('Zelwick') });
    const clash = await press(g, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'focus', 'set', 'data'), prop(await ctx.id(FERRO), 'review_state', 'set', 'reviewed')]),
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'focus', 'set', 'web')]),
      await result(ctx, zel, [prop(await ctx.id(zel), 'review_state', 'set', 'reviewed')])]), { words: 'Set the focus of Career profile from the active offers.' });
    expect(clash.after[PROFILE], 'no last writer wins').toBe(PROFILE_TEXT);
    expect(clash.after[FERRO], 'a member whose change cannot be made changes nothing').toBe(OFFERS[FERRO]);
    expect(clash.after[zel], 'a member with clear work is written').toContain('review_state: reviewed\n');
    expect(phase(clash)).toBe('done');
    expect(archived(clash, 'press-1'), 'every member is done or unavailable: the request is settled').toBe(true);
  });

  it('AC5 b12-set-properties-overflow: a combined list over 10 items leaves the shared note whole', async () => {
    const zel = `${HUNT}/Zelwick offer.md`;
    const profile = PROFILE_TEXT.replace('skills: [Python]', 'skills: [A, B, C, D, E, F, G, H]');
    const f = await folder({ [PROFILE]: profile, [zel]: offer('Zelwick') });
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['I', 'J'])]),
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['K'])]),
      await result(ctx, zel, [prop(await ctx.id(zel), 'review_state', 'set', 'reviewed')])]), { words: 'Add the skills from the active offers to Career profile.' });
    expect(run.after[PROFILE], 'eleven items: no skill is cut, the note is left whole').toBe(profile);
    expect(run.after[zel]).toContain('review_state: reviewed\n');
    expect(phase(run)).toBe('done');
  });

  it('AC5 b12-set-properties-tag-cap: a fourth tag on a note leaves that note alone; the others are tagged', async () => {
    const full = offer('Ferrowick', { tags: '[career, remote, shortlist]' });
    const f = await folder({ [FERRO]: full });
    const run = await press(f, (ctx) => opsMap(ctx, [{ kind: 'tag', mode: 'add', value: 'gardening' }]), { words: 'Add gardening to the active offers.' });
    expect(run.after[FERRO], 'three tags at most on a note').toBe(full);
    expect(run.after[MALLO]).toContain('tags: [gardening]\n');
    expect(phase(run)).toBe('done');
  });

  it('AC5 b12-set-properties-one-edit: a member that is also another member\'s target gets one edit with every change', async () => {
    const f = await folder();
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'review_state', 'set', 'reviewed')]),
      await result(ctx, MALLO, [prop(await ctx.id(FERRO), 'skills', 'union', ['dbt'])])]), { words: 'Review Ferrowick and give it the skills of Mallowick.' });
    expect(run.after[FERRO]).toBe(swap(OFFERS[FERRO], ['skills: [SQL, TypeScript]\n', 'skills: [SQL, TypeScript, dbt]\n'], REVIEW));
    expect(editsOf(manifestOf(run), await f.id(FERRO))).toHaveLength(1);
  });

  it.each([['ops', () => ({ ops: [REVIEWED] })], ['results', () => ({ results: [] })]] as const)(
    'AC1 b12-set-properties-empty-set: a set with no notes (%s) settles the request with no write and the usual done words', async (_name, body) => {
      const f = await folder();
      const run = await press(f, (ctx) => ({ ...empty, maps: [map(ctx, body(), { set: set(ctx, { where: { op: 'eq', property: 'status', value: 'paused' } }) })] }),
        { words: 'Mark the paused offers in Job hunt as reviewed.' });
      expect(refusals(), 'an empty set is not refused').toEqual([]);
      for (const [path, text] of Object.entries({ ...OFFERS, [PROFILE]: PROFILE_TEXT, [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2) })) expect(run.after[path], path).toBe(text);
      expect(phase(run)).toBe('done');
      expect(archived(run, 'press-1'), 'the request is settled and archived').toBe(true);
      const rows = (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done: string }> }).done;
      expect(rows.filter((r) => r.id === 'press-1').map((r) => r.done)).toEqual([REQUEST_DONE]);
    });

  /** Ferrowick with its skills as a block list of these items, one per line (R58: an item's own scalar, a comma in it kept). */
  const blockFerro = (items: string[]) => offer('Ferrowick', { created: '2026-10-06', skills: '[SQL]' }).replace('skills: [SQL]\n', `skills:\n${items.map((i) => `  - ${i}\n`).join('')}`);
  it('AC4 b12-set-properties-block-set: a set of two items replaces a block list whose one item holds a comma; its replay writes nothing', async () => {
    const ferro = blockFerro(['C, C++']);
    const f = await folder({ [FERRO]: ferro });
    const words = 'Set the skills of the active offers.';
    const ops = [{ kind: 'property', key: 'skills', mode: 'set', value: ['C', 'C++'] }];
    const run = await press(f, (ctx) => opsMap(ctx, ops), { words });
    expect(run.after[FERRO], 'one stored item is not the two asked for').toBe(swap(ferro, ['skills:\n  - C, C++\n', 'skills: [C, C++]\n']));
    const replay = await press(f, (ctx) => opsMap(ctx, ops), { words });
    expect(editsOf(manifestOf(replay), await f.id(FERRO)), 'the same items are not written again').toHaveLength(0);
  });

  it('AC4 b12-set-properties-block-commas: a block list whose items hold commas validates by its items and takes a union, each item kept whole', async () => {
    const items = ['SQL', 'C, C++', 'Go', 'R, S', 'Rust', 'dbt', 'Java', 'Kotlin', 'Swift'];
    const ferro = blockFerro(items);
    const f = await folder({ [FERRO]: ferro });
    const run = await press(f, (ctx) => opsMap(ctx, [{ kind: 'property', key: 'skills', mode: 'union', value: ['Scala'] }]), { words: 'Add Scala to the active offers.' });
    expect(run.after[FERRO], 'nine items and one more: ten, never the eleven a comma split would count')
      .toBe(swap(ferro, [`skills:\n${items.map((i) => `  - ${i}\n`).join('')}`, 'skills: [SQL, "C, C++", Go, "R, S", Rust, dbt, Java, Kotlin, Swift, Scala]\n']));
    expect(await guardOk(f, manifestOf(run)), 'the guard reads the items as written').toBe(true);
    expect(phase(run)).toBe('done');
  });

  it('AC4 b12-set-properties-block-identical: a set equal to a block list\'s items writes nothing', async () => {
    const ferro = blockFerro(['C, C++', 'Go']);
    const f = await folder({ [FERRO]: ferro });
    const run = await press(f, (ctx) => opsMap(ctx, [{ kind: 'property', key: 'skills', mode: 'set', value: ['C, C++', 'Go'] }]), { words: 'Set the skills of the active offers.' });
    expect(editsOf(manifestOf(run), await f.id(FERRO)), 'already as asked').toHaveLength(0);
    expect(run.after[FERRO]).toBe(ferro);
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC3 b12-set-properties-block-membership: a condition on a list reads a block list by its items, a comma inside one kept', async () => {
    const ferro = blockFerro(['C, C++', 'Go']);
    const f = await folder({ [FERRO]: ferro, [MALLO]: offer('Mallowick', { created: '2026-10-06', skills: '["C, C++"]' }) });
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED], { set: set(ctx, { where: { op: 'all', of: [ACTIVE, { op: 'contains', property: 'skills', value: 'C, C++' }] } }) }));
    expect(run.after[FERRO], 'the block item "C, C++" is one item').toBe(swap(ferro, REVIEW));
    expect(run.after[MALLO]).toContain('review_state: reviewed\n');
  });

  it('AC4 b12-set-properties-block-list: a union, a tag add and a tag remove on a block list write one canonical inline list in its place, every item kept', async () => {
    const ferro = offer('Ferrowick', { created: '2026-10-06', skills: '[SQL]' }).replace('skills: [SQL]\n', 'skills:\n  - SQL\n  - C, C++\n');
    const mallo = offer('Mallowick', { created: '2026-10-06', tags: '[career]' }).replace('tags: [career]\n', 'tags:\n  - career\n  - remote\n');
    const zel = `${HUNT}/Zelwick offer.md`;
    const zelText = offer('Zelwick', { tags: '[career]' }).replace('tags: [career]\n', 'tags:\n  - career\n  - remote\n');
    const f = await folder({ [FERRO]: ferro, [MALLO]: mallo, [zel]: zelText });
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'skills', 'union', ['Go'])]),
      await result(ctx, MALLO, [{ kind: 'tag', targetId: await ctx.id(MALLO), mode: 'add', value: 'shortlist' }]),
      await result(ctx, zel, [{ kind: 'tag', targetId: await ctx.id(zel), mode: 'remove', value: 'career' }])]), { words: 'Tidy the skills and tags of the active offers.' });
    expect(run.after[FERRO], 'the header and its items become one inline list where the header was').toBe(swap(ferro, ['skills:\n  - SQL\n  - C, C++\n', 'skills: [SQL, "C, C++", Go]\n']));
    expect(run.after[MALLO]).toBe(swap(mallo, ['tags:\n  - career\n  - remote\n', 'tags: [career, remote, shortlist]\n']));
    expect(run.after[zel]).toBe(swap(zelText, ['tags:\n  - career\n  - remote\n', 'tags: [remote]\n']));
    expect(phase(run)).toBe('done');
  });

  it.each([['empty text', { kind: 'property', key: 'note', mode: 'set', value: '' }], ['text of spaces only', { kind: 'property', key: 'note', mode: 'set', value: '   ' }],
    ['a list with an empty item', { kind: 'property', key: 'skills', mode: 'union', value: ['Go', ''] }]] as const)(
    'AC2 b12-set-properties-empty-value: %s does not read back as written: refused once; the corrected reply applies and its replay writes nothing', async (_name, bad) => {
      const f = await folder();
      const fixed = [{ kind: 'property', key: 'note', mode: 'set', value: 'Remote first' }];
      const words = 'Note the details of the active offers.';
      const run = await press(f, (ctx, attempt) => opsMap(ctx, attempt === 0 ? [bad] : fixed), { words });
      expect(refusals().slice(0, 2)).toEqual(['mapKeys', 'a value its property cannot hold']);
      expect(run.after[FERRO]).toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', 'review_state: new\nnote: Remote first\n---\n']));
      expect(phase(run)).toBe('done');
      const replay = await press(f, (ctx) => opsMap(ctx, fixed), { words });
      expect(editsOf(manifestOf(replay), await f.id(FERRO)), 'the replay writes nothing').toHaveLength(0);
      expect(replay.after[FERRO]).toBe(run.after[FERRO]);
    });

  it('AC4 b12-set-properties-quoted-decode: a text or enum value the scalar writer quotes reads back as itself', () => {
    const row = QUOTED_ROW();
    for (const [key, value] of QUOTED) expect(propertyValue(row, key, frontValues(`---\n${key}: ${JSON.stringify(value)}\n---\n`)?.[key]), key).toEqual({ value });
    // Rule 3 (R57): text that is empty or spaces only reads as missing, so a map never writes it.
    for (const value of ['', '   ']) expect(propertyValue(row, 'q1', frontValues(`---\nq1: ${JSON.stringify(value)}\n---\n`)?.q1), JSON.stringify(value)).toBe('missing');
  });

  /** Money in both key orders: equal as JSON values (object key order aside), never as text. */
  const MONEY_TABLE = { v: 1, rows: [{ ...ROW, properties: { ...ROW.properties, salary: { type: 'money' } } },
    { ...PROFILE_ROW, properties: { ...PROFILE_ROW.properties, target_pay: { type: 'money' } } }] };
  const CURRENCY_FIRST = { currency: 'EUR', amount: 10 };
  const AMOUNT_FIRST = { amount: 10, currency: 'EUR' };
  it.each([['currency first', CURRENCY_FIRST], ['amount first', AMOUNT_FIRST]] as const)(
    'AC1 b12-set-properties-money-key-order: a money value with its keys %s applies, its replay writes nothing, and the guard takes either order', async (_name, value) => {
      const f = await folder({}, { table: MONEY_TABLE });
      const words = 'Set the salary of the active offers.';
      const ops = [{ kind: 'property', key: 'salary', mode: 'set', value }];
      const run = await press(f, (ctx) => opsMap(ctx, ops), { words });
      expect(refusals(), 'not refused for its key order').toEqual([]);
      expect(run.after[FERRO]).toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', `review_state: new\nsalary: ${JSON.stringify(value)}\n---\n`]));
      const stored = manifestOf(run);
      const ferroId = await f.id(FERRO);
      const other = JSON.stringify(value === CURRENCY_FIRST ? AMOUNT_FIRST : CURRENCY_FIRST);
      const reorder = (e: Record<string, unknown>) => {
        e.text = String(e.text).replace(`salary: ${JSON.stringify(value)}`, `salary: ${other}`);
        for (const c of e.changes as Array<Record<string, unknown>>) if (c.key === 'salary') c.line = `salary: ${other}`;
      };
      expect(await guardOk(f, await resealed(stored, ferroId, reorder)), 'the resealed twin in the other key order').toBe(true);
      const replay = await press(f, (ctx) => opsMap(ctx, ops), { words });
      expect(editsOf(manifestOf(replay), ferroId), 'a value already there is not written again').toHaveLength(0);
      const other2 = await press(f, (ctx) => opsMap(ctx, [{ kind: 'property', key: 'salary', mode: 'set', value: JSON.parse(other) as unknown }]), { words });
      expect(editsOf(manifestOf(other2), ferroId), 'the same value in the other key order is already there').toHaveLength(0);
    });

  it('AC5 b12-set-properties-money-coalesce: two members give one money value in two key orders: one change on the shared note', async () => {
    const f = await folder({}, { table: MONEY_TABLE });
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'target_pay', 'set', CURRENCY_FIRST)]),
      await result(ctx, MALLO, [prop(await ctx.id(PROFILE), 'target_pay', 'set', AMOUNT_FIRST)])]), { words: 'Set the target pay of Career profile from the active offers.' });
    expect(refusals()).toEqual([]);
    expect(run.after[PROFILE], 'identical values coalesce, whatever their key order').toBe(swap(PROFILE_TEXT, ['skills: [Python]\n---\n', `skills: [Python]\ntarget_pay: ${JSON.stringify(CURRENCY_FIRST)}\n---\n`]));
    expect(phase(run)).toBe('done');
  });

  it('AC4 b12-set-properties-quoted-round-trip: quoted values are written, read back equal, and a replay writes nothing', async () => {
    const f = await folder({}, { table: QUOTED_TABLE });
    const ops = () => QUOTED.map(([key, value]) => ({ kind: 'property', key, mode: 'set', value }));
    const words = 'Note the details of the active offers.';
    const run = await press(f, (ctx) => opsMap(ctx, ops()), { words });
    const lines = QUOTED.map(([key, value]) => `${key}: ${JSON.stringify(value)}\n`).join('');
    expect(run.after[FERRO], 'each value quoted by the one scalar writer').toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', `review_state: new\n${lines}---\n`]));
    const front = frontValues(run.after[FERRO] ?? '');
    for (const [key, value] of QUOTED) expect(propertyValue(QUOTED_ROW(), key, front?.[key]), `${key} reads back equal`).toEqual({ value });
    const replay = await press(f, (ctx) => opsMap(ctx, ops()), { words });
    expect(editsOf(manifestOf(replay), await f.id(FERRO)), 'a value already there is not written again').toHaveLength(0);
    expect(replay.after[FERRO]).toBe(run.after[FERRO]);
    expect(archived(replay, 'press-2')).toBe(true);
  });

  it.each([['the ops map is older', true], ['the results map is older', false]] as const)(
    'AC5 b12-set-properties-oldest-owns: two maps share a note; %s and writes it, the younger settles without it', async (_name, opsOlder) => {
      const reviewWords = 'Mark the active offers in Job hunt as reviewed.';
      const levelWords = 'Set the level and the skills from the active offers.';
      const f = await folder();
      // `other-1` is the older map's request in both cases (R52: by record `at`).
      const other = await ask(f, 'other-1', opsOlder ? reviewWords : levelWords, DAY - 1);
      const run = await press(f, async (ctx) => ({ ...empty, maps: [
        map({ ...ctx, request: opsOlder ? other : ctx.request }, { ops: [REVIEWED] }),
        map({ ...ctx, request: opsOlder ? ctx.request : other }, { results: [
          await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL'])]),
          await result(ctx, MALLO, [prop(await ctx.id(MALLO), 'level', 'set', 'junior')])] }, { title: 'Offer levels' })] }),
      { words: opsOlder ? levelWords : reviewWords });
      expect(run.after[FERRO], 'a note only one map changes is written').toBe(swap(OFFERS[FERRO], REVIEW));
      expect(run.after[PROFILE]).toBe(swap(PROFILE_TEXT, ['skills: [Python]\n', 'skills: [Python, SQL]\n']));
      expect(run.after[MALLO], 'the shared note is the older request\'s only').toBe(opsOlder ? swap(OFFERS[MALLO], REVIEW)
        : swap(OFFERS[MALLO], ['review_state: new\n---\n', 'review_state: new\nlevel: junior\n---\n']));
      expect(archived(run, 'press-1'), 'both requests settle').toBe(true);
      expect(archived(run, 'other-1')).toBe(true);
      expect(phase(run)).toBe('done');
    });

  it.each([['older', DAY - 1], ['younger', DAY + 100]] as const)(
    'AC5 b12-set-properties-oldest-owns-ordinary: a map and an ordinary request naming one of its notes; the ordinary request is %s', async (age, at) => {
      const words = 'Update Mallowick offer from the next letter.';
      const control = await folder();
      await ask(control, 'other-1', words, at);
      const alone = await press(control, () => empty, { words: 'Update these notes.' });
      const f = await folder();
      const other = await ask(f, 'other-1', words, at);
      const before = await f.drive.readText(other);
      const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
      expect(run.after[FERRO], 'the map writes a note no older request names').toBe(swap(OFFERS[FERRO], REVIEW));
      expect(archived(run, 'press-1'), 'the map\'s request settles').toBe(true);
      expect(phase(run)).toBe('done');
      if (age === 'older') {
        expect(run.after[MALLO], 'the older request owns its note: the map\'s part there is unavailable').toBe(alone.after[MALLO]);
        expect(archived(run, 'other-1'), 'the older request settles as it does alone').toBe(archived(alone, 'other-1'));
        return;
      }
      expect(run.after[MALLO], 'the older map owns the note').toBe(swap(OFFERS[MALLO], REVIEW));
      // As C05 (c05-person-notes, round 3 2): a younger request naming a note an older one settles stays untouched.
      expect(run.after[`${SYSTEM.changes}/other-1.json`], 'the younger request waits untouched').toBe(before);
      expect(JSON.stringify(manifestOf(run).capture ?? {})).not.toContain('"other-1"');
    });

  /** Each op, and what it alone makes of Ferrowick and Mallowick (tags start `[career]`: adding shortlist appends, removing it is a no-op). */
  const COMBO_OPS = {
    listSet: { op: { kind: 'property', key: 'skills', mode: 'set', value: ['Go'] }, make: (t?: string, s = '') => swap(t, [`skills: [${s}]\n`, 'skills: [Go]\n']) },
    union: { op: { kind: 'property', key: 'skills', mode: 'union', value: ['Rust'] }, make: (t?: string, s = '') => swap(t, [`skills: [${s}]\n`, `skills: [${s}, Rust]\n`]) },
    otherSet: { op: { kind: 'property', key: 'skills', mode: 'set', value: ['Rust'] }, make: (t?: string, s = '') => swap(t, [`skills: [${s}]\n`, 'skills: [Rust]\n']) },
    tagAdd: { op: { kind: 'tag', mode: 'add', value: 'shortlist' }, make: (t?: string) => swap(t, ['tags: [career]\n', 'tags: [career, shortlist]\n']) },
    tagRemove: { op: { kind: 'tag', mode: 'remove', value: 'shortlist' }, make: (t?: string) => t ?? '' },
  };
  type ComboOp = keyof typeof COMBO_OPS;
  const COMBOS: Array<[string, ComboOp, ComboOp]> = [['a list set and a union', 'listSet', 'union'], ['two different list sets', 'listSet', 'otherSet'], ['a tag add and its remove', 'tagAdd', 'tagRemove']];
  it.each(COMBOS.flatMap(([name, a, b]): Array<[string, ComboOp, ComboOp]> => [[`${name}, the first older`, a, b], [`${name}, the second older`, b, a]]))(
    'AC5 b12-set-properties-combination: two requests\' maps make %s on one note: the older wins, the younger settles without it', async (_name, olderKey, youngerKey) => {
      const olderOp = COMBO_OPS[olderKey].op;
      const youngerOp = COMBO_OPS[youngerKey].op;
      const files = { [FERRO]: offer('Ferrowick', { created: '2026-10-06', skills: '[SQL, TypeScript]', tags: '[career]' }),
        [MALLO]: offer('Mallowick', { created: '2026-10-06', skills: '[dbt, SQL]', tags: '[career]' }) };
      const f = await folder(files);
      const older = await ask(f, 'other-1', 'Update the active offers in Job hunt.', DAY - 1);
      const run = await press(f, (ctx) => ({ ...empty, maps: [map({ ...ctx, request: older }, { ops: [olderOp] }), map(ctx, { ops: [youngerOp] }, { title: 'Offers again' })] }),
        { words: 'Update the active offers in Job hunt again.' });
      const make = COMBO_OPS[olderKey].make;
      expect(run.after[FERRO]).toBe(make(files[FERRO], 'SQL, TypeScript'));
      expect(run.after[MALLO]).toBe(make(files[MALLO], 'dbt, SQL'));
      expect(archived(run, 'other-1'), 'the older request settles').toBe(true);
      expect(archived(run, 'press-1'), 'the younger request settles too').toBe(true);
      expect(phase(run)).toBe('done');
    });

  it('AC6 b12-set-properties-person-source: a person\'s note and a Source get no property or tag, by any route', async () => {
    const person = offer('Alex', { by: false });
    const source = offer('Workshop', { extra: 'bower_template: source\n' });
    const files = { [`${HUNT}/Alex offer.md`]: person, [`${HUNT}/Workshop offer.md`]: source };
    const f = await folder(files);
    const ops = await press(f, (ctx) => opsMap(ctx, [{ kind: 'tag', mode: 'add', value: 'shortlist' }]), { words: 'Add shortlist to the active offers.' });
    expect(ops.after[`${HUNT}/Alex offer.md`], 'one rule for all: the person\'s note stays exact').toBe(person);
    expect(ops.after[`${HUNT}/Workshop offer.md`], 'a Source stays exact').toBe(source);
    expect(ops.after[FERRO]).toContain('tags: [shortlist]\n');
    expect(phase(ops)).toBe('done');
    const g = await folder({ ...files, [PROFILE]: PROFILE_TEXT.replace('by: bower\n', '') });
    const results = await press(g, async (ctx) => resultsMap(ctx, [
      await result(ctx, `${HUNT}/Alex offer.md`, [prop(await ctx.id(`${HUNT}/Alex offer.md`), 'level', 'set', 'senior')]),
      await result(ctx, `${HUNT}/Workshop offer.md`, [{ kind: 'tag', targetId: await ctx.id(`${HUNT}/Workshop offer.md`), mode: 'add', value: 'career' }]),
      await result(ctx, FERRO, [prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL'])]),
      await result(ctx, MALLO, [prop(await ctx.id(MALLO), 'level', 'set', 'junior')])]), { words: 'Set levels and skills from the active offers.' });
    expect(results.after[`${HUNT}/Alex offer.md`]).toBe(person);
    expect(results.after[`${HUNT}/Workshop offer.md`]).toBe(source);
    expect(results.after[PROFILE], 'a shared note that is the person\'s stays exact').toBe(PROFILE_TEXT.replace('by: bower\n', ''));
    expect(results.after[MALLO]).toContain('level: junior\n');
    expect(phase(results)).toBe('done');
    expect(archived(results, 'press-1')).toBe(true);
  });

  it('AC6 b12-set-properties-no-request: a map in a run with no request changes nothing, and the corrected reply files', async () => {
    const f = await folder();
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? { ...empty, maps: [{ ...map({ ...ctx, request: await ctx.id(FERRO) }, { ops: [REVIEWED] }) }] } : empty,
      { inbox: { name: 'Ferrowick letter.txt', text: 'Ferrowick sends a letter about the offer.\n' } });
    expect(refusals()[0], 'refused once as unbound').toBe('mapBinding');
    expect(run.after[FERRO]).toBe(OFFERS[FERRO]);
    expect(run.after[MALLO]).toBe(OFFERS[MALLO]);
  });
});

describe('B12a refusals: shape, binding, limit', () => {
  type Bad = { name: string; kind: string; why?: string; entry: (ctx: Ctx) => Promise<Record<string, unknown>>; reply?: Record<string, unknown>; files?: Record<string, string> };
  const TAG_WHY = "a tag that is not one of the folder's tags or this reply's newTags";
  const THIRTY = JSON.stringify({ v: 1, tags: [...TAGS.tags, ...Array.from({ length: 26 }, (_, i) => `topic${i + 1}`)] }, null, 2);
  const NO_CHANGE = 'no change for a set that has notes';
  const GENERIC = 'a map with keys outside the intent ({requestId, title, set: {type, folderId, recursive, where}, then "ops" for every note of the set, '
    + 'with a "question": {text, yes, no} when the set is over 200, or "results": [{memberId, ops}], not both; an op is {kind: "property", key, mode: "set" or "union", value}, '
    + '{kind: "tag", mode: "add" or "remove", value}, {kind: "move", parentId} or, in "results" only, {kind: "rename", name}, each with a "targetId" inside "results"}) '
    + 'or a set the grammar refuses';
  const BINDING = "a map whose request is not one of the person's requests below, whose folder is not one of the main folders, or whose note is not in its set or shown below";
  const ops = (ctx: Ctx, extra: Record<string, unknown> = {}) => map(ctx, { ops: [REVIEWED] }, extra);
  const badWhere = { op: 'eval', property: 'status', value: 'active' };
  const bad: Bad[] = [
    { name: 'an unknown key', kind: 'mapKeys', entry: async (ctx) => ops(ctx, { extra: 1 }) },
    { name: 'both ops and results', kind: 'mapKeys', entry: async (ctx) => ({ ...ops(ctx), results: [await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'senior')])] }) },
    { name: 'neither ops nor results', kind: 'mapKeys', entry: async (ctx) => map(ctx, {}) },
    { name: 'an op kind outside the four', kind: 'mapKeys', entry: async (ctx) => map(ctx, { ops: [{ kind: 'delete' }] }) },
    { name: 'a targetId in ops', kind: 'mapKeys', entry: async (ctx) => map(ctx, { ops: [{ ...REVIEWED, targetId: await ctx.id(FERRO) }] }) },
    { name: 'a result op without a targetId', kind: 'mapKeys', entry: async (ctx) => map(ctx, { results: [await result(ctx, FERRO, [REVIEWED])] }) },
    { name: 'a set the grammar refuses', kind: 'mapKeys', entry: async (ctx) => ops(ctx, { set: set(ctx, { where: badWhere }) }),
      why: `a set the grammar refuses: ${viewFault({ v: 1, id: 'set', kind: 'aggregate', title: 'Set', set: { type: 'offer', folderId: 'f', recursive: false, where: badWhere },
        groupBy: [], measures: [{ id: 'n', label: 'Notes', op: 'count' }] }, readTypeTable(JSON.stringify(TABLE)).table)}` },
    { name: 'a property the type does not declare', kind: 'mapKeys', why: 'a property the type does not declare', entry: async (ctx) => map(ctx, { ops: [{ ...REVIEWED, key: 'preference' }] }) },
    { name: 'a value its property cannot hold', kind: 'mapKeys', why: 'a value its property cannot hold', entry: async (ctx) => map(ctx, { ops: [{ ...REVIEWED, value: 'done' }] }) },
    { name: 'a union on a property that is not a list', kind: 'mapKeys', why: '"union" on a property that is not a list', entry: async (ctx) => map(ctx, { ops: [{ ...REVIEWED, mode: 'union', value: ['reviewed'] }] }) },
    { name: 'a tag the folder does not use', kind: 'mapKeys', why: TAG_WHY, entry: async (ctx) => map(ctx, { ops: [{ kind: 'tag', mode: 'add', value: 'urgent' }] }) },
    { name: 'a third new tag in one run (B7: at most 2 new per run)', kind: 'mapKeys', why: TAG_WHY, reply: { newTags: ['hybrid', 'onsite', 'contract'] },
      entry: async (ctx) => map(ctx, { ops: [{ kind: 'tag', mode: 'add', value: 'contract' }] }) },
    { name: 'a new tag on a list of 30 (B7: the list grows to 30)', kind: 'mapKeys', why: TAG_WHY, reply: { newTags: ['hybrid'] }, files: { [SYSTEM.tags]: THIRTY },
      entry: async (ctx) => map(ctx, { ops: [{ kind: 'tag', mode: 'add', value: 'hybrid' }] }) },
    { name: 'two results for one note', kind: 'mapKeys', why: 'two results for one note', entry: async (ctx) => map(ctx, { results: [
      await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'senior')]), await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'junior')])] }) },
    { name: 'a title that is not one plain line', kind: 'mapKeys', why: 'a title that is not one short plain line', entry: async (ctx) => ops(ctx, { title: 'Review | offers' }) },
    { name: 'a request that is a note', kind: 'mapBinding', entry: async (ctx) => ops({ ...ctx, request: await ctx.id(FERRO) }) },
    { name: 'a folder outside the main folders', kind: 'mapBinding', entry: async (ctx) => ops(ctx, { set: set(ctx, { folderId: await ctx.id(SYSTEM.dir) }) }) },
    { name: 'a result for a note outside its set', kind: 'mapBinding', why: 'a result for a note outside its set',
      entry: async (ctx) => map(ctx, { results: [await result(ctx, PAST, [prop(await ctx.id(PAST), 'level', 'set', 'senior')])] }) },
    { name: 'an op on a note neither its own nor shown', kind: 'mapBinding', why: "an op on a note that is neither its result's note nor one shown below",
      entry: async (ctx) => map(ctx, { results: [await result(ctx, FERRO, [prop(await ctx.id('Rules.md'), 'level', 'set', 'senior')])] }) },
    { name: 'empty ops for a set that has notes', kind: 'mapBinding', why: NO_CHANGE, entry: async (ctx) => map(ctx, { ops: [] }) },
    { name: 'empty results for a set that has notes', kind: 'mapBinding', why: NO_CHANGE, entry: async (ctx) => map(ctx, { results: [] }) },
    { name: 'more than 8 ops for one note', kind: 'mapLimit', why: 'more than 8 ops for one note', entry: async (ctx) => map(ctx, { ops: Array.from({ length: 9 }, () => REVIEWED) }) },
  ];
  it.each(bad)('AC2 b12-set-properties-refusals: $name is refused once with its own kind and reason; the corrected reply applies', async ({ kind, why, entry, reply: extra, files }) => {
    const f = await folder(files);
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? { ...empty, ...extra, maps: [await entry(ctx)] } : opsMap(ctx, [REVIEWED]));
    expect(refusals().slice(0, 2)).toEqual([kind, why ?? (kind === 'mapKeys' ? GENERIC : BINDING)]);
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
    expect(phase(run)).toBe('done');
  });

  // Ruling 2 (round 3): the 8-op limit counts every op that would apply to one note, a broadcast map's and a results map's together.
  const FIVE = [REVIEWED, { kind: 'property', key: 'level', mode: 'set', value: 'senior' }, { kind: 'property', key: 'note', mode: 'set', value: 'Remote first' },
    { kind: 'tag', mode: 'add', value: 'shortlist' }, { kind: 'property', key: 'skills', mode: 'union', value: ['Go'] }];
  it.each([['5 broadcast ops and 4 of its own on one note are refused', 5, true], ['4 broadcast ops and 4 of its own on one note pass', 4, false]] as const)(
    'AC2 b12-set-properties-combined-limit: %s (mapLimit)', async (_name, broadcast, refused) => {
      const f = await folder();
      const other = await ask(f, 'other-1', 'Set the level and the skills from the active offers.', DAY - 1);
      const run = await press(f, async (ctx, attempt) => {
        if (attempt > 0) return opsMap(ctx, [REVIEWED]);
        const ferro = await ctx.id(FERRO);
        return { ...empty, maps: [map(ctx, { ops: FIVE.slice(0, broadcast) }), map({ ...ctx, request: other }, { results: [{ memberId: ferro,
          ops: [prop(ferro, 'level', 'set', 'junior'), prop(ferro, 'skills', 'union', ['Rust']), prop(ferro, 'note', 'set', 'Hybrid'), { kind: 'tag', targetId: ferro, mode: 'add', value: 'remote' }] }] }, { title: 'Offer levels' })] };
      });
      expect(refusals().slice(0, 2)).toEqual(refused ? ['mapLimit', 'more than 8 ops for one note'] : []);
      expect(phase(run)).toBe('done');
    });

  it('AC2 b12-set-properties-two-maps: two maps for one request are refused once (mapLimit)', async () => {
    const f = await folder();
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? { ...empty, maps: [ops(ctx), ops(ctx)] } : opsMap(ctx, [REVIEWED]));
    expect(refusals().slice(0, 2)).toEqual(['mapLimit', 'two maps for one request']);
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
  });

  it('AC2 b12-set-properties-computed: a property a view computes is refused once (mapKeys)', async () => {
    const formula = { v: 1, id: 'fit', kind: 'formula', type: 'offer', outputs: [{ property: 'fit', type: 'number', expr: { number: 1 } }] };
    const table = { v: 1, rows: [{ ...ROW, properties: { ...ROW.properties, fit: { type: 'number' } }, views: [formula] }, PROFILE_ROW] };
    const f = await folder({}, { table });
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? opsMap(ctx, [{ kind: 'property', key: 'fit', mode: 'set', value: 2 }]) : opsMap(ctx, [REVIEWED]));
    expect(refusals().slice(0, 2)).toEqual(['mapKeys', 'a property a view computes']);
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
  });

  it('AC2 b12-set-properties-first-fault: an entry breaking several rules is refused for its first, in shape, binding, limit order', async () => {
    const f = await folder();
    const nine = (path: string, key: string) => async (ctx: Ctx) => map(ctx, { results: [await result(ctx, path, Array.from({ length: 9 }, () => ({ ...prop('', key, 'set', 'senior') })))] });
    const shapeFirst = await press(f, async (ctx, attempt) => attempt === 0 ? { ...empty, maps: [await nine(PAST, 'preference')(ctx)] } : opsMap(ctx, [REVIEWED]));
    expect(refusals().slice(0, 2), 'shape before binding and limit').toEqual(['mapKeys', 'a property the type does not declare']);
    expect(phase(shapeFirst)).toBe('done');
    vi.mocked(console.error).mockClear();
    const g = await folder();
    const bindingFirst = await press(g, async (ctx, attempt) => {
      if (attempt > 0) return opsMap(ctx, [REVIEWED]);
      const pastId = await ctx.id(PAST);
      return { ...empty, maps: [map(ctx, { results: [{ memberId: pastId, ops: Array.from({ length: 9 }, () => prop(pastId, 'level', 'set', 'senior')) }] })] };
    });
    expect(refusals().slice(0, 2), 'binding before limit').toEqual(['mapBinding', 'a result for a note outside its set']);
    expect(phase(bindingFirst)).toBe('done');
  });

  it('AC2 b12-set-properties-over-200: a set over 200 notes is refused once (mapLimit); a narrower set applies', async () => {
    const f = await folder();
    await grow(f, 199);
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? opsMap(ctx, [REVIEWED])
      : opsMap(ctx, [REVIEWED], { set: set(ctx, { where: { op: 'all', of: [ACTIVE, { op: 'contains', property: 'skills', value: 'SQL' }] } }) }));
    expect(refusals().slice(0, 2)).toEqual(['mapLimit', 'a set over 200 notes: give one rule for all of them in "ops" and a "question" to start with the first 200']);
    expect(run.after[`${HUNT}/Offer 001.md`], 'nothing outside the narrower set').toBe(offer('Offer 1'));
    expect(run.after[FERRO]).toContain('review_state: reviewed\n');
    expect(phase(run)).toBe('done');
  }, 120_000);
});

describe('B12a writes: the person\'s edit, recovery, the guard, the ledger', () => {
  it('AC7 b12-set-properties-person-edit: a member the person edits during the run keeps the edit; the request waits and completes once', async () => {
    const f = await folder();
    const malloId = await f.id(MALLO);
    let edited = false;
    const first = await press(f, async (ctx) => {
      if (!edited) {
        edited = true;
        await f.drive.writeText(malloId, `${await f.drive.readText(malloId)}Alex added this line during the run.\n`, (await f.drive.get(malloId)).modifiedTime);
      }
      return opsMap(ctx, [REVIEWED]);
    });
    expect(edited).toBe(true);
    expect(first.after[MALLO], 'the person\'s change stays and nothing is written over it').toBe(`${OFFERS[MALLO]}Alex added this line during the run.\n`);
    expect(first.after[FERRO]).toContain('review_state: reviewed\n');
    expect(archived(first, 'press-1'), 'the request waits').toBe(false);
    const ferroWrites = editsOf(manifestOf(first), await f.id(FERRO)).length;
    const second = await press(f, (ctx) => opsMap({ ...ctx, request: first.request ?? '' }, [REVIEWED]), { words: 'Update these notes.' });
    expect(second.after[MALLO]).toContain('Alex added this line during the run.\n');
    expect(second.after[MALLO]).toContain('review_state: reviewed\n');
    expect(editsOf(manifestOf(second), await f.id(FERRO)), 'a member already as asked is not written again').toHaveLength(0);
    expect(ferroWrites).toBe(1);
    expect(archived(second, 'press-1')).toBe(true);
  });

  it('AC3 b12-set-properties-unreadable-member: a candidate that cannot be read keeps the request waiting; the next run settles it', async () => {
    const zel = `${HUNT}/Zelwick offer.md`;
    const f = await folder({ [zel]: offer('Zelwick') });
    const zelId = await f.id(zel);
    // Ruling 3 (round 3): Drive refuses the whole read of one candidate; its prefix still reads.
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]), { around: (next) => async (input, init) => {
      const at = url(input);
      const ranged = new Headers(init?.headers).has('Range');
      if (at.pathname === `/drive/v3/files/${zelId}` && at.searchParams.get('alt') === 'media' && !ranged) {
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'cannotDownloadFile' }] } }), { status: 403 });
      }
      return next(input, init);
    } });
    expect(refusals(), 'not a refusal of the reply').toEqual([]);
    expect(archived(first, 'press-1'), 'membership is not known: the request waits').toBe(false);
    expect(first.after[zel]).toBe(offer('Zelwick'));
    const second = await press(f, (ctx) => opsMap({ ...ctx, request: first.request ?? '' }, [REVIEWED]), { words: 'Update these notes.' });
    for (const path of [FERRO, MALLO, zel]) expect(second.after[path], path).toContain('review_state: reviewed\n');
    expect(archived(second, 'press-1'), 'the next run settles it').toBe(true);
  });

  it('AC7 b12-set-properties-crash-before-write: a crash before a member write is sent writes it once on redispatch, with no model call', async () => {
    const f = await folder();
    const ferroId = await f.id(FERRO);
    const state = { reached: false };
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]), { around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ferroId}`) {
        state.reached = true;
        throw new TypeError('Made-up crash before the member write.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the member write').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(resumed.after[FERRO]).toBe(swap(OFFERS[FERRO], REVIEW));
    expect(archived(resumed, 'press-1')).toBe(true);
  });

  it.each([['the member write', FERRO], ['the shared note write', PROFILE], ['the requests write', SYSTEM.requests]])(
    'AC7 b12-set-properties-ack-lost: a lost answer after %s completes once on redispatch, with no model call', async (_name, path) => {
      const f = await folder();
      const fileId = await f.id(path);
      let crashed = false;
      const first = await press(f, async (ctx) => resultsMap(ctx, [
        await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'review_state', 'set', 'reviewed'), prop(await ctx.id(PROFILE), 'skills', 'union', ['SQL'])])]),
      { around: (next) => async (input, init) => {
        if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
        if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${fileId}`) {
          const response = await next(input, init);
          crashed = response.ok;
          throw new TypeError('Made-up lost answer after the write.');
        }
        return next(input, init);
      } });
      expect(crashed, 'main reached the write').toBe(true);
      const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
      const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
      expect(phase(resumed)).toBe('done');
      expect(model).not.toHaveBeenCalled();
      expect(resumed.after[FERRO]).toBe(swap(OFFERS[FERRO], REVIEW));
      expect(resumed.after[PROFILE]).toContain('skills: [Python, SQL]\n');
      const rows = (JSON.parse(resumed.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string }> }).done.filter((r) => r.id === 'press-1');
      expect(rows, 'one requests row').toHaveLength(1);
      expect(archived(resumed, 'press-1')).toBe(true);
    });

  it('AC8 b12-set-properties-manifest: the property edit is accepted; each broken rule, resealed alone, is refused', async () => {
    const f = await folder();
    await f.drive.createText(await f.id(SYSTEM.changes), 'rule-1.json', JSON.stringify({ v: 1, id: 'rule-1', device: 'device-1', at: DAY,
      kind: 'rule', what: 'A rule', text: 'Keep offers in Job hunt.' }));
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED, { kind: 'property', key: 'level', mode: 'set', value: 'senior' }]));
    const stored = manifestOf(run);
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const ferroId = await f.id(FERRO);
    const edit = editsOf(stored, ferroId)[0];
    expect(changeKinds(edit), 'one property-set change per key on the member').toEqual(['property-set', 'property-set']);
    expect(await ok(stored)).toBe(true);
    const variant = (change: (e: Record<string, unknown>) => void) => resealed(stored, ferroId, change);
    expect(await ok(await variant(() => undefined)), 'the reseal itself keeps it valid').toBe(true);
    const text = (from: string, to: string) => (e: Record<string, unknown>) => { e.text = String(e.text).replace(from, to); };
    expect(await ok(await variant(text('summary: Ferrowick offers Alex remote work.', 'summary: Changed by the edit.'))), 'another front-matter line').toBe(false);
    expect(await ok(await variant(text('Ferrowick offers Alex remote work.\nRelated', 'Changed body.\nRelated'))), 'a body byte').toBe(false);
    // One key's line set to `to` in the resealed text and in its change together (a new key gets its own change, in key
    // order), so only the value rules can refuse it; each invalid line sits beside a valid twin.
    const line = (key: string, to: string) => (e: Record<string, unknown>) => {
      const changes = e.changes as Array<Record<string, unknown>>;
      const present = new RegExp(`^${key}: .*\n`, 'm');
      e.text = present.test(String(e.text)) ? String(e.text).replace(present, `${to}\n`) : String(e.text).replace('level: senior\n', `level: senior\n${to}\n`);
      const had = changes.find((c) => c.key === key);
      if (had) had.line = to;
      else changes.push({ ...changes[0], key, line: to });
      changes.sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1));
    };
    expect(await ok(await variant(line('level', 'level: junior'))), 'another value its property holds').toBe(true);
    expect(await ok(await variant(line('level', 'level: principal'))), 'a value its property cannot hold').toBe(false);
    expect(await ok(await variant(line('note', 'note: Remote first'))), 'a declared property').toBe(true);
    expect(await ok(await variant(line('preference', 'preference: remote'))), 'a property the type does not declare').toBe(false);
    // Rule 3 (R57): a written value must read back equal through propertyValue.
    expect(await ok(await variant(line('note', 'note: ""'))), 'empty text reads as missing').toBe(false);
    expect(await ok(await variant(line('note', 'note: "   "'))), 'text of spaces only reads as missing').toBe(false);
    expect(await ok(await variant(line('skills', 'skills: [SQL, TypeScript, Go]'))), 'a list that reads back').toBe(true);
    expect(await ok(await variant(line('skills', 'skills: [SQL, TypeScript, ""]'))), 'a list with an empty item is invalid').toBe(false);
    const both = (from: string, to: string) => (e: Record<string, unknown>) => { e.text = String(e.text).replace(from, to); e.beforeText = String(e.beforeText).replace(from, to); };
    expect(await ok(await variant(both('by: bower\n', ''))), 'a person\'s note').toBe(false);
    expect(await ok(await variant(both('review_state: ', 'bower_template: source\nreview_state: '))), 'a Source').toBe(false);
    const records = (ids: string[]) => (e: Record<string, unknown>) => { for (const c of e.changes as Array<Record<string, unknown>>) c.recordIds = ids; };
    expect(await ok(await variant(records(['not-a-request']))), 'a record outside this run').toBe(false);
    expect(JSON.stringify(stored), 'the rule record was admitted in this run').toContain('"rule-1"');
    expect(await ok(await variant(records(['rule-1']))), 'an admitted record that is not a request').toBe(false);
    expect(await ok(await variant(records([]))), 'no record at all').toBe(false);
  });

  it('AC8 b12-set-properties-manifest-tags: a tag edit is held to B7\'s vocabulary; each broken rule, resealed alone next to its passing twin, is refused', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => ({ ...opsMap(ctx, [{ kind: 'tag', mode: 'add', value: 'hybrid' }]), newTags: ['hybrid'] }), { words: 'Tag the active offers in Job hunt as hybrid.' });
    expect(run.after[FERRO], 'a tag this reply adds to the list is written').toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', 'review_state: new\ntags: [hybrid]\n---\n']));
    expect((JSON.parse(run.after[SYSTEM.tags] ?? '{}') as { tags?: string[] }).tags, 'the run grows the list by it').toEqual([...TAGS.tags, 'hybrid']);
    const stored = manifestOf(run);
    const ferroId = await f.id(FERRO);
    expect(changeKinds(editsOf(stored, ferroId)[0]), 'tags need no declaration in the row: one property-set change').toEqual(['property-set']);
    expect(await guardOk(f, stored), 'a tag the run adds to the list').toBe(true);
    // One tags line, set to `to` in the edit and its change; with `before`, the note already had that tags line.
    const tags = (to: string, before?: string) => (e: Record<string, unknown>) => {
      e.text = String(e.text).replace('tags: [hybrid]', to);
      for (const c of e.changes as Array<Record<string, unknown>>) if (c.key === 'tags') c.line = to;
      if (before) e.beforeText = String(e.beforeText).replace('review_state: new\n', `review_state: new\n${before}\n`);
    };
    expect(await guardOk(f, await resealed(stored, ferroId, tags('tags: [remote]'))), 'an installed tag').toBe(true);
    expect(await guardOk(f, await resealed(stored, ferroId, tags('tags: [urgent]'))), 'a tag neither installed nor added by this run').toBe(false);
    expect(await guardOk(f, await resealed(stored, ferroId, tags('tags: [career, remote, hybrid]', 'tags: [career, remote]'))), 'a third tag').toBe(true);
    expect(await guardOk(f, await resealed(stored, ferroId, tags('tags: [career, remote, gardening, hybrid]', 'tags: [career, remote, gardening]'))), 'a fourth tag').toBe(false);
  });

  it('AC9 b12-set-properties-past-edit-cap: twenty members are written in one run, past the eight-edit cap', async () => {
    const many = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`${HUNT}/Offer ${String(i + 1).padStart(3, '0')}.md`, offer(`Offer ${i + 1}`)]));
    const f = await folder(many);
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const written = Object.entries(run.after).filter(([path, text]) => path.startsWith(`${HUNT}/`) && text.includes('review_state: reviewed\n'));
    expect(written, 'all 20 active offers').toHaveLength(20);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC9 b12-set-properties-two-hundred: 200 members are written in one run, past the 200 ordinary operations, and maintain finishes', async () => {
    const f = await folder();
    await grow(f, 198);
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const written = Object.entries(run.after).filter(([path, text]) => path.startsWith(`${HUNT}/`) && text.includes('review_state: reviewed\n'));
    expect(written, 'all 200 active offers').toHaveLength(200);
    expect(phase(run)).toBe('done');
    expect(archived(run, `press-${f.press}`)).toBe(true);
    const idle = await press(f, () => empty, { words: 'Update these notes.' });
    expect(idle.calls, 'the next run is not held by the reads of the 200 written notes').toEqual(['selection', 'execution']);
  }, 120_000);

  it('AC9 b12-set-properties-ledger: a map\'s operations count to 1,000; every other operation keeps the 200 ceiling', () => {
    const timing = new RunTiming();
    // requireOperations(count, items, mapped): `mapped` of the `count` operations are a map's (R18).
    const require = (count: number, mapped: number) => (): unknown => Reflect.apply(timing.requireOperations, timing, [count, 1, mapped]);
    expect(require(1000, 900), 'a map part of 200 members with its moves and link fixes').not.toThrow();
    expect(require(250, 200)).not.toThrow();
    expect(require(201, 0), 'no map: today\'s 200').toThrow(LedgerExhausted);
    expect(require(250, 49), 'the ordinary part over 200').toThrow(LedgerExhausted);
    expect(require(1001, 900), 'over 1,000 in all').toThrow(LedgerExhausted);
  });

  it('AC9 b12-set-properties-idle-after (guard): a run with no request after a map writes nothing', async () => {
    const f = await folder();
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    const idle = await press(f, () => empty, { words: 'Update these notes.' });
    for (const path of [FERRO, MALLO, PAST, PROFILE, SYSTEM.typeTable, SYSTEM.tags]) expect(idle.after[path], path).toBe(first.after[path]);
  });

  it('AC10 b12-set-properties-column: a property asked for that is not a column becomes one; a fourth column is replaced', async () => {
    const f = await folder();
    const run = await press(f, async (ctx) => resultsMap(ctx, [await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'senior')])]), { words: 'Set the level of Ferrowick.' });
    expect(readTypeTable(run.after[SYSTEM.typeTable] ?? null).table.rows.find((r) => r.id === 'offer')?.table).toEqual(['skills', 'review_state', 'level']);
    const full = { v: 1, rows: [{ ...ROW, properties: { ...ROW.properties, a: { type: 'text' }, b: { type: 'text' } }, table: ['skills', 'review_state', 'a', 'b'] }, PROFILE_ROW] };
    const g = await folder({}, { table: full });
    const wide = await press(g, async (ctx) => resultsMap(ctx, [await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'level', 'set', 'senior')])]), { words: 'Set the level of Ferrowick.' });
    expect(readTypeTable(wide.after[SYSTEM.typeTable] ?? null).table.rows.find((r) => r.id === 'offer')?.table).toEqual(['skills', 'review_state', 'a', 'level']);
  });

  it.each([['Ferrowick asks for note first', true], ['Mallowick asks for level first', false]] as const)(
    'AC10 b12-set-properties-one-column: one new column per row per run, for the first property asked for in reply order (%s); the others only get values', async (_name, ferroFirst) => {
      const ask2 = async (ctx: Ctx) => {
        const ferro = await result(ctx, FERRO, [prop(await ctx.id(FERRO), 'note', 'set', 'Remote first')]);
        const mallo = await result(ctx, MALLO, [prop(await ctx.id(MALLO), 'level', 'set', 'junior')]);
        return resultsMap(ctx, ferroFirst ? [ferro, mallo] : [mallo, ferro]);
      };
      const words = 'Note the details of the active offers.';
      const first = ferroFirst ? 'note' : 'level';
      const row = (run: CaseRun) => readTypeTable(run.after[SYSTEM.typeTable] ?? null).table.rows.find((r) => r.id === 'offer')?.table;
      const f = await folder();
      const run = await press(f, ask2, { words });
      expect(row(run)).toEqual(['skills', 'review_state', first]);
      expect(run.after[FERRO], 'a value is written whether or not it got the column').toBe(swap(OFFERS[FERRO], ['review_state: new\n---\n', 'review_state: new\nnote: Remote first\n---\n']));
      expect(run.after[MALLO]).toBe(swap(OFFERS[MALLO], ['review_state: new\n---\n', 'review_state: new\nlevel: junior\n---\n']));
      const full = { v: 1, rows: [{ ...ROW, properties: { ...ROW.properties, a: { type: 'text' }, b: { type: 'text' } }, table: ['skills', 'review_state', 'a', 'b'] }, PROFILE_ROW] };
      const g = await folder({}, { table: full });
      const wide = await press(g, ask2, { words });
      expect(row(wide), 'four columns: one is replaced, once').toEqual(['skills', 'review_state', 'a', first]);
      expect(wide.after[MALLO]).toContain('level: junior\n');
      expect(wide.after[FERRO]).toContain('note: Remote first\n');
    });

  it('AC10 b12-set-properties-column-present (guard): a property that is already a column leaves the type table exact', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => opsMap(ctx, [REVIEWED]));
    expect(run.after[SYSTEM.typeTable]).toBe(JSON.stringify(TABLE, null, 2));
  });
});

const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
/** The stored manifest with one file's edit changed, digests and every id sealed again in order. */
async function resealed(stored: Manifest, fileId: string, change: (e: Record<string, unknown>) => void): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const edit = editsOf(m, fileId)[0];
  if (!edit) throw new Error('The manifest has no edit of that file');
  change(edit.effect);
  edit.effect.content = raw(String(edit.effect.text));
  if (typeof edit.effect.beforeText === 'string') edit.effect.beforeContent = { ...(edit.effect.beforeContent as object), ...raw(edit.effect.beforeText) };
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
  const remapped = JSON.parse([...renamed].reduce((s, [from, to]) => s.split(from).join(to), json)) as Manifest;
  return { ...remapped, operations: m.operations };
}
