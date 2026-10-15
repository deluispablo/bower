/** B12c through production main: one readable result note per settled map request; the corpus cases land (TL-P4-52 Q7). */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTypeTable } from '../../src/data/contracts/note-format';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { generatedName, REQUEST_DONE } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { caseReplies, redispatchCase, runOnDrive, runWithClaude, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const DAY = Date.UTC(2026, 9, 7, 9);
const TOKEN = 'made-up-credential-b12';
const HUNT = 'Projects/Job hunt';
const PROFILE = 'Areas/Career/Career profile.md';
const FERRO = `${HUNT}/Ferrowick offer.md`;
const MALLO = `${HUNT}/Mallowick offer.md`;
const NOTE = `${HUNT}/Request - Review offers.md`;
const NOTE2 = `${HUNT}/Request - Review offers (2).md`;
const TABLE = { v: 1, rows: [
  { id: 'offer', match: ['job offer'], template: 'concept', properties: { skills: { type: 'list' }, review_state: { type: 'enum', values: ['new', 'reviewed'] }, focus: { type: 'text' } }, table: ['skills', 'review_state'] },
  { id: 'career-profile', match: ['career profile'], template: 'concept', properties: { skills: { type: 'list' }, focus: { type: 'text' } }, table: ['skills'] }] };
const TAGS = { v: 1, tags: ['career', 'shortlist', 'remote', 'gardening'] };
const ACTIVE = { op: 'eq', property: 'status', value: 'active' };
const offer = (name: string, o: { skills?: string; tags?: string; by?: boolean } = {}) => `---\n${o.by === false ? '' : 'by: bower\n'}type: offer\n`
  + `summary: ${name} offers Alex remote work.\nstatus: active\ncreated: 2026-10-06\n${o.skills ? `skills: ${o.skills}\n` : ''}review_state: new\n${o.tags ? `tags: ${o.tags}\n` : ''}---\n\n`
  + `## Notes\n${name} offers Alex remote work.\n`;
const PROFILE_TEXT = '---\nby: bower\ntype: career-profile\nsummary: Alex keeps a list of skills.\nskills: [Python]\n---\n\n## Notes\nAlex wants to keep this paragraph exactly.\n';
const OFFERS: Record<string, string> = { [FERRO]: offer('Ferrowick', { skills: '[SQL, TypeScript]' }), [MALLO]: offer('Mallowick', { skills: '[dbt, SQL]' }) };
const WORDS = 'Add the skills from the active offers in Job hunt to Career profile.';

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
  const c: LoadedCase = { id: 'b12-result-note', capability: 'C05', title: 'Alex reads a request result', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [], inbox: [], inboxFiles: {},
    folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), [SYSTEM.tags]: JSON.stringify(TAGS, null, 2), [SYSTEM.requests]: JSON.stringify({ v: 1, done: [] }),
      'Rules.md': '# Rules\n', [PROFILE]: PROFILE_TEXT, ...OFFERS, ...files } };
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
type Ctx = { request: string; hunt: string; id: (path: string) => Promise<string>; things?: Array<{ fileId: string; name: string }> };
const empty = { kind: 'tidy-intent', v: 1, things: [] };

