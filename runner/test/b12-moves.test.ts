/** B12b through production main: a request moves and renames the notes of a set, with their link consequences (TL-P4-52 Q3). */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { outsideAdmitted, takeAdmitted } from '../src/spine/admitted';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-b12';
const HUNT = 'Projects/Job hunt';
const AMBER = `${HUNT}/Offer amber.md`;
const BIRCH = `${HUNT}/Offer birch.md`;
const SALT = `${HUNT}/Saltmere`;
const LIND = `${HUNT}/Lindenwick`;
const SHORTLIST = `${HUNT}/Alex shortlist.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'concept', properties: { company: { type: 'text' },
  country: { type: 'enum', values: ['Saltmere', 'Lindenwick'] }, review_state: { type: 'enum', values: ['new', 'reviewed'] } }, table: ['company', 'country', 'review_state'] }] };
const TAGS = { v: 1, tags: ['shortlist', 'career'] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const offer = (company: string, country: string, link: string, o: { by?: boolean; extra?: string } = {}) => `---\n${o.by === false ? '' : 'by: bower\n'}type: offer\n`
  + `summary: ${company} offer in ${country}.\nstatus: active\ncreated: 2026-10-06\ncompany: ${company}\ncountry: ${country}\nreview_state: new\ntags: [career]\n${o.extra ?? ''}---\n\n`
  + `## Notes\nAlex wrote this paragraph and keeps it.\n\nRelated: [[${link}]].\n`;
const moc = (name: string) => `---\nby: bower\ntype: moc\nsummary: ${name} offers.\n---\n\n## Notes\nCountry group for ${name}.\n`;
const SHORT = '---\ntype: diary\nsummary: Alex links two offers.\ncustom: Alex\n---\n\n## My thoughts\nI compare [[Offer amber]] with [[Offer birch]]. Keep this sentence.  \n';
const BASE: Record<string, string> = {
  [AMBER]: offer('Ferrowick', 'Saltmere', 'Offer birch'),
  [BIRCH]: offer('Mallowick', 'Lindenwick', 'Offer amber'),
  [`${SALT}/Saltmere.md`]: moc('Saltmere'),
  [`${LIND}/Lindenwick.md`]: moc('Lindenwick'),
  [SHORTLIST]: SHORT,
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

async function folder(files: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'b12-moves', capability: 'C05', title: 'Alex moves a set', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.tags]: JSON.stringify(TAGS, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }),
      'Rules.md': '# Rules\n', ...BASE, ...files } };
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
type Intent = (ctx: Ctx, attempt: number) => unknown;
const empty = { kind: 'tidy-intent', v: 1, things: [] };

