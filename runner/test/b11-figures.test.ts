/** B11b through production main: maintain evaluates each aggregate a Bower MOC declares into its figures (TL-P4-48 Q3, Q5, Q6, Q8). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseNote } from '../../src/data/contracts/note-format';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';
import { manifests, observe, writes, type Observation } from './b23-hot-observe';

const DAY = Date.UTC(2026, 9, 7, 9);
const NEXT_DAY = DAY + 24 * 3600 * 1000;
const HUNT = 'Projects/Job hunt';
const MAP = `${HUNT}/Job hunt.md`;
const MONEY_MAP = 'Areas/Money/Money.md';
const TABLE = { v: 1, rows: [
  { id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' }, deadline: { type: 'date' } }, table: ['skills'] },
  { id: 'receipt', match: ['receipt'], template: 'source', properties: { amount: { type: 'money' }, spent_on: { type: 'date' },
    category: { type: 'enum', values: ['garden', 'kitchen'] } }, table: ['amount', 'spent_on', 'category'] }] };
const SKILLS = { v: 1, id: 'active-offer-skills', kind: 'aggregate', title: 'Skills most active offers ask for',
  set: { type: 'offer', folderId: '$folder', recursive: true, where: { op: 'eq', property: 'status', value: 'active' } },
  groupBy: [], measures: [{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 3 }] };
const MONTHLY = { v: 1, id: 'monthly-garden-spend', kind: 'aggregate', title: 'Garden spending by month',
  set: { type: 'receipt', folderId: '$folder', recursive: true },
  groupBy: [{ property: 'spent_on', bucket: 'month' }, { property: 'category' }], measures: [{ id: 'total', label: 'Total', op: 'sum', property: 'amount' }] };
const COUNT = { v: 1, id: 'offer-count', kind: 'aggregate', title: 'Offers', set: { type: 'offer', folderId: '$folder', recursive: true },
  groupBy: [], measures: [{ id: 'n', label: 'Offers', op: 'count' }] };

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

/** A Bower MOC, framed as maintain writes one, whose front matter may declare views (one JSON line, `bower_views`). */
function map(title: string, views?: unknown[], by = 'by: bower\n'): string {
  return `---\nbower_format: ownership/2\n${by}type: moc\nsummary: ${title} reference notes.\n${views ? `bower_views: ${JSON.stringify(views)}\n` : ''}---\n`
    + '<!-- bower:ownership/2 begin current -->\n<!-- bower:ownership/2 end current -->\n'
    + `<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these ${title.toLowerCase()} notes together.\n<!-- bower:ownership/2 end personal -->\n`
    + '<!-- bower:ownership/2 begin timeline -->\n<!-- bower:ownership/2 end timeline -->\n'
    + '<!-- bower:ownership/2 begin bower-note -->\n<!-- bower:ownership/2 end bower-note -->\n'
    + `<!-- bower:ownership/2 begin moc-overview -->\n## Overview\n${title} reference notes.\n<!-- bower:ownership/2 end moc-overview -->\n`
    + '<!-- bower:ownership/2 begin moc-figures -->\n## Figures\n<!-- bower:ownership/2 end moc-figures -->\n'
    + '<!-- bower:ownership/2 begin moc-members -->\n## Notes\n<!-- bower:ownership/2 end moc-members -->\n';
}
const offer = (name: string, status: string, skills?: string) => `---\nsummary: ${name} offers Alex remote work.\ntype: offer\nby: bower\n`
  + `created: 2026-10-01\nstatus: ${status}\n${skills ? `skills: ${skills}\n` : ''}---\n\n${name} offers Alex remote work.\nRelated: [[Job hunt]].\n`;
const receipt = (name: string, amount?: string) => `---\nsummary: ${name} is Alex's garden expense.\ntype: receipt\nby: bower\ncreated: 2026-10-01\n`
  + `spent_on: 2026-10-02\ncategory: garden\n${amount ? `amount: ${amount}\n` : ''}---\n\n${name} is Alex's garden expense.\nRelated: [[Money]].\n`;
const money = (amount: number, currency: string) => JSON.stringify({ amount, currency });
const OFFERS = {
  [`${HUNT}/Ferrowick offer.md`]: offer('Ferrowick', 'active', '[TypeScript, SQL, SQL]'),
  [`${HUNT}/Mallowick offer.md`]: offer('Mallowick', 'active', '["TypeScript","SQL","dbt"]'),
  [`${HUNT}/Lindenwick offer.md`]: offer('Lindenwick', 'active'),
  [`${HUNT}/Past offer.md`]: offer('Past', 'closed', '[Rust]'),
};
const SKILLS_BLOCK = '### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| SQL | 2 |\n| TypeScript | 2 |\n| dbt | 1 |\n\n'
  + 'Not counted in Offers: 1 note with no skills.\n';

/** A made-up folder: the type table, the notes given and nothing in the Inbox; `$folder` in a view is bound to `folder`'s id. */
async function folder(files: Record<string, string>, bind: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'b11-figures', capability: 'C05', title: 'Alex keeps figures', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), 'Rules.md': '# Rules\n', ...files } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  // The folder ids exist only once seeded: bind each view's `$folder` and write the map again before any run.
  for (const [path, folderPath] of Object.entries(bind)) {
    const fileId = await id(path);
    const text = await drive.readText(fileId);
    await drive.writeText(fileId, text.split('"$folder"').join(JSON.stringify(await id(folderPath))), (await drive.get(fileId)).modifiedTime);
  }
  return { c, drive, root, id, press: 0, home: Object.values(bind)[0] ?? HUNT };
}
type Folder = Awaited<ReturnType<typeof folder>>;