async function press(f: Folder, intent: (ctx: Ctx, attempt: number) => unknown, o: { words?: string; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch; pile?: number; extra?: Record<string, string> } = {}) {
  f.press++;
  const words = o.words ?? WORDS;
  if (o.pile || o.extra) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'File these letters with my job hunt.\n');
    for (const [name, text] of Object.entries(o.extra ?? {})) await f.drive.createText(pile.id, name, text);
    for (let i = 1; i <= (o.pile ?? 0); i++) await f.drive.createText(pile.id, `Letter ${String(i).padStart(3, '0')}.txt`, `Alex received letter ${i}.\n`);
  }
  const scope = o.pile || o.extra ? 'all' : 'instructions';
  const request = await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1,
    id: `press-${f.press}`, device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b12-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }>; piles?: Array<{ things: Array<{ fileId: string; name: string }> }> };
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((x) => ({ itemId: x.itemId, kind: 'unknown', destination: hunt, wants: [] })), asks: [] });
    return reply(await intent({ request: request.id, hunt, id: f.id, things: (frame.piles ?? []).flatMap((p) => p.things) }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: `b12-run-${f.press}` }, env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, request: request.id };
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const set = (ctx: Ctx) => ({ type: 'offer', folderId: ctx.hunt, recursive: false, where: ACTIVE });
const resultsMap = (ctx: Ctx, results: unknown[]) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers', set: set(ctx), results }] });
const opsMap = (ctx: Ctx, ops: unknown[]) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers', set: set(ctx), ops }] });
const union = async (ctx: Ctx, path: string, value: string[]) => ({ memberId: await ctx.id(path), ops: [{ kind: 'property', targetId: await ctx.id(PROFILE), key: 'skills', mode: 'union', value }] });
const shared = async (ctx: Ctx) => resultsMap(ctx, [await union(ctx, FERRO, ['SQL', 'TypeScript']), await union(ctx, MALLO, ['dbt', 'SQL'])]);
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const bodyOf = async (init?: RequestInit) => (init?.body == null ? '' : await new Response(init.body).text());
/** The name in the metadata part of a multipart upload that creates a file; never a body that merely mentions it. */
async function createdName(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (init?.method !== 'POST' || url(input).pathname !== '/upload/drive/v3/files') return null;
  const meta = /\r\n\r\n(\{[^\r\n]*\})\r\n/.exec(await bodyOf(init))?.[1];
  try { return meta ? (JSON.parse(meta) as { name?: string }).name ?? null : null; } catch { return null; }
}
const manifestStored = async (f: Folder) => (await f.drive.listAll(f.root)).some((x) => /^manifest-[0-9a-f]{64}\.json$/.test(x.name));
const noteStored = async (f: Folder) => (await f.drive.listAll(f.root)).some((x) => x.name === 'Request - Review offers.md');
const archived = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
/** A request record written before the press, older or younger by `at`; its Drive id. */
async function ask(f: Folder, name: string, words: string, at: number): Promise<string> {
  const file = await f.drive.createText(await f.id(SYSTEM.changes), `${name}.json`, JSON.stringify({ v: 1, id: name, device: 'device-1', at,
    kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  return file.id;
}
const REVIEWED = { kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' };
const refused403 = (fileId: string) => (next: typeof globalThis.fetch): typeof globalThis.fetch => async (input, init) => {
  const at = url(input);
  if (at.pathname === `/drive/v3/files/${fileId}` && at.searchParams.get('alt') === 'media' && !new Headers(init?.headers).has('Range')) {
    return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'cannotDownloadFile' }] } }), { status: 403 });
  }
  return next(input, init);
};
const notes = (run: CaseRun) => Object.keys(run.after).filter((path) => /\/Request - [^/]*\.md$/.test(path));
/** The first attempt: Drive refuses the requests write after the result note is created, so the request stays pending. */
async function refusedBookkeeping(f: Folder) {
  const requestsId = await f.id(SYSTEM.requests);
  const first = await press(f, shared, { around: (next) => async (input, init) => {
    if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${requestsId}`) {
      return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'insufficientFilePermissions' }] } }), { status: 403 });
    }
    return next(input, init);
  } });
  expect(notes(first), 'the note was created before the bookkeeping').toEqual([NOTE]);
  expect(archived(first, 'press-1'), 'not settled: its bookkeeping did not complete').toBe(false);
  return first;
}
/** The report's rows checked by the corpus scorer, as a case's expected.json would state them. */
function scored(f: Folder, run: CaseRun, report: Record<string, unknown>) {
  return scoreCase({ ...f.c, expected: { report } }, run);
}

describe('B12c one result note per settled request', () => {
  it('AC15 b12-result-note-written: a settled request writes one Bower note in its set\'s folder with every member\'s outcome', async () => {
    const f = await folder();
    // A first run on a cold folder also writes the health note; one idle run first, so the report names only this request's rows.
    await press(f, () => empty, { words: 'Update these notes.' });
    const run = await press(f, shared);
    const text = run.after[NOTE] ?? '';
    expect(notes(run), 'one result note, named for the map\'s title').toEqual([NOTE]);
    expect(text).toMatch(/^---\n(?:.*\n)*by: bower\n/);
    for (const line of [`Asked: "${WORDS}"`, 'Done: 2', 'Unavailable: 0', '- [[Ferrowick offer]]: done', '- [[Mallowick offer]]: done', 'Updated: [[Career profile]]'])
      expect(text, line).toContain(`${line}\n`);
    expect(text.indexOf('[[Ferrowick offer]]'), 'members in the set\'s order').toBeLessThan(text.indexOf('[[Mallowick offer]]'));
    expect(scored(f, run, { filed: 0, created: [NOTE], updated: [PROFILE], questionsExactly: 0 }), 'its created row, the profile\'s updated row, no filing row')
      .toEqual({ pass: true, unmet: [] });
    expect(phase(run)).toBe('done');
    const again = await press(f, () => empty, { words: 'Update these notes.' });
    expect(notes(again), 'a later run writes no other result note').toEqual([NOTE]);
    expect(again.after[NOTE]).toBe(text);
  });

  it('AC15 b12-result-note-reasons: each member that is not done says why, in one closed set of plain reasons', async () => {
    // Blockwick keeps its three tags as a block list: its items count, never a flattened line (R70).
    const files = { [`${HUNT}/Alex offer.md`]: offer('Alex', { by: false }), [`${HUNT}/Fullwick offer.md`]: offer('Fullwick', { tags: '[career, remote, shortlist]' }),
      [`${HUNT}/Blockwick offer.md`]: offer('Blockwick', { tags: '[career]' }).replace('tags: [career]\n', 'tags:\n  - career\n  - remote\n  - shortlist\n') };
    const f = await folder(files);
    const tagged = await press(f, (ctx) => opsMap(ctx, [{ kind: 'tag', mode: 'add', value: 'gardening' }]), { words: 'Add gardening to the active offers.' });
    const text = tagged.after[NOTE] ?? '';
    for (const line of ['Done: 2', 'Unavailable: 3', '- [[Alex offer]]: unavailable, Bower changes details only on its own notes', '- [[Fullwick offer]]: unavailable, its tags would pass 3',
      '- [[Blockwick offer]]: unavailable, its tags would pass 3'])
      expect(text, line).toContain(`${line}\n`);
    const g = await folder({ [PROFILE]: PROFILE_TEXT.replace('skills: [Python]', 'skills: [A, B, C, D, E, F, G, H, I]'), [`${HUNT}/Zelwick offer.md`]: offer('Zelwick') });
    const clash = await press(g, async (ctx) => resultsMap(ctx, [await union(ctx, FERRO, ['J']), await union(ctx, MALLO, ['K']),
      { memberId: await ctx.id(`${HUNT}/Zelwick offer.md`), ops: [{ kind: 'property', targetId: await ctx.id(`${HUNT}/Zelwick offer.md`), key: 'focus', mode: 'set', value: 'data' }] }]));
    const result = clash.after[NOTE] ?? '';
    for (const line of ['Done: 1', 'Unavailable: 2', '- [[Ferrowick offer]]: unavailable, the list would pass 10 items', '- [[Mallowick offer]]: unavailable, the list would pass 10 items', '- [[Zelwick offer]]: done'])
      expect(result, line).toContain(`${line}\n`);
    const h = await folder();
    const partial = await press(h, async (ctx) => resultsMap(ctx, [await union(ctx, FERRO, ['SQL'])]));
    expect(partial.after[NOTE]).toContain('- [[Mallowick offer]]: unavailable, no change was given for it\n');
    const k = await folder();
    const conflict = await press(k, async (ctx) => resultsMap(ctx, [
      { memberId: await ctx.id(FERRO), ops: [{ kind: 'property', targetId: await ctx.id(PROFILE), key: 'focus', mode: 'set', value: 'data' }] },
      { memberId: await ctx.id(MALLO), ops: [{ kind: 'property', targetId: await ctx.id(PROFILE), key: 'focus', mode: 'set', value: 'web' }] }]));
    expect(conflict.after[NOTE]).toContain('- [[Ferrowick offer]]: unavailable, two notes asked for different values\n');
  });

  it('AC15 b12-result-note-final-names: a moved and renamed member is linked by its final name; a name already taken says so', async () => {
    const files = { [`${HUNT}/Saltmere/Saltmere.md`]: '---\nby: bower\ntype: moc\nsummary: Saltmere offers.\n---\n\n## Notes\nSaltmere.\n',
      [`${HUNT}/Saltmere/Taken offer.md`]: offer('Taken') };
    const f = await folder(files);
    const run = await press(f, async (ctx) => resultsMap(ctx, await Promise.all([[FERRO, 'Ferro, Saltmere offer.md'], [MALLO, 'Taken offer.md']].map(async ([path, name]) => {
      const id = await ctx.id(path ?? '');
      return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(`${HUNT}/Saltmere`) }, { kind: 'rename', targetId: id, name }] };
    }))), { words: 'Move the active offers to Saltmere and name them.' });
    const text = run.after[NOTE] ?? '';
    expect(text).toContain('- [[Ferro, Saltmere offer]]: done\n');
    expect(text).toContain('- [[Mallowick offer]]: unavailable, a note with that name is already there\n');
  });

  it('AC15 b12-result-note-move-reasons: a name another member takes, and a Source linking to a member, each say why', async () => {
    const salt = `${HUNT}/Saltmere`;
    const files = { [`${salt}/Saltmere.md`]: '---\nby: bower\ntype: moc\nsummary: Saltmere offers.\n---\n\n## Notes\nSaltmere.\n' };
    const f = await folder(files);
    const into = async (ctx: Ctx, path: string) => {
      const id = await ctx.id(path);
      return { memberId: id, ops: [{ kind: 'move', targetId: id, parentId: await ctx.id(salt) }, { kind: 'rename', targetId: id, name: 'Shared offer.md' }] };
    };
    const same = await press(f, async (ctx) => resultsMap(ctx, [await into(ctx, FERRO), await into(ctx, MALLO)]), { words: 'Move both offers to Saltmere as Shared offer.' });
    expect(same.after[NOTE] ?? '').toContain('- [[Shared offer]]: done\n');
    expect(same.after[NOTE] ?? '').toContain('- [[Mallowick offer]]: unavailable, another note in this request takes that name\n');
    const source = '---\nby: bower\ntype: source\nsummary: Workshop notes.\n---\n\n## Notes\nAlex heard about [[Ferrowick offer]] here.\n';
    const g = await folder({ 'Resources/Workshop.md': source });
    const renamed = await press(g, async (ctx) => resultsMap(ctx, await Promise.all([[FERRO, 'Ferro offer.md'], [MALLO, 'Mallo offer.md']].map(async ([path, name]) => {
      const id = await ctx.id(path ?? '');
      return { memberId: id, ops: [{ kind: 'rename', targetId: id, name }] };
    }))), { words: 'Shorten the names of the active offers.' });
    expect(renamed.after[NOTE] ?? '').toContain('- [[Ferrowick offer]]: unavailable, a note that links to it cannot be updated\n');
    expect(renamed.after[NOTE] ?? '').toContain('- [[Mallo offer]]: done\n');
  });

  it('AC15 b12-result-note-shared-title: a member whose title another note shares is linked by its place, so the link means that member', async () => {
    const other = offer('Elsewhere').replace('status: active', 'status: closed');
    const f = await folder({ 'Areas/Career/Ferrowick offer.md': other });
    const run = await press(f, shared);
    expect(run.after[NOTE] ?? '').toContain('- [[Projects/Job hunt/Ferrowick offer]]: done\n');
    expect(run.after[NOTE] ?? '', 'a title only one note has stays a plain link').toContain('- [[Mallowick offer]]: done\n');
    expect(run.after['Areas/Career/Ferrowick offer.md']).toBe(other);
  });

  it('AC15 b12-result-note-created-title: a member whose title the result note being created shares is linked by its place', async () => {
    const sub = `${HUNT}/Sub/Request - Review offers.md`;
    const f = await folder({ [sub]: offer('Subwick') });
    const run = await press(f, (ctx) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers', set: { ...set(ctx), recursive: true }, ops: [REVIEWED] }] }),
      { words: 'Mark the active offers in Job hunt as reviewed.' });
    expect(notes(run).sort(), 'the note takes the free name in the set\'s folder').toEqual([NOTE, sub].sort());
    expect(run.after[NOTE] ?? '', 'the link opens the member, not the note being created').toContain('- [[Projects/Job hunt/Sub/Request - Review offers]]: done\n');
    expect(run.after[NOTE] ?? '').toContain('- [[Ferrowick offer]]: done\n');
  });

  it('AC15 b12-result-note-mixed-run-title: a note the same run files with the title of an updated note makes that link a place link', async () => {
    const f = await folder();
    const incoming = '---\nby: bower\ntype: concept\nsummary: Another career profile.\n---\n\n## Notes\nAlex sent this.\n';
    const run = await press(f, async (ctx) => ({ ...(await shared(ctx)), things: (ctx.things ?? []).filter((t) => t.name === 'Career profile.md')
      .map((t) => ({ fileId: t.fileId, to: HUNT, name: 'Career profile.md' })) }), { extra: { 'Career profile.md': incoming } });
    expect(run.after[`${HUNT}/Career profile.md`], 'the run filed the second Career profile').toBeDefined();
    expect(run.after[NOTE] ?? '', 'the link opens the note that was updated').toContain('Updated: [[Areas/Career/Career profile]]\n');
  });

  it('AC15 b12-result-note-empty-set (guard): a set with no notes settles with no result note; its requests row says it was done', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => ({ ...empty, maps: [{ requestId: ctx.request, title: 'Review offers', set: { ...set(ctx), where: { op: 'eq', property: 'status', value: 'paused' } },
      ops: [REVIEWED] }] }), { words: 'Mark the paused offers in Job hunt as reviewed.' });
    expect(notes(run), 'no result note: nothing matched (R50, R73)').toEqual([]);
    expect(archived(run, 'press-1')).toBe(true);
    const rows = (JSON.parse(run.after[SYSTEM.requests] ?? '{"done":[]}') as { done: Array<{ id: string; done: string }> }).done;
    expect(rows.filter((r) => r.id === 'press-1').map((r) => r.done)).toEqual([REQUEST_DONE]);
  });

  it('AC15 b12-result-note-shared-target-title: a shared note whose title another note has is linked by its place, and that link opens the updated note', async () => {
    const twin = '---\nby: bower\ntype: concept\nsummary: Another career profile.\n---\n\n## Notes\nNot this one.\n';
    const f = await folder({ 'Resources/Career profile.md': twin });
    const run = await press(f, shared);
    const text = run.after[NOTE] ?? '';
    expect(text).toContain('Updated: [[Areas/Career/Career profile]]\n');
    const target = /Updated: \[\[([^\]]+)\]\]/.exec(text)?.[1] ?? '';
    expect(run.after[`${target}.md`], 'the link resolves to the note that was updated').toBe(PROFILE_TEXT.replace('skills: [Python]', 'skills: [Python, SQL, TypeScript, dbt]'));
    expect(run.after['Resources/Career profile.md']).toBe(twin);
  });

  it('AC16 b12-result-note-generated-name: the file name is "Request - " and the title, cleaned and cut by the one generated-name rule; a clash takes (2)', async () => {
    const title = 'Review: "remote" offers? Alex*s list > shortlist, now. Again';
    expect(title, 'a 60-character title with punctuation').toHaveLength(60);
    const name = generatedName(`Request - ${title}`);
    expect(name, 'cleaned and cut').not.toMatch(/[:*?"<>|]/);
    const path = `${HUNT}/${name}`;
    const clash = `${HUNT}/${name.replace(/\.md$/, ' (2).md')}`;
    const mine = '---\ntype: diary\nsummary: Alex wrote this.\n---\n\n## My thoughts\nMine.\n';
    const titled = async (ctx: Ctx) => ({ ...(await shared(ctx)), maps: (await shared(ctx)).maps.map((m) => ({ ...m, title })) });
    const f = await folder();
    const run = await press(f, titled);
    expect(notes(run)).toEqual([path]);
    const g = await folder({ [path]: mine });
    const taken = await press(g, titled);
    expect(taken.after[path]).toBe(mine);
    expect(notes(taken).filter((p) => p !== path), 'the existing next free name').toEqual([clash]);
  });

  it('AC16 b12-result-note-waits: a request that waits writes no result note; the run that settles it writes one', async () => {
    const f = await folder();
    const malloId = await f.id(MALLO);
    let edited = false;
    const first = await press(f, async (ctx) => {
      if (!edited) {
        edited = true;
        await f.drive.writeText(malloId, `${await f.drive.readText(malloId)}Alex added this line during the run.\n`, (await f.drive.get(malloId)).modifiedTime);
      }
      return opsMap(ctx, [{ kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' }]);
    }, { words: 'Mark the active offers in Job hunt as reviewed.' });
    expect(edited).toBe(true);
    expect(first.after[FERRO], 'the clear member is written').toContain('review_state: reviewed\n');
    expect(archived(first, 'press-1'), 'the request waits').toBe(false);
    expect(notes(first), 'no result note while it waits').toEqual([]);
    const second = await press(f, (ctx) => opsMap({ ...ctx, request: first.request }, [{ kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' }]), { words: 'Update these notes.' });
    expect(notes(second)).toEqual([NOTE]);
    expect(second.after[NOTE]).toContain('Done: 2\n');
    expect(archived(second, 'press-1')).toBe(true);
  });

  it('AC16 b12-result-note-name-taken: a note already named so stays exact; the result note takes the next free name', async () => {
    const mine = '---\ntype: diary\nsummary: Alex wrote this.\n---\n\n## My thoughts\nMine.\n';
    const f = await folder({ [NOTE]: mine });
    const run = await press(f, shared);
    expect(run.after[NOTE]).toBe(mine);
    expect(notes(run).filter((path) => path !== NOTE), 'one more result note, with the next free name').toEqual([NOTE2]);
    expect(run.after[NOTE2]).toContain('Done: 2\n');
  });

  it('AC16 b12-result-note-run-names: names are reserved across the run, the oldest request first, its members before its note', async () => {
    const f = await folder();
    const older = await ask(f, 'other-1', 'Mark the active offers in Job hunt as reviewed.', DAY - 1);
    const run = await press(f, (ctx) => ({ ...empty, maps: [{ requestId: older, title: 'Review offers', set: set(ctx), ops: [REVIEWED] },
      { requestId: ctx.request, title: 'Review offers', set: set(ctx), ops: [{ kind: 'tag', mode: 'add', value: 'shortlist' }] }] }), { words: 'Shortlist the active offers.' });
    expect(notes(run).sort(), 'two requests with one title: two notes, never one over the other').toEqual([NOTE2, NOTE]);
    expect(run.after[NOTE], 'the older request takes the name').toContain('Asked: "Mark the active offers in Job hunt as reviewed."\n');
    expect(run.after[NOTE2]).toContain('Asked: "Shortlist the active offers."\n');
    const g = await folder();
    const member = await press(g, async (ctx) => resultsMap(ctx, [{ memberId: await ctx.id(FERRO), ops: [{ kind: 'rename', targetId: await ctx.id(FERRO), name: 'Request - Review offers.md' }] }]),
      { words: 'Name the Ferrowick offer as a request.' });
    expect(member.after[NOTE], 'the member\'s new name comes first').toBe(OFFERS[FERRO]);
    expect(member.after[NOTE2], 'the result note takes the next free name').toContain('- [[Request - Review offers]]: done\n');
  });

  it('AC16 b12-result-note-partial-move-retry: the note covers the set of the run that settles; a member that moved out in an earlier run is not listed', async () => {
    const salt = `${HUNT}/Saltmere`;
    const f = await folder({ [`${salt}/Saltmere.md`]: '---\nby: bower\ntype: moc\nsummary: Saltmere offers.\n---\n\n## Notes\nSaltmere.\n' });
    const malloId = await f.id(MALLO);
    const move = async (ctx: Ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(salt) }]);
    const first = await press(f, move, { words: 'Move the active offers in Job hunt to Saltmere.', around: (next) => async (input, init) => {
      if (init?.method === 'PATCH' && url(input).pathname === `/drive/v3/files/${malloId}` && url(input).searchParams.has('addParents')) {
        return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refusal.', errors: [{ reason: 'insufficientFilePermissions' }] } }), { status: 403 });
      }
      return next(input, init);
    } });
    expect(first.after[`${salt}/Ferrowick offer.md`], 'Ferrowick moved, out of the set').toBe(OFFERS[FERRO]);
    expect(first.after[MALLO], 'Mallowick\'s move did not land').toBe(OFFERS[MALLO]);
    expect(archived(first, 'press-1'), 'the request waits').toBe(false);
    expect(notes(first)).toEqual([]);
    const second = await press(f, (ctx) => move({ ...ctx, request: first.request }), { words: 'Update these notes.' });
    expect(second.after[`${salt}/Mallowick offer.md`]).toBe(OFFERS[MALLO]);
    expect(archived(second, 'press-1')).toBe(true);
    const text = second.after[NOTE] ?? '';
    for (const line of ['Done: 1', 'Unavailable: 0', '- [[Mallowick offer]]: done']) expect(text, line).toContain(`${line}\n`);
    expect(text, 'the member that left the set in the earlier run is not listed').not.toContain('[[Ferrowick offer]]');
  });

  it('AC16 b12-result-note-unreadable-member: a candidate that cannot be read writes no result note; the run that settles writes one with every member', async () => {
    const zel = `${HUNT}/Zelwick offer.md`;
    const f = await folder({ [zel]: offer('Zelwick') });
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]), { words: 'Mark the active offers in Job hunt as reviewed.', around: refused403(await f.id(zel)) });
    expect(archived(first, 'press-1'), 'the request waits').toBe(false);
    expect(notes(first), 'no result note while membership is not known').toEqual([]);
    const second = await press(f, (ctx) => opsMap({ ...ctx, request: first.request }, [REVIEWED]), { words: 'Update these notes.' });
    expect(notes(second)).toEqual([NOTE]);
    for (const line of ['Done: 3', 'Unavailable: 0', '- [[Zelwick offer]]: done']) expect(second.after[NOTE], line).toContain(`${line}\n`);
  });

  it('AC17 b12-result-note-crash-before-create: a crash before the result note is sent creates it once on redispatch, with no model call', async () => {
    const f = await folder();
    const state = { reached: false };
    const first = await press(f, shared, { around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (await createdName(input, init) === 'Request - Review offers.md') {
        expect(await manifestStored(f), 'the frozen manifest exists before the interruption').toBe(true);
        state.reached = true;
        throw new TypeError('Made-up crash before the result note.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the result note').toBe(true);
    expect(await noteStored(f), 'the note was not created').toBe(false);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(notes(resumed)).toEqual([NOTE]);
    expect(archived(resumed, 'press-1')).toBe(true);
  });

  it('AC17 b12-result-note-ack-lost: a lost answer after the result note is created ends with one note on redispatch', async () => {
    const f = await folder();
    let crashed = false;
    const first = await press(f, shared, { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (await createdName(input, init) === 'Request - Review offers.md') {
        const response = await next(input, init);
        crashed = response.ok && await noteStored(f);
        throw new TypeError('Made-up lost answer after the result note.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main created the result note').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(notes(resumed), 'one note, never a copy').toEqual([NOTE]);
  });
  it('AC17 b12-result-note-bookkeeping-refused: Drive refuses the requests write after the note is created; the retry settles and never writes that note again', async () => {
    const f = await folder();
    const first = await refusedBookkeeping(f);
    const noteId = await f.id(NOTE);
    const written = await f.drive.readText(noteId);
    expect((await f.drive.get(noteId)).appProperties?.by, 'a generated Bower note, its provenance on the file').toBe('bower');
    // The set changes between the attempts: a third active offer.
    await f.drive.createText(await f.id(HUNT), 'Zelwick offer.md', offer('Zelwick'));
    const second = await press(f, (ctx) => shared({ ...ctx, request: first.request }), { words: 'Update these notes.' });
    expect(notes(second), 'one result note, never a (2)').toEqual([NOTE]);
    expect(await f.id(NOTE), 'the same file').toBe(noteId);
    expect(second.after[NOTE], 'byte-exact as first written (R85)').toBe(written);
    expect(archived(second, 'press-1'), 'the bookkeeping completes: the request settles').toBe(true);
  });

  it('AC17 b12-result-note-person-edited: a person\'s edit to the result note of a pending request is kept; the request settles', async () => {
    const f = await folder();
    const first = await refusedBookkeeping(f);
    const noteId = await f.id(NOTE);
    const edited = `${await f.drive.readText(noteId)}Alex added this line.\n`;
    await f.drive.writeText(noteId, edited, (await f.drive.get(noteId)).modifiedTime);
    const second = await press(f, (ctx) => shared({ ...ctx, request: first.request }), { words: 'Update these notes.' });
    expect(second.after[NOTE], 'the person\'s edit, byte-exact').toBe(edited);
    expect(notes(second), 'no second result note').toEqual([NOTE]);
    expect(archived(second, 'press-1'), 'the request settles').toBe(true);
  });

  it('AC17 b12-result-note-result-note-source: a result note turned into a Source before the retry stays exact; the request settles', async () => {
    const f = await folder();
    const first = await refusedBookkeeping(f);
    const noteId = await f.id(NOTE);
    const sourced = (await f.drive.readText(noteId)).replace(/\n---\n/, '\nbower_template: source\n---\n');
    await f.drive.writeText(noteId, sourced, (await f.drive.get(noteId)).modifiedTime);
    const second = await press(f, (ctx) => shared({ ...ctx, request: first.request }), { words: 'Update these notes.' });
    expect(second.after[NOTE]).toBe(sourced);
    expect(notes(second), 'no second result note').toEqual([NOTE]);
    expect(archived(second, 'press-1')).toBe(true);
  });

  it('AC17 b12-result-note-mapped-ledger: every operation of a map counts as mapped, its result note too; other operations keep the 200 ceiling', async () => {
    const f = await folder({ [`${HUNT}/Done/Done.md`]: '---\nby: bower\ntype: moc\nsummary: Done offers.\n---\n\n## Notes\nDone.\n' });
    const hunt = await f.id(HUNT);
    for (let i = 1; i <= 198; i++) await f.drive.createText(hunt, `Offer ${String(i).padStart(3, '0')}.md`, offer(`Offer ${i}`));
    // Idle runs read the 200 offers in, each keeping its reading progress (cold-discovery-progress).
    for (let runs = 0; runs < 3; runs++) await press(f, () => empty, { words: 'Update these notes.' });
    const move = async (ctx: Ctx) => opsMap(ctx, [{ kind: 'move', parentId: await ctx.id(`${HUNT}/Done`) }]);
    // 200 member moves plus the result note and bookkeeping: over 200 operations, every map one mapped (R86).
    const run = await press(f, move, { words: 'Move the active offers in Job hunt into Done.' });
    const moved = Object.keys(run.after).filter((p) => p.startsWith(`${HUNT}/Done/`) && p !== `${HUNT}/Done/Done.md`);
    expect(moved, 'all 200 moved in one run').toHaveLength(200);
    expect(run.after[NOTE] ?? '', 'its result note').toContain('Done: 200\n');
    expect(phase(run)).toBe('done');
    // A run whose own, non-map operations pass 200 still exhausts: 201 letters filed beside a small map.
    const g = await folder();
    const mixed = await press(g, async (ctx) => ({ ...(await shared(ctx)), things: (ctx.things ?? []).map((t) => ({ fileId: t.fileId, to: HUNT, name: t.name })) }), { pile: 201 });
    expect(Object.keys(mixed.after).filter((p) => /\/manifest-[^/]+\.json$/.test(p)), 'exhaustion stores no manifest').toEqual([]);
    expect(Object.keys(mixed.after).filter((p) => p.startsWith('Inbox/') && /Letter \d{3}\.txt$/.test(p)), 'every letter waits in the inbox').toHaveLength(201);
  }, 120_000);

  it('AC17 b12-result-note-partial-recovery: a member write that landed with its answer lost counts as done once; the note is written once on redispatch', async () => {
    const f = await folder();
    const ferroId = await f.id(FERRO);
    let crashed = false;
    const first = await press(f, (ctx) => opsMap(ctx, [REVIEWED]), { words: 'Mark the active offers in Job hunt as reviewed.', around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${ferroId}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the member write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'the member write landed').toBe(true);
    expect(notes(first), 'no result note before the request settles').toEqual([]);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(model).not.toHaveBeenCalled();
    expect(notes(resumed), 'one note').toEqual([NOTE]);
    for (const line of ['Done: 2', 'Unavailable: 0', '- [[Ferrowick offer]]: done', '- [[Mallowick offer]]: done']) expect(resumed.after[NOTE], line).toContain(`${line}\n`);
    expect(archived(resumed, 'press-1')).toBe(true);
  });
});

const CASES = ['c17-b12-shared-target', 'c17-b12-closed-ops', 'c17-b12-authority-person-boundary'];
describe('B12c the corpus cases in the landed grammar', () => {
  it.each(CASES)('AC18 b12-result-note-fixtures-landed: %s uses the landed grammar, with no stale specimen', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const table = c.folder[SYSTEM.typeTable];
    expect(readTypeTable(table ?? null).writeAllowed).toBe(true);
    expect(JSON.parse(table ?? '{}'), 'every row is a valid stored row').toEqual(readTypeTable(table ?? null).table);
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ maps?: Array<Record<string, unknown>> }>;
    const entry = replies[0]?.maps?.[0];
    expect(entry, 'the reply maps one set').toMatchObject({ requestId: '$request:change-1', title: expect.any(String) as unknown, set: { folderId: expect.stringMatching(/^\$folder:/) as unknown } });
    const text = [table, JSON.stringify(replies), JSON.stringify(c.expected), c.rubric].join('\n');
    for (const stale of ['"itemType"', '$set:', '"setId"', 'Pending B12', 'pending scripted proof'])
      expect(text, `no stale specimen ${stale}`).not.toContain(stale);
    for (const hand of ['oracle.json', 'inventory.json']) expect(existsSync(join(ROOT, id, hand)), `the hand ${hand} lives in the reds`).toBe(false);
  });

  it.each(CASES)('AC18 b12-result-note-case: %s through main maps its set, writes its result note and scores clean', async (id) => {
    const c = await loadCase(join(ROOT, id));
    const inputs: string[] = [];
    const model = caseReplies(c.id);
    const run = await runWithClaude(c, async (call) => { inputs.push(call.input); return model(call); });
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(phase(run)).toBe('done');
    expect(inputs, 'selection and execution only').toHaveLength(2);
  });
});