async function press(f: Folder, intent: Intent, o: { words?: string; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch; snapshot?: boolean } = {}) {
  f.press++;
  const words = o.words ?? 'Move each active offer into its country folder, name it for its company, mark it reviewed and add shortlist.';
  const request = await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + f.press, newId: () => `b12-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  // The guard's `Admitted` snapshot, taken before execution archives the request (read-only).
  const took = o.snapshot ? await takeAdmitted(admission.manifest, f.drive) : undefined;
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (_call, _step, _attempt, phase) => {
    calls.push(phase);
    if (phase === 'selection') return reply({ items: [], asks: [] });
    return reply(await intent({ request: request.id, hunt, id: f.id }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: `b12-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, request: request.id, admission: admission.manifest, took };
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const set = (ctx: Ctx) => ({ type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE });
const resultsMap = (ctx: Ctx, results: unknown[]) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Organise offers', set: set(ctx), results }] });
const opsMap = (ctx: Ctx, ops: unknown[]) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Organise offers', set: set(ctx), ops }] });
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
/** A member's four closed operations: into a folder, a new name, reviewed and shortlisted. */
async function closed(ctx: Ctx, path: string, to: string, name: string) {
  const id = await ctx.id(path);
  return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(to) }, { kind: 'rename', targetId: id, name },
    { ...REVIEWED, targetId: id }, { kind: 'tag', targetId: id, mode: 'add', value: 'shortlist' }] };
}
const both = async (ctx: Ctx) => resultsMap(ctx, [await closed(ctx, AMBER, SALT, 'Ferrowick offer.md'), await closed(ctx, BIRCH, LIND, 'Mallowick offer.md')]);
const refusals = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => [.../was refused \((\w+)\): (.*); asking once more/.exec(line) ?? []].slice(1, 3));
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const archived = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
type Op = { operationId: string; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
const manifestOf = (run: CaseRun): Manifest => JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
const opsOn = (m: Manifest, kind: string, fileId: string) => (m.operations ?? []).filter((o) => o.effect.kind === kind && (o.effect.before as { fileId: string }).fileId === fileId);
const FINAL_AMBER = `${SALT}/Ferrowick offer.md`;
const FINAL_BIRCH = `${LIND}/Mallowick offer.md`;
/** The member's text after its four operations: two front-matter lines and, when the other member was renamed, its link. */
const done = (text: string, links: Record<string, string> = {}) => Object.entries(links).reduce((t, [from, to]) => t.split(`[[${from}]]`).join(`[[${to}]]`),
  text.replace('review_state: new\n', 'review_state: reviewed\n').replace('tags: [career]\n', 'tags: [career, shortlist]\n'));
const RENAMED = { 'Offer amber': 'Ferrowick offer', 'Offer birch': 'Mallowick offer' };

describe('B12b a request moves and renames the notes of a set', () => {
  it('AC11 b12-moves-closed-ops: each member gets its own edit, then one move with its final name; every link follows its landed move', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const birchId = await f.id(BIRCH);
    const run = await press(f, both);
    expect(run.after[FINAL_AMBER], 'amber: in Saltmere, named for its company, reviewed, shortlisted, its link to birch renamed').toBe(done(BASE[AMBER] ?? '', RENAMED));
    expect(run.after[FINAL_BIRCH]).toBe(done(BASE[BIRCH] ?? '', RENAMED));
    expect(run.after[AMBER]).toBeUndefined();
    expect(run.after[BIRCH]).toBeUndefined();
    expect(run.after[SHORTLIST], 'the person\'s note: only its links change, every other byte stays').toBe(done(SHORT, RENAMED));
    const m = manifestOf(run);
    const birchMove = opsOn(m, 'move', birchId)[0];
    const amberEdits = opsOn(m, 'edit-text', amberId);
    const kinds = (o: Op | undefined) => ((o?.effect.changes ?? []) as Array<{ kind: string }>).map((c) => c.kind);
    const edit = amberEdits.find((o) => !kinds(o).includes('link-rewrite'));
    const moves = opsOn(m, 'move', amberId);
    expect(kinds(edit), 'the member\'s own edit carries only its own changes (R68)').toEqual(['property-set', 'property-set']);
    const fix = amberEdits.find((o) => kinds(o).includes('link-rewrite'));
    expect(kinds(fix), 'its link to birch is a separate fix').toEqual(['link-rewrite']);
    expect(fix?.dependsOn, 'which waits for birch\'s move').toContain(birchMove?.operationId);
    expect(moves, 'one move carrying the name').toHaveLength(1);
    expect(moves[0]?.effect.name).toBe('Ferrowick offer.md');
    expect(moves[0]?.dependsOn, 'the move waits for the member\'s edit').toContain(edit?.operationId);
    expect(opsOn(m, 'edit-text', await f.id(SHORTLIST)), 'one link edit of the person\'s note').toHaveLength(1);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1')).toBe(true);
  });

  it('AC11 b12-moves-ops-move: one rule moves every member into one folder, its content exact', async () => {
    const f = await folder({ [`${HUNT}/Done/Done.md`]: moc('Done') });
    const run = await press(f, async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(`${HUNT}/Done`) }]), { words: 'Move the active offers into Done.' });
    expect(run.after[`${HUNT}/Done/Offer amber.md`]).toBe(BASE[AMBER]);
    expect(run.after[`${HUNT}/Done/Offer birch.md`]).toBe(BASE[BIRCH]);
    expect(run.after[SHORTLIST], 'a move with no new name changes no link').toBe(SHORT);
    expect(phase(run)).toBe('done');
  });

  it('AC11 b12-moves-same-op: identical moves are one move whatever their key order; a move into its own folder under its own name moves nothing', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const birchId = await f.id(BIRCH);
    const run = await press(f, async (ctx) => resultsMap(ctx, [
      { memberId: amberId, ops: [{ kind: 'move', targetId: amberId, parentId: await ctx.id(SALT) }, { parentId: await ctx.id(SALT), targetId: amberId, kind: 'move' }] },
      { memberId: birchId, ops: [{ kind: 'move', targetId: birchId, parentId: ctx.hunt }, { kind: 'rename', targetId: birchId, name: 'Offer birch.md' }] }]),
    { words: 'Move the amber offer into Saltmere and leave birch where it is.' });
    expect(refusals(), 'identical ops are not two different moves').toEqual([]);
    expect(run.after[`${SALT}/Offer amber.md`]).toBe(BASE[AMBER]);
    const m = manifestOf(run);
    expect(opsOn(m, 'move', amberId), 'one move').toHaveLength(1);
    expect(opsOn(m, 'move', birchId), 'already there under that name: no move').toHaveLength(0);
    expect(run.after[BIRCH]).toBe(BASE[BIRCH]);
    expect(run.after[SHORTLIST], 'no name changed: no link changes').toBe(SHORT);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1'), 'both members are done').toBe(true);
  });

  it('AC11 b12-moves-op-limit: a move and a rename count toward the 8 ops of a note: nine are refused once (mapLimit), eight apply', async () => {
    const f = await folder();
    const ops = async (ctx: Ctx, reviewed: number) => {
      const id = await ctx.id(AMBER);
      return resultsMap(ctx, [{ memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(SALT) }, { kind: 'rename', targetId: id, name: 'Ferrowick offer.md' },
        ...Array.from({ length: reviewed }, () => ({ ...REVIEWED, targetId: id }))] }]);
    };
    const run = await press(f, async (ctx, attempt) => ops(ctx, attempt === 0 ? 7 : 6), { words: 'Move, name and review the amber offer.' });
    expect(refusals().slice(0, 2)).toEqual(['mapLimit', 'more than 8 ops for one note']);
    expect(run.after[FINAL_AMBER]).toBe(BASE[AMBER]?.replace('review_state: new\n', 'review_state: reviewed\n'));
    expect(run.after[BIRCH], 'birch\'s link to amber follows').toBe(BASE[BIRCH]?.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(phase(run)).toBe('done');
  });

  it('AC12 b12-moves-links-many: every note linking to a renamed member is fixed in the same run, past the eight-edit cap', async () => {
    const referrers = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Resources/Notes/Note ${i + 1}.md`,
      `---\nby: bower\ntype: concept\nsummary: Note ${i + 1}.\n---\n\n## Notes\nSee [[Offer amber]] for the details ${i + 1}.\n`]));
    const f = await folder(referrers);
    const run = await press(f, async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Ferrowick offer.md' }] }]),
      { words: 'Name the amber offer for its company.' });
    for (const [path, text] of Object.entries(referrers)) expect(run.after[path], path).toBe(text.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(run.after[`${HUNT}/Ferrowick offer.md`]).toBe(BASE[AMBER]);
    expect(run.after[BIRCH], 'birch links to amber: its link follows').toBe(BASE[BIRCH]?.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(phase(run)).toBe('done');
  });

  it('AC12 b12-moves-block-list-links: a renamed member keeps its block list; a link inside another note\'s block list changes only its link bytes', async () => {
    const amber = BASE[AMBER]?.replace('tags: [career]\n', 'tags:\n  - career\n') ?? '';
    const hub = '---\nby: bower\ntype: concept\nsummary: Offer hub.\nrelated:\n  - "[[Offer amber]]"\n  - "[[Offer birch]]"\n---\n\n## Notes\nBoth offers.\n';
    const f = await folder({ [AMBER]: amber, 'Resources/Offer hub.md': hub });
    const run = await press(f, async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Ferrowick offer.md' }] }]),
      { words: 'Name the amber offer for its company.' });
    expect(run.after[`${HUNT}/Ferrowick offer.md`], 'a move never changes content').toBe(amber);
    expect(run.after['Resources/Offer hub.md'], 'the block list stays a block list').toBe(hub.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(phase(run)).toBe('done');
  });

  it('AC13 b12-moves-person-and-source: a person\'s note and a Source move with their bytes exact', async () => {
    const person = offer('Saltwick', 'Saltmere', 'Offer amber', { by: false });
    const source = offer('Sourcewick', 'Saltmere', 'Offer amber', { extra: 'bower_template: source\n' });
    const f = await folder({ [`${HUNT}/Alex offer.md`]: person, [`${HUNT}/Workshop offer.md`]: source });
    const run = await press(f, async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(SALT) }]), { words: 'Move the active offers into Saltmere.' });
    expect(run.after[`${SALT}/Alex offer.md`]).toBe(person);
    expect(run.after[`${SALT}/Workshop offer.md`]).toBe(source);
    expect(phase(run)).toBe('done');
  });

  it.each([['amber is first in set order', false], ['birch is first in set order', true]] as const)(
    'AC13 b12-moves-same-name: two members asking for one free name in one folder: the first in set order takes it (%s), the other stays, unavailable', async (_name, birchFirst) => {
      const birch = birchFirst ? (BASE[BIRCH] ?? '').replace('created: 2026-10-06', 'created: 2026-10-07') : BASE[BIRCH] ?? '';
      const f = await folder({ [BIRCH]: birch });
      const into = async (ctx: Ctx, path: string) => {
        const id = await ctx.id(path);
        return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(SALT) }, { kind: 'rename', targetId: id, name: 'Shared offer.md' }] };
      };
      const run = await press(f, async (ctx) => resultsMap(ctx, [await into(ctx, AMBER), await into(ctx, BIRCH)]), { words: 'Move both offers into Saltmere as Shared offer.' });
      const named = Object.keys(run.after).filter((path) => path.endsWith('/Shared offer.md'));
      expect(named, 'one note takes the name: no overwrite, no duplicate').toEqual([`${SALT}/Shared offer.md`]);
      const [winner, loser, loserText, winnerOld] = birchFirst ? [birch, AMBER, BASE[AMBER] ?? '', 'Offer birch'] : [BASE[AMBER] ?? '', BIRCH, birch, 'Offer amber'];
      expect(run.after[`${SALT}/Shared offer.md`]).toBe(winner);
      expect(run.after[loser], 'the other stays where it was; only its link to the winner follows').toBe(loserText.replace(`[[${winnerOld}]]`, '[[Shared offer]]'));
      expect(run.after[SHORTLIST]).toBe(SHORT.replace(`[[${winnerOld}]]`, '[[Shared offer]]'));
      expect(phase(run)).toBe('done');
      expect(archived(run, 'press-1'), 'done or unavailable: the request is settled').toBe(true);
    });

  it('AC12 b12-moves-taken-title: when another note keeps the old name, bare links stay as they are (the existing taken-name rule)', async () => {
    const twin = '---\nby: bower\ntype: concept\nsummary: Another note named Offer amber.\n---\n\n## Notes\nA different amber.\n';
    const f = await folder({ 'Resources/Offer amber.md': twin });
    const run = await press(f, async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Ferrowick offer.md' }] }]),
      { words: 'Name the amber offer in Job hunt for its company.' });
    expect(run.after[`${HUNT}/Ferrowick offer.md`], 'the member is renamed').toBe(BASE[AMBER]);
    expect(run.after[SHORTLIST], 'a bare link may mean the other note: it stays').toBe(SHORT);
    expect(run.after[BIRCH]).toBe(BASE[BIRCH]);
    expect(run.after['Resources/Offer amber.md']).toBe(twin);
    expect(phase(run)).toBe('done');
  });

  it('AC12 b12-moves-taken-title (recursive set): two members share a title; one only changes folder and keeps it, so the other\'s rename leaves bare links as they are', async () => {
    const twin = offer('Saltwick', 'Saltmere', 'Offer birch');
    const f = await folder({ [`${SALT}/Offer amber.md`]: twin });
    const twinId = await f.id(`${SALT}/Offer amber.md`);
    const amberId = await f.id(AMBER);
    const run = await press(f, async (ctx) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Organise offers', set: { ...set(ctx), recursive: true }, results: [
      { memberId: amberId, ops: [{ kind: 'move', targetId: amberId, parentId: await ctx.id(LIND) }] },
      { memberId: twinId, ops: [{ kind: 'rename', targetId: twinId, name: 'Saltwick offer.md' }] }] }] }),
    { words: 'Move the amber offer into Lindenwick and name the Saltmere one for its company.' });
    expect(refusals()).toEqual([]);
    expect(run.after[`${LIND}/Offer amber.md`], 'the folder-only move lands, its title kept').toBe(BASE[AMBER]);
    expect(run.after[`${SALT}/Saltwick offer.md`], 'the rename lands').toBe(twin);
    expect(run.after[SHORTLIST], 'a bare link may mean the note that kept the title: it stays').toBe(SHORT);
    expect(run.after[BIRCH]).toBe(BASE[BIRCH]);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1')).toBe(true);
  });

  it.each([['amber\'s request is older', true], ['birch\'s request is older', false]] as const)(
    'AC13 b12-moves-same-name (two requests): reservations span the run; %s, so its member takes the name and the younger one stays unmade', async (_name, amberOlder) => {
      const f = await folder();
      const words = 'Move birch into Saltmere as Shared offer.';
      // `other-1` is the older request when amber's map answers it (R52: by record `at`).
      const other = (await f.drive.createText(await f.id(SYSTEM.changes), 'other-1.json', JSON.stringify({ v: 1, id: 'other-1', device: 'device-1',
        at: amberOlder ? DAY - 1 : DAY + 100, kind: 'request', what: `Asked Bower: "${words}"`, text: words }))).id;
      const into = async (ctx: Ctx, path: string) => {
        const id = await ctx.id(path);
        return [{ memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(SALT) }, { kind: 'rename', targetId: id, name: 'Shared offer.md' }] }];
      };
      const run = await press(f, async (ctx) => ({ ...empty, maps: [
        { requestId: ctx.request, title: 'Organise birch', set: set(ctx), results: await into(ctx, BIRCH) },
        { requestId: other, title: 'Organise amber', set: set(ctx), results: await into(ctx, AMBER) }] }), { words: 'Move amber into Saltmere as Shared offer.' });
      expect(refusals()).toEqual([]);
      const named = Object.keys(run.after).filter((path) => path.endsWith('/Shared offer.md'));
      expect(named, 'one note takes the name: no overwrite, no duplicate').toEqual([`${SALT}/Shared offer.md`]);
      const [winner, loser, loserText, winnerOld] = amberOlder ? [BASE[AMBER], BIRCH, BASE[BIRCH] ?? '', 'Offer amber'] : [BASE[BIRCH], AMBER, BASE[AMBER] ?? '', 'Offer birch'];
      expect(run.after[`${SALT}/Shared offer.md`]).toBe(winner);
      expect(run.after[loser], 'the younger request\'s member stays unmade; only its link to the winner follows').toBe(loserText.replace(`[[${winnerOld}]]`, '[[Shared offer]]'));
      expect(vi.mocked(console.error).mock.calls.flat().map(String).some((line) => line.includes('Another note in this request takes that name.')), 'its reason').toBe(true);
      expect(phase(run)).toBe('done');
    });

  it('AC13 b12-moves-name-taken: a folder already holding that name leaves that member where it is; the other moves', async () => {
    const taken = offer('Other', 'Saltmere', 'Offer birch');
    const f = await folder({ [FINAL_AMBER]: taken });
    const run = await press(f, both);
    expect(run.after[FINAL_AMBER], 'the note already there changes only its link to birch, renamed (R28)').toBe(taken.replace('[[Offer birch]]', '[[Mallowick offer]]'));
    expect(run.after[AMBER], 'the member that cannot take the name stays, none of its operations made; only its link to birch follows')
      .toBe(BASE[AMBER]?.replace('[[Offer birch]]', '[[Mallowick offer]]'));
    expect(run.after[FINAL_BIRCH]).toBeDefined();
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1'), 'done or unavailable: the request is settled').toBe(true);
  });

  it('AC12 b12-moves-source-referrer: a Source linking to a member keeps its bytes; that member stays, its operations unmade, with its reason; the other moves', async () => {
    const source = '---\nby: bower\ntype: source\nsummary: Workshop notes.\n---\n\n## Notes\nAlex heard about [[Offer amber]] here.\n';
    const f = await folder({ 'Resources/Workshop.md': source });
    const run = await press(f, both);
    expect(run.after['Resources/Workshop.md'], 'a Source\'s prose is never rewritten').toBe(source);
    expect(run.after[AMBER], 'amber stays, none of its operations made; only its link to birch follows').toBe(BASE[AMBER]?.replace('[[Offer birch]]', '[[Mallowick offer]]'));
    expect(run.after[FINAL_BIRCH], 'birch is edited and moved; amber kept its name, so birch\'s link stays').toBe(done(BASE[BIRCH] ?? ''));
    expect(run.after[SHORTLIST]).toBe(SHORT.replace('[[Offer birch]]', '[[Mallowick offer]]'));
    expect(vi.mocked(console.error).mock.calls.flat().map(String).some((line) => line.includes('A note that links to it cannot be updated.')), 'the exact unavailable reason').toBe(true);
    expect(phase(run)).toBe('done');
    expect(archived(run, 'press-1'), 'done or unavailable: the request is settled').toBe(true);
  });
});