/** One instructions press ("Update these notes.") or a filing press, through main with a scripted model. */
async function press(f: Folder, intent: (frame: Record<string, unknown>) => unknown = () => ({ kind: 'tidy-intent', v: 1, things: [] }),
  inbox: Array<{ name: string; text: string }> = [], around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch) {
  f.press++;
  for (const doc of inbox) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'File this offer with my job hunt.\n');
    await f.drive.createText(pile.id, doc.name, doc.text);
  }
  const scope = inbox.length ? 'all' : 'instructions';
  if (!inbox.length) {
    await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
      device: 'device-1', at: DAY + f.press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b11-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(f.home);
  const calls: string[] = [];
  const frames: Array<Record<string, unknown>> = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: inbox.length ? 'offer' : 'unknown',
      destination: hunt, wants: [] })), asks: [] });
    frames.push(frame);
    return reply(await intent(frame));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, ...(around ? { around } : {}),
    pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope, requestId: `b11-run-${f.press}` } }, f.press);
  return { ...run, calls, frames };
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
/** The moc-figures region as the one ownership parser frames it. */
function figures(text: string | undefined): string | undefined {
  const bytes = new TextEncoder().encode(text ?? '');
  const own = parseOwnership(bytes);
  const span = own.status === 'v2' ? own.payloads['moc-figures'] : undefined;
  return span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)) : undefined;
}
const outside = (text: string | undefined) => {
  const region = figures(text);
  return region === undefined ? text : (text ?? '').replace(region, '');
};
const retrieval = (run: CaseRun) => JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, Record<string, unknown>> };
type Api = Record<string, unknown>;
/** The engine, loaded by path so the reds typecheck on main, where it does not exist yet. */
async function views(): Promise<Api> {
  try {
    return await import(/* @vite-ignore */ new URL('../src/views.ts', import.meta.url).pathname) as Api;
  } catch (error) {
    // Missing on main: the export assertion names what is missing.
    expect(String(error)).toMatch(/views/);
    return {};
  }
}
const COUNT_BLOCK = (n: number) => `### Offers\n\n| Offers |\n| --- |\n| ${n} |\n`;
const BASE = (n: number) => `## Figures\n\n${n} direct notes; ${n} notes in all.\n`;
const logged = () => vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'));
const noModel: ClaudeSpawn = async () => { throw new Error('Recovery must not call the model.'); };
/** Replaces a token such as "$old" in a seeded file with a folder's id, as `folder()` does for "$folder". */
async function rebind(f: Folder, path: string, token: string, folderPath: string) {
  const fileId = await f.id(path);
  const text = await f.drive.readText(fileId);
  await f.drive.writeText(fileId, text.split(JSON.stringify(token)).join(JSON.stringify(await f.id(folderPath))), (await f.drive.get(fileId)).modifiedTime);
}
/** Lands the first write to `path`, then loses its response and every later Drive call until disabled (as b8-health does). */
function lose(f: Folder, traffic: Observation[], path: string) {
  const state = { reached: false, enabled: true };
  const around = (fetch: typeof globalThis.fetch) => {
    let seen = traffic.length;
    return observe(f.drive, f.root, traffic)(async (input, init = {}) => {
      const last = traffic.length > seen ? traffic.at(-1) : undefined;
      seen = traffic.length;
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (state.enabled && state.reached && url.origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost');
      const response = await fetch(input, init);
      if (state.enabled && last?.path === path && ['POST', 'PATCH'].includes(init.method ?? 'GET')) {
        expect(response.ok, 'the fault lands bytes before losing the response').toBe(true);
        state.reached = true;
        throw new TypeError('Made-up lost response');
      }
      return response;
    });
  };
  return { state, around };
}
const reads = (f: Folder) => [vi.spyOn(f.drive, 'readText'), vi.spyOn(f.drive, 'readPrefix'), vi.spyOn(f.drive, 'readBytes')];

describe('B11b figures through production main', () => {
  it('AC9 b11-figures-skills: a run writes the skills view into the map\'s figures, counted by script, and keeps every other byte', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(run.calls, 'no model call evaluates a view').toEqual(['selection', 'execution']);
    expect(figures(run.after[MAP])).toBe(`## Figures\n\n4 direct notes; 4 notes in all.\n\n${SKILLS_BLOCK}`);
    expect(run.after[MAP]).toContain('## My notes\nAlex keeps these job hunt notes together.\n');
    expect(run.after[MAP]).toContain('## Overview\nJob hunt reference notes.\n');
    for (const [path, text] of Object.entries(OFFERS)) expect(run.after[path], `${path} is never written`).toBe(text);
    expect(run.after[SYSTEM.typeTable]).toBe(JSON.stringify(TABLE, null, 2));
    expect(Object.keys(run.after).some((path) => /views\.json$/.test(path)), 'no view registry').toBe(false);
    expect(parseNote(MAP, run.after[MAP] ?? '').properties.map((p) => p.key), 'the declaration is Bower\'s key, never a shown property').not.toContain('bower_views');
  });

  it('AC9 b11-figures-unchanged: the next run reads no offer more than a map without views does, and writes nothing to the map', async () => {
    const offerReads = async (views?: unknown[]) => {
      const f = await folder({ [MAP]: map('Job hunt', views), ...OFFERS }, views ? { [MAP]: HUNT } : {});
      const first = await press(f);
      const offerIds = await Promise.all(Object.keys(OFFERS).map((path) => f.id(path)));
      const mapId = await f.id(MAP);
      const writes = vi.spyOn(f.drive, 'writeText');
      const spies = reads(f);
      const second = await press(f);
      expect(phase(second)).toBe('done');
      const count = spies.flatMap((spy) => spy.mock.calls.filter(([fileId]) => offerIds.includes(String(fileId)))).length;
      return { first, second, count, mapWrites: writes.mock.calls.filter(([fileId]) => fileId === mapId) };
    };
    const control = await offerReads();
    const counted = await offerReads([SKILLS]);
    expect(figures(counted.first.after[MAP])).toContain(SKILLS_BLOCK);
    expect(counted.mapWrites, 'an unchanged result writes nothing').toEqual([]);
    expect(counted.second.after[MAP]).toBe(counted.first.after[MAP]);
    expect(counted.count, 'unchanged offers are evaluated from kept evidence: no read beyond what the run reads anyway').toBe(control.count);
  });

  it('AC9 b11-figures-after-settled-effects: an offer filed in the run counts in that run\'s figures', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    await press(f);
    const filed = await press(f, (frame) => {
      const things = (frame.piles as Array<{ things: Array<{ fileId: string }> }>).flatMap((p) => p.things);
      return { kind: 'tidy-intent', v: 1, things: things.map((t) => ({ fileId: t.fileId, to: HUNT, name: 'Birchwick offer.txt',
        note: { name: 'Birchwick offer.md', summary: 'Birchwick offers Alex remote work.', body: 'Birchwick offers Alex remote work with SQL and zig.',
          typeRow: 'offer', properties: { skills: ['SQL', 'zig'] } } })) };
    }, [{ name: 'Birchwick offer.txt', text: 'Birchwick offers Alex remote work with SQL and zig.' }]);
    expect(phase(filed)).toBe('done');
    expect(filed.after[`${HUNT}/Birchwick offer.md`], 'the offer note was filed').toContain('type: offer');
    expect(figures(filed.after[MAP])).toContain('| SQL | 3 |\n| TypeScript | 2 |\n| dbt | 1 |\n');
  });

  it('AC10 b11-figures-currency: money stays per currency; missing and unreadable amounts are counted, never one total', async () => {
    const f = await folder({ [MONEY_MAP]: map('Money', [MONTHLY]),
      'Areas/Money/Mulch.md': receipt('Mulch', money(30, 'EUR')), 'Areas/Money/Seeds.md': receipt('Seeds', money(12.5, 'EUR')),
      'Areas/Money/Tool.md': receipt('Tool', money(15, 'USD')), 'Areas/Money/Missing total.md': receipt('Missing total'),
      'Areas/Money/Unknown currency.md': receipt('Unknown currency', money(8, 'XYZ')) }, { [MONEY_MAP]: 'Areas/Money' });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MONEY_MAP])).toBe('## Figures\n\n5 direct notes; 5 notes in all.\n\n### Garden spending by month\n\n'
      + '| Spent on | Category | Currency | Total |\n| --- | --- | --- | --- |\n| 2026-10 | garden | EUR | €42.50 |\n| 2026-10 | garden | USD | $15 |\n\n'
      + 'Not counted in Total: 1 note with no amount, 1 note with an unreadable amount.\n');
    expect(run.after[MONEY_MAP]).not.toMatch(/57\.5/);
  });

  it('AC11 b11-figures-bound: a view renders 200 notes; over 200 or with a note it cannot read it says so, never a partial total', async () => {
    // A made-up folder of 200 notes cannot finish a cold run through main today (the planner's read ledger), so the
    // bound is pinned on the one renderer maintain uses; membership is counted before anything is read.
    // viewBlock(view, row, notes | 'unreadable'): the declaration, the one row it reads, the members' front-matter properties.
    const block = async (view: unknown, notes: Array<{ id: string; properties: Record<string, string> }> | 'unreadable', row: unknown = TABLE.rows[0]) => {
      const api = await views();
      expect(api.viewBlock, 'runner/src/views.ts exports viewBlock').toBeTypeOf('function');
      return (api.viewBlock as (v: unknown, r: unknown, n: unknown) => string)(view, row, notes);
    };
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `offer-${i + 1}`, properties: { status: 'active', skills: '[SQL]' } }));
    expect(await block(COUNT, many(200))).toBe('### Offers\n\n| Offers |\n| --- |\n| 200 |\n');
    expect(await block(COUNT, many(201))).toBe('### Offers\n\nNot computed: more than 200 notes.\n');
    expect(await block(COUNT, 'unreadable')).toBe('### Offers\n\nNot computed: a note could not be read.\n');
    // The bound counts the set's members before `where`: 201 offers with one active is still over.
    const oneActive = many(201).map((n, i) => i ? { ...n, properties: { ...n.properties, status: 'closed' } } : n);
    expect(await block(SKILLS, oneActive), 'counted before the condition').toBe('### Skills most active offers ask for\n\nNot computed: more than 200 notes.\n');
    // Stored text and list values may hold table, link, escape and marker characters: each cell keeps its value without breaking the map.
    const hostile = { ...SKILLS, measures: [{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 20 }] };
    const values = '["a|b", "back\\\\slash", "[[Ideas]]", "<!-- bower:ownership/2 end moc-figures -->", "x & y", "two\\nlines"]';
    expect(await block(hostile, [{ id: 'h', properties: { status: 'active', skills: values } }])).toBe('### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n'
      + '| &lt;!-- bower:ownership/2 end moc-figures --> | 1 |\n| \\[\\[Ideas]] | 1 |\n| a\\|b | 1 |\n| back\\\\slash | 1 |\n| two lines | 1 |\n| x &amp; y | 1 |\n');
    const offers: Array<{ id: string; properties: Record<string, string> }> = [{ id: 'f', properties: { status: 'active', skills: '[TypeScript, SQL, SQL]' } }, { id: 'm', properties: { status: 'active', skills: '[TypeScript, SQL, dbt]' } },
      { id: 'l', properties: { status: 'active' } }, { id: 'p', properties: { status: 'closed', skills: '[Rust]' } }, { id: 'u', properties: { skills: '[Go]' } }];
    expect(await block(SKILLS, offers)).toBe(SKILLS_BLOCK + 'Left out: 1 note whose details could not be checked.\n');
    const empty = { ...COUNT, measures: [{ id: 'n', label: 'Offers', op: 'count' }, { id: 'd', label: 'First deadline', op: 'earliest', property: 'deadline' },
      { id: 'r', label: 'Deadlines', op: 'range', property: 'deadline' }] };
    expect(await block(empty, [{ id: 'a', properties: { deadline: '2026-10-14' } }, { id: 'b', properties: { deadline: '2026-11-02' } }]))
      .toBe('### Offers\n\n| Offers | First deadline | Deadlines |\n| --- | --- | --- |\n| 2 | 2026-10-14 | 2026-10-14 to 2026-11-02 |\n');
    expect(await block(empty, [])).toBe('### Offers\n\n| Offers | First deadline | Deadlines |\n| --- | --- | --- |\n| 0 | — | — |\n');
    // A sum over 10^15 is no value and is said so; other values are rounded once to 4 decimals and shown as money.
    const spend = { v: 1, id: 'garden-spend', kind: 'aggregate', title: 'Garden spending', set: { type: 'receipt', folderId: '$folder', recursive: true },
      groupBy: [], measures: [{ id: 'total', label: 'Total', op: 'sum', property: 'amount' }, { id: 'avg', label: 'Average', op: 'average', property: 'amount' }] };
    const receipts = [[6e14, 'EUR'], [6e14, 'EUR'], [1, 'USD'], [2, 'USD'], [2, 'USD']] as const;
    expect(await block(spend, receipts.map(([amount, currency], i) => ({ id: `r${i}`, properties: { amount: money(amount, currency) } })), TABLE.rows[1]))
      .toBe('### Garden spending\n\n| Currency | Total | Average |\n| --- | --- | --- |\n| EUR | — | €600,000,000,000,000 |\n| USD | $5 | $1.6667 |\n\n'
        + 'Not computed in Total: too large to show.\n');
    // A view with no row to show says so in one line, with its not-counted lines.
    const byMonth = { ...COUNT, groupBy: [{ property: 'deadline', bucket: 'month' }] };
    expect(await block(byMonth, []), 'grouped, no notes').toBe('### Offers\n\nNothing to show yet.\n');
    const total = { ...spend, measures: [{ id: 'total', label: 'Total', op: 'sum', property: 'amount' }] };
    expect(await block(total, [{ id: 'm', properties: {} }, { id: 'x', properties: { amount: money(8, 'XYZ') } }], TABLE.rows[1]), 'money with no readable amount')
      .toBe('### Garden spending\n\nNothing to show yet.\n\nNot counted in Total: 1 note with no amount, 1 note with an unreadable amount.\n');
    expect(await block(SKILLS, [{ id: 'e', properties: { status: 'active', skills: '[]' } }]), 'only empty lists').toBe('### Skills most active offers ask for\n\nNothing to show yet.\n');
  });

  it('AC12 b11-figures-provenance: retrieval keeps the result with its declaration hash, evaluator, inputs and as-of date', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const run = await press(f);
    const mapId = await f.id(MAP);
    const definition = { ...SKILLS, set: { ...SKILLS.set, folderId: await f.id(HUNT) } };
    const ids = await Promise.all(Object.keys(OFFERS).map((path) => f.id(path)));
    const versions = await Promise.all(ids.map(async (fileId) => [fileId, (await f.drive.get(fileId)).modifiedTime]));
    expect(retrieval(run).views?.[`${mapId}/active-offer-skills`]).toEqual({ hash: (await canonical(definition)).hash, evaluator: 1, asOf: '2026-10-07',
      inputs: versions.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      result: { selected: 3, excluded: 1, unknown: 0, rows: [{ group: ['SQL'], values: { skills: 2 } }, { group: ['TypeScript'], values: { skills: 2 } },
        { group: ['dbt'], values: { skills: 1 } }], unavailable: { skills: { missing: 1, invalid: 0 } } } });
    // Property evidence lives in retrieval beside lint evidence, by id and version, never in the manifest's frozen snapshot.
    const stored = JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as { files: Record<string, { properties?: Record<string, string> }> };
    expect(stored.files[await f.id(`${HUNT}/Ferrowick offer.md`)]?.properties).toMatchObject({ status: 'active', skills: '[TypeScript, SQL, SQL]' });
    type Op = { effect: { kind: string; inputs?: { snapshot?: Record<string, object> } } };
    const ops = manifests(run).flatMap(([, text]) => (JSON.parse(text) as { operations?: Op[] }).operations ?? []).filter((op) => op.effect.kind === 'maintain');
    expect(ops.length, 'the run maintained').toBeGreaterThan(0);
    expect(ops.flatMap((op) => Object.values(op.effect.inputs?.snapshot ?? {})).filter((entry) => 'properties' in entry), 'the manifest snapshot is unchanged').toEqual([]);
    const indexed = (run.frames.at(-1)?.indexed ?? {}) as Record<string, Record<string, unknown>>;
    expect(Object.keys(indexed).length, 'the model is shown the indexed notes').toBeGreaterThan(0);
    expect(Object.values(indexed).filter((entry) => 'properties' in entry), 'property evidence never reaches the model').toEqual([]);
  });

  it('AC13 b11-figures-stored-faults: a stored view the grammar refuses is skipped and logged; the others are computed', async () => {
    const broken = { ...COUNT, id: 'broken', measures: [{ id: 'x', label: 'X', op: 'eval', property: 'skills' }] };
    // Stored declarations are read leniently: a key a later version added does not stop the view.
    const later = { ...SKILLS, note: 'kept by a later version' };
    const f = await folder({ [MAP]: map('Job hunt', [broken, later]), ...OFFERS }, { [MAP]: HUNT });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MAP])).toBe(`## Figures\n\n4 direct notes; 4 notes in all.\n\n${SKILLS_BLOCK}`);
    expect(vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError')),
      'the skipped view is logged as a BowerError').toBe(true);
  });

  it('AC13 b11-figures-person-map: a person\'s map that declares views gets nothing', async () => {
    const person = map('Job hunt', [SKILLS], '');
    const f = await folder({ [MAP]: person, ...OFFERS }, { [MAP]: HUNT });
    const seeded = await f.drive.readText(await f.id(MAP));
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(run.after[MAP]).toBe(seeded);
  });

  it('AC14 b11-figures-vanished-member: a binned offer drops out of the next figures', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    await press(f);
    await f.drive.trash(await f.id(`${HUNT}/Mallowick offer.md`));
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MAP])).toContain('| SQL | 1 |\n| TypeScript | 1 |\n');
    expect(figures(run.after[MAP])).not.toContain('dbt');
  });

  it('AC14 b11-figures-recovery: a done redispatch writes nothing and calls no model', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const run = await press(f);
    expect(figures(run.after[MAP])).toContain(SKILLS_BLOCK);
    const writes = vi.spyOn(f.drive, 'writeText');
    const again = await redispatchCase(f.c, run, 2, { claude: async () => { throw new Error('no model call on a done redispatch'); } });
    expect(writes).not.toHaveBeenCalled();
    expect(outside(again.after[MAP])).toBe(outside(run.after[MAP]));
    expect(figures(again.after[MAP])).toBe(figures(run.after[MAP]));
  });
});

describe('B11b figures when things go wrong', () => {
  it('AC9 b11-figures-two-views: two views render in declaration order and are replaced, never appended, when results change', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS, COUNT]), ...OFFERS }, { [MAP]: HUNT });
    const first = await press(f);
    expect(figures(first.after[MAP])).toBe(`${BASE(4)}\n${SKILLS_BLOCK}\n${COUNT_BLOCK(4)}`);
    await f.drive.trash(await f.id(`${HUNT}/Mallowick offer.md`));
    const second = await press(f);
    expect(figures(second.after[MAP])).toBe(`${BASE(3)}\n### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| SQL | 1 |\n| TypeScript | 1 |\n\n`
      + `Not counted in Offers: 1 note with no skills.\n\n${COUNT_BLOCK(3)}`);
    const swapped = await folder({ [MAP]: map('Job hunt', [COUNT, SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    expect(figures((await press(swapped)).after[MAP])).toBe(`${BASE(4)}\n${COUNT_BLOCK(4)}\n${SKILLS_BLOCK}`);
  });

  it.each<[string, (views: string) => string]>([
    ['malformed JSON', () => '[{"v":1,'],
    ['an object, not a list', () => JSON.stringify(SKILLS)],
    ['a list of text', () => '["skills"]'],
  ])('AC13 b11-figures-stored-container: a declaration line that is %s computes no view, is logged, and leaves the count line', async (_name, line) => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const mapId = await f.id(MAP);
    const text = await f.drive.readText(mapId);
    await f.drive.writeText(mapId, text.replace(/^bower_views: .*$/m, `bower_views: ${line(text)}`), (await f.drive.get(mapId)).modifiedTime);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MAP])).toBe(BASE(4));
    expect(logged()).toBe(true);
  });

  it.each<[string, unknown[], string]>([
    ['a null between two valid views', [SKILLS, null, COUNT], `${BASE(4)}\n${SKILLS_BLOCK}\n${COUNT_BLOCK(4)}`],
    ['a duplicate id: the first entry wins', [SKILLS, { ...SKILLS, title: 'Second skills' }], `${BASE(4)}\n${SKILLS_BLOCK}`],
    ['a formula on a map', [{ v: 1, id: 'offer-days', kind: 'formula', type: 'offer', outputs: [{ property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } }] }, SKILLS],
      `${BASE(4)}\n${SKILLS_BLOCK}`],
    ['an eleventh entry: the first ten count', [...Array.from({ length: 10 }, (_, i) => ({ ...COUNT, id: `offers-${i + 1}` })), SKILLS],
      `${BASE(4)}\n${Array.from({ length: 10 }, () => COUNT_BLOCK(4)).join('\n')}`],
  ])('AC13 b11-figures-stored-entries: %s; the skipped entry is logged and its valid siblings are computed', async (_name, declared, expected) => {
    const f = await folder({ [MAP]: map('Job hunt', declared), ...OFFERS }, { [MAP]: HUNT });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MAP])).toBe(expected);
    expect(logged()).toBe(true);
  });

  it('AC11 b11-figures-unreadable-member: a member whose details are past what Bower reads, or a note whose type cannot be told, stops the view, never a partial total', async () => {
    const pad = `x_note: ${'p'.repeat(5000)}\n`;
    const long = offer('Ashwick', 'active', '[SQL]').replace('status: active\n', `status: active\n${pad}`);
    const untyped = offer('Elmwick', 'active', '[SQL]').replace('summary: Elmwick offers Alex remote work.\n', `summary: Elmwick offers Alex remote work.\n${pad}`);
    for (const [name, text] of [['Ashwick offer.md', long], ['Elmwick offer.md', untyped]] as const) {
      const f = await folder({ [MAP]: map('Job hunt', [SKILLS, COUNT]), ...OFFERS, [`${HUNT}/${name}`]: text }, { [MAP]: HUNT });
      const run = await press(f);
      expect(phase(run), name).toBe('done');
      expect(figures(run.after[MAP]), name).toContain('### Skills most active offers ask for\n\nNot computed: a note could not be read.\n');
      expect(figures(run.after[MAP]), name).toContain('### Offers\n\nNot computed: a note could not be read.\n');
      expect(figures(run.after[MAP]), name).not.toContain('| SQL |');
      const record = retrieval(run).views?.[`${await f.id(MAP)}/active-offer-skills`];
      expect(record, 'provenance says why there is no result').toMatchObject({ evaluator: 1, asOf: '2026-10-07', result: 'unreadable' });
    }
  });

  it('AC9 b11-figures-membership: a set is its declared folder and type, recursive or direct, never the map\'s links', async () => {
    const files = {
      [MAP]: map('Job hunt', [{ ...COUNT, id: 'all-offers', title: 'All offers' }, { ...COUNT, id: 'direct-offers', title: 'Direct offers', set: { ...COUNT.set, recursive: false } },
        { ...COUNT, id: 'other-offers', title: 'Other offers', set: { ...COUNT.set, folderId: '$other' } }]),
      [`${HUNT}/Ferrowick offer.md`]: offer('Ferrowick', 'active', '[SQL]'),
      [`${HUNT}/Older/Past offer.md`]: offer('Past', 'closed', '[Rust]'),
      [`${HUNT}/Mulch.md`]: receipt('Mulch', money(30, 'EUR')).replace('Related: [[Money]]', 'Related: [[Job hunt]]'),
      'Projects/Other/Birchwick offer.md': offer('Birchwick', 'active', '[Go]'),
    };
    const f = await folder(files, { [MAP]: HUNT });
    await rebind(f, MAP, '$other', 'Projects/Other');
    const run = await press(f);
    expect(phase(run)).toBe('done');
    const region = figures(run.after[MAP]) ?? '';
    expect(region, 'recursive: the nested offer counts; the receipt and the linked outside offer do not').toContain('### All offers\n\n| Offers |\n| --- |\n| 2 |\n');
    expect(region, 'direct: only the folder itself').toContain('### Direct offers\n\n| Offers |\n| --- |\n| 1 |\n');
    expect(region, 'another folder by its id, though no link').toContain('### Other offers\n\n| Offers |\n| --- |\n| 1 |\n');
  });

  it('AC12 b11-figures-member-edit: a member edited in place is read again; its version enters the record even when the figures stay the same', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const mapId = await f.id(MAP);
    const key = `${mapId}/active-offer-skills`;
    const mallowick = await f.id(`${HUNT}/Mallowick offer.md`);
    const first = await press(f);
    const edit = async (from: string, to: string) => {
      await f.drive.writeText(mallowick, (await f.drive.readText(mallowick)).replace(from, to), (await f.drive.get(mallowick)).modifiedTime);
      return (await f.drive.get(mallowick)).modifiedTime;
    };
    const inputOf = (run: CaseRun) => (retrieval(run).views?.[key] as { inputs?: string[][] } | undefined)?.inputs?.find(([id]) => id === mallowick)?.[1];
    const reordered = await edit('skills: ["TypeScript","SQL","dbt"]', 'skills: ["dbt","SQL","TypeScript"]');
    const mapWrites = vi.spyOn(f.drive, 'writeText');
    const same = await press(f);
    expect(figures(same.after[MAP]), 'the same figures').toBe(figures(first.after[MAP]));
    expect(mapWrites.mock.calls.filter(([id]) => id === mapId), 'an unchanged map is not written').toEqual([]);
    expect(inputOf(same), 'the record names the new version').toBe(reordered);
    mapWrites.mockRestore();
    const closed = await edit('status: active', 'status: closed');
    const changed = await press(f);
    expect(figures(changed.after[MAP])).toBe(`${BASE(4)}\n### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| SQL | 1 |\n| TypeScript | 1 |\n\n`
      + 'Not counted in Offers: 1 note with no skills.\n');
    expect(inputOf(changed)).toBe(closed);
  });

  it('AC9 b11-figures-large-declaration: ten valid views past the prefix Bower indexes are read whole and computed; broken regions still stop the write', async () => {
    const statuses = ['active', ...Array.from({ length: 9 }, (_, i) => `${'s'.repeat(40)}${i}`)];
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...COUNT, id: `active-${i + 1}`, title: `Active offers ${i + 1} ${'x'.repeat(50)}`,
      set: { ...COUNT.set, where: { op: 'in', property: 'status', values: statuses } } }));
    expect(new TextEncoder().encode(JSON.stringify(ten)).length, 'the declaration line alone is past the prefix').toBeGreaterThan(4096);
    const f = await folder({ [MAP]: map('Job hunt', ten), ...OFFERS }, { [MAP]: HUNT });
    const line = (text: string | undefined) => /^bower_views: .*$/m.exec(text ?? '')?.[0];
    const declared = line(await f.drive.readText(await f.id(MAP)));
    const run = await press(f);
    expect(phase(run)).toBe('done');
    for (const view of ten) expect(figures(run.after[MAP])).toContain(`### ${view.title}\n\n| Offers |\n| --- |\n| 3 |\n`);
    expect(line(run.after[MAP]), 'the declaration line is kept byte for byte').toBe(declared);
    const broken = await folder({ [MAP]: map('Job hunt', ten).replace('<!-- bower:ownership/2 end moc-figures -->\n', ''), ...OFFERS }, { [MAP]: HUNT });
    const seeded = await broken.drive.readText(await broken.id(MAP));
    const refused = await press(broken);
    expect(refused.after[MAP], 'a map whose regions do not parse is never written').toBe(seeded);
  });

  it('AC11 b11-figures-escaped-values: values with table, link and marker text are shown and the map keeps its regions', async () => {
    const hostile = offer('Hollywick', 'active', '["a|b", "[[Ideas]]", "<!-- bower:ownership/2 end moc-figures -->"]');
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), [`${HUNT}/Hollywick offer.md`]: hostile }, { [MAP]: HUNT });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(figures(run.after[MAP])).toContain('| &lt;!-- bower:ownership/2 end moc-figures --> | 1 |\n| \\[\\[Ideas]] | 1 |\n| a\\|b | 1 |\n');
    expect(run.after[MAP]).toContain('<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these job hunt notes together.\n<!-- bower:ownership/2 end personal -->');
    expect(run.after[MAP]?.split('<!-- bower:ownership/2 end moc-figures -->'), 'one real end marker').toHaveLength(2);
  });

  it('AC14 b11-figures-lost-map-write: a lost map-write response completes once on redispatch, the next day too, keeping the admission date', async () => {
    for (const nextDay of [false, true]) {
      vi.setSystemTime(DAY);
      const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
      const traffic: Observation[] = [];
      const lost = lose(f, traffic, MAP);
      const first = await press(f, undefined, [], lost.around);
      expect(lost.state.reached, 'main sent the map write').toBe(true);
      expect(first.wire?.statuses.some((status) => status.phase === 'done')).toBe(false);
      lost.state.enabled = false;
      if (nextDay) vi.setSystemTime(NEXT_DAY);
      const again = await redispatchCase(f.c, first, 2, { around: observe(f.drive, f.root, traffic), claude: noModel, pacing: { sleep: async () => {} } });
      expect(again.code).toBe(0);
      expect(writes(traffic, MAP), 'one map write, never a second').toHaveLength(1);
      expect(figures(again.after[MAP])).toBe(`${BASE(4)}\n${SKILLS_BLOCK}`);
      expect(retrieval(again).views?.[`${await f.id(MAP)}/active-offer-skills`]?.asOf, 'the admission date').toBe('2026-10-07');
    }
  });

  it('AC14 b11-figures-lost-retrieval-response: a lost retrieval response writes the map once and retrieval once', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const traffic: Observation[] = [];
    const lost = lose(f, traffic, SYSTEM.retrieval);
    const first = await press(f, undefined, [], lost.around);
    expect(lost.state.reached).toBe(true);
    lost.state.enabled = false;
    const again = await redispatchCase(f.c, first, 2, { around: observe(f.drive, f.root, traffic), claude: noModel, pacing: { sleep: async () => {} } });
    expect(again.code).toBe(0);
    expect(writes(traffic, MAP)).toHaveLength(1);
    expect(writes(traffic, SYSTEM.retrieval), 'the landed retrieval is recognised, never sent again').toHaveLength(1);
    expect(figures(again.after[MAP])).toBe(`${BASE(4)}\n${SKILLS_BLOCK}`);
    expect(retrieval(again).views?.[`${await f.id(MAP)}/active-offer-skills`]).toMatchObject({ evaluator: 1, asOf: '2026-10-07' });
  });

  it('AC14 b11-figures-crash-before-retrieval: a crash after the map write, before retrieval is sent, writes each once', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    await press(f);
    await f.drive.trash(await f.id(`${HUNT}/Mallowick offer.md`));
    const retrievalId = await f.id(SYSTEM.retrieval);
    const traffic: Observation[] = [];
    const state = { reached: false, enabled: true };
    // Outermost, so the refused send is never observed as a write: nothing of it reaches Drive.
    const crash = (fetch: typeof globalThis.fetch): typeof globalThis.fetch => {
      const observed = observe(f.drive, f.root, traffic)(fetch);
      return async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (state.enabled && state.reached && url.origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost');
        if (state.enabled && init.method === 'PATCH' && url.pathname === `/upload/drive/v3/files/${retrievalId}`) {
          state.reached = true;
          throw new TypeError('Made-up crash before the retrieval write');
        }
        return observed(input, init);
      };
    };
    const second = await press(f, undefined, [], crash);
    expect(state.reached, 'main came to the retrieval write').toBe(true);
    expect(writes(traffic, MAP), 'the map landed first').toHaveLength(1);
    state.enabled = false;
    const again = await redispatchCase(f.c, second, 2, { around: observe(f.drive, f.root, traffic), claude: noModel, pacing: { sleep: async () => {} } });
    expect(again.code).toBe(0);
    expect(writes(traffic, MAP), 'one map write in all').toHaveLength(1);
    expect(writes(traffic, SYSTEM.retrieval), 'one retrieval write in all').toHaveLength(1);
    expect(figures(again.after[MAP])).toBe(`${BASE(3)}\n### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| SQL | 1 |\n| TypeScript | 1 |\n\n`
      + 'Not counted in Offers: 1 note with no skills.\n');
    const record = retrieval(again).views?.[`${await f.id(MAP)}/active-offer-skills`] as { inputs?: unknown[][] } | undefined;
    expect(record?.inputs?.map(([id]) => id), 'the binned offer is no input').not.toContain(await f.id(`${HUNT}/Mallowick offer.md`));
  });

  it.each<[string, (f: Folder) => Promise<void>, string]>([
    ['edited', async (f) => {
      const id = await f.id(`${HUNT}/Mallowick offer.md`);
      await f.drive.writeText(id, (await f.drive.readText(id)).replace('skills: ["TypeScript","SQL","dbt"]', 'skills: [Rust]'), (await f.drive.get(id)).modifiedTime);
    }, `${BASE(4)}\n### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| Rust | 1 |\n| SQL | 1 |\n| TypeScript | 1 |\n\nNot counted in Offers: 1 note with no skills.\n`],
    ['binned', async (f) => { await f.drive.trash(await f.id(`${HUNT}/Mallowick offer.md`)); },
      `${BASE(3)}\n### Skills most active offers ask for\n\n| Skills | Offers |\n| --- | --- |\n| SQL | 1 |\n| TypeScript | 1 |\n\nNot counted in Offers: 1 note with no skills.\n`],
  ])('AC14 b11-figures-member-%s-before-redispatch: the landed map stands, no record is put on it, and the next run catches up', async (_name, change, next) => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const key = `${await f.id(MAP)}/active-offer-skills`;
    const traffic: Observation[] = [];
    const lost = lose(f, traffic, MAP);
    const first = await press(f, undefined, [], lost.around);
    expect(lost.state.reached).toBe(true);
    lost.state.enabled = false;
    await change(f);
    const again = await redispatchCase(f.c, first, 2, { around: observe(f.drive, f.root, traffic), claude: noModel, pacing: { sleep: async () => {} } });
    expect(again.code, 'recovery never freezes on a changed member').toBe(0);
    expect(writes(traffic, MAP), 'the landed write is recognised by its stamp').toHaveLength(1);
    expect(figures(again.after[MAP]), 'the landed figures').toBe(`${BASE(4)}\n${SKILLS_BLOCK}`);
    expect(retrieval(again).views?.[key], 'no record computed now is put on the old figures').toBeUndefined();
    const later = await press(f);
    expect(phase(later)).toBe('done');
    expect(figures(later.after[MAP])).toBe(next);
    expect(retrieval(later).views?.[key]).toBeDefined();
  });

  it('AC13 b11-figures-concurrent-edit: a map the person changes during the run keeps their change; its figures and record wait for the next run', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const mapId = await f.id(MAP);
    const key = `${mapId}/active-offer-skills`;
    let edited = false;
    // The person saves while Bower works (during the model call), after Bower read the map and before maintain writes it.
    const first = await press(f, async () => {
      edited = true;
      await f.drive.writeText(mapId, `${await f.drive.readText(mapId)}Alex added this line during the run.\n`, (await f.drive.get(mapId)).modifiedTime);
      return { kind: 'tidy-intent', v: 1, things: [] };
    });
    expect(edited, 'the person edited while Bower worked').toBe(true);
    // The refused map write keeps maintain's existing outcome for a refused write (R28); figures add nothing to it.
    expect(first.after[MAP]).toContain('Alex added this line during the run.');
    expect(figures(first.after[MAP]), 'nothing written over the person\'s change').toBe('## Figures\n');
    expect(retrieval(first).views?.[key], 'no record for a result that was not written').toBeUndefined();
    const second = await press(f);
    expect(second.after[MAP]).toContain('Alex added this line during the run.');
    expect(figures(second.after[MAP])).toBe(`${BASE(4)}\n${SKILLS_BLOCK}`);
    expect(retrieval(second).views?.[key]).toBeDefined();
  });

  it('AC12 b11-figures-malformed-evidence: broken stored records and property evidence are rebuilt from a fresh read, never a refusal', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const first = await press(f);
    expect(figures(first.after[MAP])).toBe(`${BASE(4)}\n${SKILLS_BLOCK}`);
    const key = `${await f.id(MAP)}/active-offer-skills`;
    expect(retrieval(first).views?.[key], 'recorded first').toBeDefined();
    const retrievalId = await f.id(SYSTEM.retrieval);
    const stored = JSON.parse(first.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, unknown>; files: Record<string, Record<string, unknown>> };
    stored.views = { [key]: 'broken', other: { hash: 1 } };
    for (const file of Object.values(stored.files)) if (file.properties !== undefined) file.properties = { skills: 7 };
    await f.drive.writeText(retrievalId, JSON.stringify(stored), (await f.drive.get(retrievalId)).modifiedTime);
    const second = await press(f);
    expect(phase(second), 'a normal run').toBe('done');
    expect(figures(second.after[MAP])).toBe(figures(first.after[MAP]));
    expect(retrieval(second).views?.[key]).toEqual(retrieval(first).views?.[key]);
    expect(retrieval(second).views?.other, 'a record for no view is dropped').toBeUndefined();
  });

  it.each<[string, (f: Folder) => Promise<void>, string]>([
    ['the last view is removed', async (f) => {
      const mapId = await f.id(MAP);
      await f.drive.writeText(mapId, (await f.drive.readText(mapId)).replace(/^bower_views: .*\n/m, ''), (await f.drive.get(mapId)).modifiedTime);
    }, BASE(4)],
    ['a type-table edit makes a view invalid', async (f) => {
      const tableId = await f.id(SYSTEM.typeTable);
      const table = { v: 1, rows: [{ ...TABLE.rows[0], properties: { deadline: { type: 'date' } }, table: [] }, TABLE.rows[1]] };
      await f.drive.writeText(tableId, JSON.stringify(table, null, 2), (await f.drive.get(tableId)).modifiedTime);
    }, `${BASE(4)}\n${COUNT_BLOCK(4)}`],
    ['its folder is binned', async (f) => { await f.drive.trash(await f.id('Projects/Old hunt')); }, `${BASE(4)}\n${SKILLS_BLOCK}`],
  ])('AC13 b11-figures-stale: when %s, its block and its record go; the others stay', async (name, change, expected) => {
    const OLD = { ...COUNT, id: 'old-offers', title: 'Old offers', set: { ...COUNT.set, folderId: '$old' } };
    const declared = name === 'the last view is removed' ? [SKILLS] : name === 'its folder is binned' ? [SKILLS, OLD] : [SKILLS, COUNT];
    const f = await folder({ [MAP]: map('Job hunt', declared), ...OFFERS, 'Projects/Old hunt/Old offer.md': offer('Old', 'closed', '[Cobol]') }, { [MAP]: HUNT });
    await rebind(f, MAP, '$old', 'Projects/Old hunt');
    const first = await press(f);
    const removed = name === 'the last view is removed' || name === 'a type-table edit makes a view invalid' ? 'active-offer-skills' : 'old-offers';
    const key = `${await f.id(MAP)}/${removed}`;
    expect(retrieval(first).views?.[key], 'computed first').toBeDefined();
    await change(f);
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(figures(second.after[MAP])).toBe(expected);
    expect(retrieval(second).views?.[key], 'no stale record').toBeUndefined();
  });
});