describe('B12b refusals', () => {
  const MOVE_BINDING = "a move or a rename of a note other than its result's note";
  const cases: Array<{ name: string; kind: string; why: string; entry: (ctx: Ctx) => Promise<unknown> }> = [
    { name: 'a rename in ops', kind: 'mapKeys', why: 'a rename in "ops": a name belongs to one note', entry: async (ctx) => opsMap(ctx, [{ kind: 'rename', name: 'Offer.md' }]) },
    { name: 'a name that changes what a note is', kind: 'mapKeys', why: 'a name that changes what a note is or says nothing',
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Ferrowick offer.txt' }] }]) },
    { name: 'a name that says nothing', kind: 'mapKeys', why: 'a name that changes what a note is or says nothing',
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Offer_final(2).md' }] }]) },
    { name: 'a move of another member', kind: 'mapBinding', why: MOVE_BINDING,
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'move', targetId: await ctx.id(BIRCH), parentId: await ctx.id(SALT) }] }]) },
    { name: 'a rename of a note outside the set', kind: 'mapBinding', why: MOVE_BINDING,
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id('Rules.md'), name: 'Changed rules.md' }] }]) },
    { name: 'a move into a note', kind: 'mapBinding', why: 'a move to a folder that is not one of the main folders',
      entry: async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(SHORTLIST) }]) },
    { name: 'a move into Bower\'s own folder', kind: 'mapBinding', why: 'a move to a folder that is not one of the main folders',
      entry: async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(SYSTEM.dir) }]) },
    { name: 'an empty name', kind: 'mapKeys', why: 'a name that changes what a note is or says nothing',
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: '' }] }]) },
    { name: 'an empty folder', kind: 'mapBinding', why: 'a move to a folder that is not one of the main folders', entry: async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: '' }]) },
    { name: 'two different moves for one note', kind: 'mapKeys', why: 'two different moves or names for one note',
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'move', targetId: await ctx.id(AMBER), parentId: await ctx.id(SALT) },
        { kind: 'move', targetId: await ctx.id(AMBER), parentId: await ctx.id(LIND) }] }]) },
    { name: 'two different names for one note', kind: 'mapKeys', why: 'two different moves or names for one note',
      entry: async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(AMBER), ops: [{ kind: 'rename', targetId: await ctx.id(AMBER), name: 'Ferrowick offer.md' },
        { kind: 'rename', targetId: await ctx.id(AMBER), name: 'Amber offer.md' }] }]) },
    { name: 'two different moves in ops', kind: 'mapKeys', why: 'two different moves or names for one note',
      entry: async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(SALT) }, { kind: 'move', parentId: await ctx.id(LIND) }]) },
  ];
  it.each(cases)('AC11 b12-moves-refusals: $name is refused once with its own kind and reason; the corrected reply applies', async ({ kind, why, entry }) => {
    const f = await folder();
    const run = await press(f, async (ctx, attempt) => attempt === 0 ? entry(ctx) : both(ctx));
    expect(refusals().slice(0, 2)).toEqual([kind, why]);
    expect(run.after[FINAL_AMBER]).toBeDefined();
    expect(run.after['Rules.md']).toBe('# Rules\n');
    expect(phase(run)).toBe('done');
  });
});

describe('B12b guard and recovery', () => {
  it('AC14 b12-moves-manifest: a member\'s edit then move is accepted; a move that does not wait for its edit, or of a file outside the set, is refused', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const run = await press(f, both, { snapshot: true });
    const stored = manifestOf(run);
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    expect(opsOn(stored, 'move', amberId), 'the stored manifest moves the member').toHaveLength(1);
    expect(await ok(stored)).toBe(true);
    expect(await ok(await resealed(stored, () => undefined)), 'the reseal itself keeps it valid').toBe(true);
    expect(await ok(await resealed(stored, (m) => { const move = opsOn(m, 'move', amberId)[0]; if (move) move.dependsOn = []; })), 'a move that does not wait for its edit').toBe(false);
    // A link fix's `renames` and its text change together, so only the tie to this run's moves can refuse it (R62).
    const relinked = (moveToo: boolean) => (m: Manifest) => {
      for (const op of m.operations.filter((o) => o.effect.kind === 'edit-text')) {
        const changes = (op.effect.changes ?? []) as Array<{ kind: string; renames?: Array<{ from: string; to: string }> }>;
        const fix = changes.find((c) => c.kind === 'link-rewrite')?.renames?.find((r) => r.from === 'Offer amber');
        if (!fix) continue;
        fix.to = 'Elsewhere offer';
        op.effect.text = String(op.effect.text).split('[[Ferrowick offer]]').join('[[Elsewhere offer]]');
      }
      const move = opsOn(m, 'move', amberId)[0];
      if (moveToo && move) move.effect.name = 'Elsewhere offer.md';
    };
    expect(await ok(await resealed(stored, relinked(true))), 'the move and every link fix name the same new name').toBe(true);
    expect(await ok(await resealed(stored, relinked(false))), 'a link fix to a name no move of the run gives').toBe(false);
    // R68: a link fix waits for its target's move; the person's note links both members, so its fix waits for both.
    const shortFix = opsOn(stored, 'edit-text', await f.id(SHORTLIST))[0];
    const amberMove = opsOn(stored, 'move', amberId)[0];
    expect(shortFix?.dependsOn, 'the link fix waits for the move it follows').toContain(amberMove?.operationId);
    expect(await ok(await resealed(stored, (m) => {
      const fix = opsOn(m, 'edit-text', shortFix ? (shortFix.effect.before as { fileId: string }).fileId : '')[0];
      const move = opsOn(m, 'move', amberId)[0];
      if (fix && move) fix.dependsOn = fix.dependsOn.filter((d) => d !== move.operationId);
    })), 'a link fix that does not wait for its target\'s move').toBe(false);
    const took = run.took;
    if (!took) throw new Error('The press took no snapshot');
    const own = await f.id(SYSTEM.dir);
    expect(outsideAdmitted(stored as never, took, own), 'the member moves are admitted by their request').toBeNull();
    const rulesId = await f.id('Rules.md');
    const stray = await resealed(stored, (m) => { const move = opsOn(m, 'move', amberId)[0]; if (move) move.effect.before = { ...(move.effect.before as object), fileId: rulesId, name: 'Rules.md' }; });
    expect(outsideAdmitted(stray as never, took, own), 'a move of a file outside the set').toBe('a move of a thing it was not admitted to take');
  });

  it('AC14 b12-moves-authority: a map move needs an admitted request of this run; membership alone grants nothing', async () => {
    const f = await folder({ [`${HUNT}/Done/Done.md`]: moc('Done') });
    await f.drive.createText(await f.id(SYSTEM.changes), 'rule-1.json', JSON.stringify({ v: 1, id: 'rule-1', device: 'device-1', at: DAY,
      kind: 'rule', what: 'A rule', text: 'Keep offers in Job hunt.' }));
    const amberId = await f.id(AMBER);
    const run = await press(f, async (ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(`${HUNT}/Done`) }]), { words: 'Move the active offers into Done.' });
    const stored = manifestOf(run);
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const move = opsOn(stored, 'move', amberId)[0];
    expect(move?.effect.recordIds, 'a move-only map: the move names its request').toEqual(['press-1']);
    expect(opsOn(stored, 'edit-text', amberId), 'no edit carries the authority').toHaveLength(0);
    expect(await ok(stored), 'the valid move-only map').toBe(true);
    expect(await ok(await resealed(stored, () => undefined)), 'the reseal itself keeps it valid').toBe(true);
    // A request written after this run's capture: deferred, never admitted here.
    await f.drive.createText(await f.id(SYSTEM.changes), 'later-1.json', JSON.stringify({ v: 1, id: 'later-1', device: 'device-1', at: DAY + 50,
      kind: 'request', what: 'Asked Bower: "Move them back."', text: 'Move them back.' }));
    const records = (ids: string[]) => (m: Manifest) => { for (const o of m.operations.filter((x) => x.effect.kind === 'move')) o.effect.recordIds = ids; };
    expect(await ok(await resealed(stored, records(['not-a-request']))), 'an absent request').toBe(false);
    expect(await ok(await resealed(stored, records(['later-1']))), 'a deferred request, not in this run\'s capture').toBe(false);
    expect(JSON.stringify(stored.capture ?? {}), 'the rule record was admitted in this run').toContain('"rule-1"');
    expect(await ok(await resealed(stored, records(['rule-1']))), 'a captured record that is not a request').toBe(false);
    expect(await ok(await resealed(stored, records([]))), 'no record: membership alone').toBe(false);
  });

  it('AC14 b12-moves-crash-before-move: a crash before the move is sent moves it once on redispatch, with no model call', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const state = { reached: false };
    const first = await press(f, both, { around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${amberId}` && url(input).searchParams.has('addParents')) {
        state.reached = true;
        throw new TypeError('Made-up crash before the move.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the move').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(resumed.after[FINAL_AMBER]).toBe(done(BASE[AMBER] ?? '', RENAMED));
    expect(resumed.after[AMBER]).toBeUndefined();
  });

  it.each([['the move', AMBER, true], ['a link fix', SHORTLIST, false]])('AC14 b12-moves-ack-lost: a lost answer after %s completes once on redispatch, with no model call', async (_name, path, isMove) => {
    const f = await folder();
    const fileId = await f.id(path);
    let crashed = false;
    const first = await press(f, both, { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      const hit = isMove ? url(input).pathname === `/drive/v3/files/${fileId}` && url(input).searchParams.has('addParents') : url(input).pathname === `/upload/drive/v3/files/${fileId}`;
      if (init?.method === 'PATCH' && hit) {
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
    expect(resumed.after[FINAL_AMBER]).toBe(done(BASE[AMBER] ?? '', RENAMED));
    expect(resumed.after[SHORTLIST]).toBe(done(SHORT, RENAMED));
    expect(archived(resumed, 'press-1')).toBe(true);
  });

  it('AC14 b12-moves-unreadable-member: a candidate that cannot be read keeps the request waiting, nothing moved; the next run moves', async () => {
    const zel = `${HUNT}/Offer zel.md`;
    const f = await folder({ [zel]: offer('Zelwick', 'Saltmere', 'Offer amber') });
    const zelId = await f.id(zel);
    const first = await press(f, both, { around: (next) => async (input, init) => {
      const at = url(input);
      if (at.pathname === `/drive/v3/files/${zelId}` && at.searchParams.get('alt') === 'media' && !new Headers(init?.headers).has('Range')) {
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'cannotDownloadFile' }] } }), { status: 403 });
      }
      return next(input, init);
    } });
    expect(refusals(), 'not a refusal of the reply').toEqual([]);
    expect(archived(first, 'press-1'), 'membership is not known: the request waits').toBe(false);
    for (const [path, text] of Object.entries(BASE)) expect(first.after[path], `${path}: nothing moved, renamed or relinked`).toBe(text);
    const second = await press(f, async (ctx) => resultsMap({ ...ctx, request: first.request }, [await closed(ctx, AMBER, SALT, 'Ferrowick offer.md'),
      await closed(ctx, BIRCH, LIND, 'Mallowick offer.md'), { memberId: zelId, ops: [{ kind: 'move', targetId: zelId, parentId: ctx.hunt }] }]), { words: 'Update these notes.' });
    expect(second.after[FINAL_AMBER]).toBe(done(BASE[AMBER] ?? '', RENAMED));
    expect(archived(second, 'press-1'), 'the next run settles it').toBe(true);
  });

  it('AC14 b12-moves-mutual-failed-move: two members link each other and one move fails: each link follows only its own target\'s landed move', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const only = async (ctx: Ctx, path: string, to: string, name: string) => {
      const id = await ctx.id(path);
      return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(to) }, { kind: 'rename', targetId: id, name }] };
    };
    // Drive refuses amber's move for good; amber's bytes and version are untouched.
    const run = await press(f, async (ctx) => resultsMap(ctx, [await only(ctx, AMBER, SALT, 'Ferrowick offer.md'), await only(ctx, BIRCH, LIND, 'Mallowick offer.md')]),
      { words: 'Move each offer into its country folder and name it for its company.', around: (next) => async (input, init) => {
        if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${amberId}` && url(input).searchParams.has('addParents')) {
          return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'insufficientFilePermissions' }] } }), { status: 403 });
        }
        return next(input, init);
      } });
    expect(run.after[FINAL_AMBER], 'amber\'s move did not land').toBeUndefined();
    // A link fix waits, whole, for every move it follows and for its own note's move (engine.ts dependency rule; ruling c).
    expect(run.after[AMBER], 'amber stays, its bytes exact: its own link fix waits for its own move').toBe(BASE[AMBER]);
    expect(run.after[FINAL_BIRCH], 'birch moved; its link fix follows amber\'s move, which failed').toBe(BASE[BIRCH]);
    expect(run.after[SHORTLIST], 'the shared link fix waits whole: no partial fix').toBe(SHORT);
    expect(archived(run, 'press-1'), 'a move that did not land keeps the request waiting').toBe(false);
    // The next run retries amber as an ordinary waiting part of the request; links to amber follow its landed move.
    // Links to birch, which moved in the run before, keep its old name (no carry-over; B8's lint reports them).
    const next = await press(f, async (ctx) => resultsMap({ ...ctx, request: run.request }, [await only(ctx, AMBER, SALT, 'Ferrowick offer.md')]), { words: 'Update these notes.' });
    expect(next.after[FINAL_AMBER], 'amber moves; its link to birch stays as written').toBe(BASE[AMBER]);
    expect(next.after[FINAL_BIRCH], 'birch\'s link to amber follows amber now').toBe(BASE[BIRCH]?.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(next.after[SHORTLIST], 'only the link to amber follows').toBe(SHORT.replace('[[Offer amber]]', '[[Ferrowick offer]]'));
    expect(archived(next, 'press-1'), 'the retried part settles the request').toBe(true);
  });

  it('AC14 b12-moves-ack-lost-partial: one move fails and one lands with its answer lost: redispatch writes nothing again, calls no model, and the shared link fix waits', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    const birchId = await f.id(BIRCH);
    const shortId = await f.id(SHORTLIST);
    const only = async (ctx: Ctx, path: string, to: string, name: string) => {
      const id = await ctx.id(path);
      return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(to) }, { kind: 'rename', targetId: id, name }] };
    };
    // Amber's move fails by `stillAsSeen`: the person renames it during the run, after the reply was built.
    let answer: unknown;
    let crashed = false;
    const first = await press(f, async (ctx) => {
      answer ??= resultsMap(ctx, [await only(ctx, AMBER, SALT, 'Ferrowick offer.md'), await only(ctx, BIRCH, LIND, 'Mallowick offer.md')]);
      if ((await f.drive.get(amberId)).name !== 'Amber, by Alex.md') await f.drive.update(amberId, { name: 'Amber, by Alex.md' });
      return answer;
    }, { words: 'Move each offer into its country folder and name it for its company.', around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${birchId}` && url(input).searchParams.has('addParents')) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'birch\'s move reached Drive').toBe(true);
    const writes: string[] = [];
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} }, around: (next) => async (input, init) => {
      const at = url(input).pathname;
      if (init?.method === 'PATCH' && [amberId, birchId, shortId].some((id) => at.endsWith(`/files/${id}`))) writes.push(at);
      return next(input, init);
    } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(writes, 'no write is sent again, and no link fix is written').toEqual([]);
    expect(resumed.after[`${HUNT}/Amber, by Alex.md`], 'amber keeps the person\'s name and its bytes').toBe(BASE[AMBER]);
    expect(resumed.after[FINAL_BIRCH], 'birch is moved once; its link fix waits for amber\'s move').toBe(BASE[BIRCH]);
    expect(resumed.after[SHORTLIST], 'the shared link fix waits whole').toBe(SHORT);
    expect(archived(resumed, 'press-1'), 'the request waits').toBe(false);
  });

  it('AC14 b12-moves-person-renamed: a member the person renames during the run keeps the person\'s name; the request waits', async () => {
    const f = await folder();
    const amberId = await f.id(AMBER);
    let renamed = false;
    let failure: unknown = null;
    let answer: unknown;
    const first = await press(f, async (ctx) => {
      try {
        // The reply is built once, from the names as the run read them, before the person renames amber.
        answer ??= await both(ctx);
        if (!renamed) {
          renamed = true;
          await f.drive.update(amberId, { name: 'Amber, by Alex.md' });
        }
        return answer;
      } catch (e) {
        failure = e;
        throw e;
      }
    });
    expect(renamed).toBe(true);
    expect(failure, 'no fixture or model error').toBeNull();
    expect(refusals(), 'the reply is not refused').toEqual([]);
    expect(phase(first)).toBe('done');
    expect(first.after[FINAL_AMBER]).toBeUndefined();
    // Amber's version changed under the person's rename: neither its own edit, its move nor its link fix lands (R20, R31).
    expect(first.after[`${HUNT}/Amber, by Alex.md`], 'the person\'s name stays, its bytes too').toBe(BASE[AMBER]);
    expect(first.after[BIRCH], 'birch\'s move succeeds').toBeUndefined();
    expect(first.after[FINAL_BIRCH], 'birch is edited and moved; its link to amber follows no move that failed').toBe(done(BASE[BIRCH] ?? ''));
    expect(first.after[SHORTLIST], 'the shared link fix waits whole for amber\'s move, which failed (ruling c)').toBe(SHORT);
    expect(archived(first, 'press-1'), 'the request waits').toBe(false);
  });

  it('AC14 b12-moves-referrer-edited: a note linking to a member that the person edits during the run keeps the edit', async () => {
    const f = await folder();
    const shortId = await f.id(SHORTLIST);
    let edited = false;
    const first = await press(f, async (ctx) => {
      if (!edited) {
        edited = true;
        await f.drive.writeText(shortId, `${SHORT}Alex added this line during the run.\n`, (await f.drive.get(shortId)).modifiedTime);
      }
      return both(ctx);
    });
    expect(edited).toBe(true);
    expect(first.after[SHORTLIST], 'nothing is written over the person\'s change').toBe(`${SHORT}Alex added this line during the run.\n`);
    expect(first.after[FINAL_AMBER]).toBe(done(BASE[AMBER] ?? '', RENAMED));
    expect(phase(first)).toBe('done');
    expect(archived(first, 'press-1'), 'a link fix not made keeps the request waiting').toBe(false);
  });
});

const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
/** The stored manifest changed by `change`, every edit's digest and every id sealed again in order. */
async function resealed(stored: Manifest, change: (m: Manifest) => void): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  change(m);
  for (const op of m.operations) if (op.effect.kind === 'edit-text') op.effect.content = raw(String(op.effect.text));
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
