/** B11e through production main: a person's explicit request installs a formula in its type row (TL-P4-48 Q1, Q3, Q4, Q7). */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote, readTypeTable, rewriteTypeTable, typeRowOk } from '../../src/data/contracts/note-format';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, caseReplies, redispatchCase, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Flat hunt';
const PRICE = { property: 'price_per_area', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { property: 'area' } } };
const DAYS = { property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } };
const FLATS = { v: 1, id: 'flat-metrics', kind: 'formula', type: 'flat', outputs: [PRICE, DAYS] };
const FLAT = { id: 'flat', match: ['flat listing'], template: 'source',
  properties: { rent: { type: 'money' }, area: { type: 'number' }, deadline: { type: 'date' }, location: { type: 'text' } }, table: ['rent', 'area', 'deadline', 'location'] };
const OFFER = { id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' } }, table: ['skills'] };
const TABLE_TEXT = `${JSON.stringify({ v: 1, rows: [OFFER, FLAT] }, null, 2)}\n`;
const money = (amount: number) => JSON.stringify({ amount, currency: 'EUR' });
const flat = (name: string, lines: string[], by = 'by: bower\n') => `---\nsummary: ${name} is in Saltmere.\ntype: flat\n${by}created: 2026-10-01\n`
  + `${lines.join('\n')}\n---\n\n${name} is in Saltmere.\nRelated: [[Flat hunt]].\n`;
const AMBER = `${HUNT}/Amber flat.md`;
const ALEX = `${HUNT}/Alex flat.md`;
const FILES = {
  [AMBER]: flat('Amber flat', [`rent: ${money(1000)}`, 'area: 50', 'deadline: 2026-10-14']),
  [ALEX]: flat('Alex flat', [`rent: ${money(500)}`, 'area: 25', 'deadline: 2026-10-14'], ''),
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

async function folder(table = TABLE_TEXT, files: Record<string, string> = FILES) {
  const c: LoadedCase = { id: 'b11-formula-install', capability: 'C05', title: 'Alex adds flat columns', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: table, 'Rules.md': '# Rules\n', ...files } };
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
type Intent = (request: string, attempt: number) => unknown;

async function press(f: Folder, intent: Intent, o: { words?: string; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  const words = o.words ?? 'For flats, calculate rent per square metre and days left before the deadline, and show the rent per square metre in the flat table.';
  const request = await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
    device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => DAY + f.press, newId: () => `b11-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: hunt, wants: [] })), asks: [] });
    return reply(await intent(request.id, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'instructions', requestId: `b11-run-${f.press}` }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, request: request.id };
}
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const install = (requestId: string, definition: unknown = FLATS, extra: Record<string, unknown> = { column: 'price_per_area' }, rowId = 'flat') =>
  ({ ...empty, views: [{ requestId, home: { kind: 'type-row', rowId }, mode: 'install', definition, ...extra }] });
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const rowOf = (run: CaseRun, id = 'flat') => (JSON.parse(run.after[SYSTEM.typeTable] ?? '{}') as { rows: Array<Record<string, unknown>> }).rows.find((r) => r.id === id);
function computed(text: string | undefined, key: string): unknown {
  const value = parseNote('note.md', text ?? '').properties.find((p) => p.key === key)?.value;
  return value === undefined ? undefined : JSON.parse(value) as unknown;
}
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
/** Each refusal of the run as [kind, reason], from the provider's log line. */
const refused = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [[m[1], m[2]]] : []; });
/** The widened viewKeys reason (R45, R58, widened for suggestions by R63): what a shape fault of a view entry says. */
const VIEW_KEYS_TEXT = 'a view with keys outside the intent ({requestId, home: {kind: "moc", fileId} or {kind: "type-row", rowId}, mode: "install" or "propose", '
  + 'definition; for a formula installed in a type row an optional column: one of its outputs; to propose, the question\'s text, yes and no}) or a declaration the grammar refuses';
const grammar = (fault: string) => `a view the grammar refuses: ${fault}`;
const region = (name: string, body = '') => `<!-- bower:ownership/2 begin ${name} -->\n${body}<!-- bower:ownership/2 end ${name} -->\n`;
/** A Bower map of the flat hunt, with the views given (each `$folder` bound after seeding). */
const flatMap = (views?: unknown[]) => `---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: Flat hunt reference notes.\n`
  + `${views ? `bower_views: ${JSON.stringify(views)}\n` : ''}---\n`
  + region('current') + region('personal', '## My notes\nAlex keeps the flats together.\n') + region('timeline') + region('bower-note')
  + region('moc-overview', '## Overview\nFlat hunt reference notes.\n') + region('moc-figures', '## Figures\n') + region('moc-members', '## Notes\n');
const MAP = `${HUNT}/Flat hunt.md`;
const COUNT = { v: 1, id: 'flat-count', kind: 'aggregate', title: 'Flats', set: { type: 'flat', folderId: '$folder', recursive: true }, groupBy: [],
  measures: [{ id: 'n', label: 'Flats', op: 'count' }] };
/** An invalid stored formula beside the install, written compact so its bytes can be found again. */
const BROKEN = { v: 1, id: 'flat-broken', kind: 'formula', type: 'flat', outputs: [{ property: 'area_left', type: 'number', expr: { op: 'eval' } }] };
const brokenTable = (views: unknown[], row: Record<string, unknown> = FLAT) => {
  const declared = { ...row, properties: { ...(row.properties as object), area_left: { type: 'number' } } };
  return `{\n"v": 1,\n"rows": [\n${JSON.stringify(OFFER)},\n${JSON.stringify(declared).replace(/}$/, `,"views":[${views.map((v) => JSON.stringify(v)).join(',')}]}`)}\n]\n}\n`;
};
const AREA = { v: 1, id: 'flat-area', kind: 'formula', type: 'flat', outputs: [{ property: 'area_left', type: 'number', expr: { op: '-', left: { property: 'area' }, right: { number: 30 } } }] };
const settled = (run: CaseRun, id: string) => !Object.keys(run.after).some((path) => path.startsWith(`${SYSTEM.changes}/`)
  && !path.startsWith(`${SYSTEM.archive}/`) && path.endsWith(`${id}.json`));
const retrieval = (run: CaseRun) => JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, Record<string, unknown>> };
/** A run with no request, no pile and no model (the figures' idle harness, b11-figures.test.ts). */
async function idle(f: Folder): Promise<CaseRun> {
  f.press++;
  const runId = `b11-idle-${f.press}`;
  const run = await runOnDrive(f.c, f.drive, f.root, { admission: { v: 1, id: runId, rootId: f.root, scope: 'all', at: DAY + f.press, piles: [], journal: [] },
    pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope: 'all', requestId: runId } }, f.press);
  expect(phase(run), 'the idle run ends well').toBe('done');
  return run;
}
const HALF_FOR_BYTES = { ...FLATS, outputs: [{ ...PRICE, expr: { op: '/', left: { property: 'rent' }, right: { number: 2 } } }, DAYS] };
const INSTALLED = { ...FLAT, properties: { ...FLAT.properties, price_per_area: { type: 'money' }, days_left: { type: 'number' } },
  table: ['rent', 'area', 'deadline', 'price_per_area'], views: [FLATS] };

describe('B11e formula installs through production main', () => {
  it('AC30 b11-flat-case-landed: the flat case uses the landed grammar and asks for one column', async () => {
    const id = 'c17-b11-flat-formulas';
    const c = await loadCase(join(ROOT, id));
    const table = c.folder[SYSTEM.typeTable];
    expect(JSON.parse(table ?? '{}'), 'every row is a valid stored row, with no formula yet').toEqual(readTypeTable(table ?? null).table);
    expect(table).not.toContain('"views"');
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ views?: Array<Record<string, unknown>> }>;
    expect(replies[0]?.views?.[0]).toMatchObject({ requestId: '$request:change-1', home: { kind: 'type-row', rowId: 'flat' }, mode: 'install', column: 'price_per_area' });
    const text = [table, JSON.stringify(replies), ...Object.values(c.folder), JSON.stringify(c.expected), c.rubric].join('\n');
    for (const stale of ['"computedBy"', '"label"', ' EUR\n', 'Preparation only'])
      expect(text, `no stale specimen ${stale}`).not.toContain(stale);
    expect(existsSync(join(ROOT, id, 'expected-view-results.json'))).toBe(false);
    const run = await runWithClaude(c, caseReplies(id));
    expect(phase(run)).toBe('done');
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
  });

  it('AC31 b11-formula-install: the request installs the formula in the row, declares its outputs and the one column; the run computes them', async () => {
    const f = await folder();
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution']);
    expect(rowOf(run), 'outputs declared with their types, the requested column replacing the fourth').toEqual(INSTALLED);
    expect(rowOf(run, 'offer'), 'other rows are kept').toEqual(OFFER);
    expect(typeRowOk(rowOf(run)), 'the installed row is a valid write').toBe(true);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
    expect(run.after[ALEX]).toBe(FILES[ALEX]);
  });

  it('AC31 b11-formula-reinstall: the same formula id with the same outputs replaces its expression; the next run recomputes', async () => {
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, INSTALLED] }, null, 2)}\n`);
    const changed = { ...FLATS, outputs: [{ ...PRICE, expr: { op: '/', left: { property: 'rent' }, right: { number: 2 } } }, DAYS] };
    const run = await press(f, (request) => install(request, changed, {}));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)?.views).toEqual([changed]);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual({ amount: 500, currency: 'EUR' });
  });

  it.each<[string, Intent, string, string]>([
    ['an unknown key on the formula', (request) => install(request, { ...FLATS, note: 'x' }), 'viewKeys', grammar('The view has a key it does not know.')],
    ['a row that does not exist', (request) => install(request, { ...FLATS, type: 'house' }, {}, 'house'), 'viewKeys', grammar('The view is for a type that does not exist.')],
    ['a formula for another row than its home', (request) => install(request, FLATS, {}, 'offer'), 'viewBinding', 'a formula whose home is not the type row it is for'],
    ['an output over a declared property', (request) => install(request, { ...FLATS, outputs: [{ property: 'area', type: 'number', expr: { property: 'area' } }] }, {}),
      'viewKeys', grammar('A formula cannot replace a declared property.')],
    ['a column that is not an output', (request) => install(request, FLATS, { column: 'location' }), 'viewKeys', 'a column that is not one of the formula\'s outputs'],
    ['two columns', (request) => install(request, FLATS, { column: ['price_per_area', 'days_left'] }), 'viewKeys', VIEW_KEYS_TEXT],
    ['an empty column', (request) => install(request, FLATS, { column: '' }), 'viewKeys', VIEW_KEYS_TEXT],
    ['two columns for one request', (request) => ({ ...empty, views: [install(request).views[0], install(request, AREA, { column: 'area_left' }).views[0]] }),
      'viewLimit', 'more than one column for one request'],
  ])('AC32 b11-formula-refusals: %s refuses the reply once with its own kind and reason; the corrected reply installs', async (_name, wrong, kind, why) => {
    const f = await folder();
    const run = await press(f, (request, attempt) => attempt === 0 ? wrong(request, attempt) : install(request));
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution', 'execution']);
    // The view kinds b11-install added: no new refusal kind (R45), so per-thing-ask lists every kind unchanged.
    expect(refused()).toEqual([[kind, why]]);
    expect(rowOf(run)).toEqual(INSTALLED);
  });

  it('AC32 b11-formula-column-on-map: a valid map view with a column is refused once; the same reply without it installs in the map', async () => {
    const f = await folder(TABLE_TEXT, { ...FILES, [MAP]: flatMap() });
    const mapView = async (request: string, extra: Record<string, unknown>) => ({ ...empty, views: [{ requestId: request, home: { kind: 'moc', fileId: await f.id(MAP) },
      mode: 'install', definition: { ...COUNT, set: { ...COUNT.set, folderId: await f.id(HUNT) } }, ...extra }] });
    const run = await press(f, (request, attempt) => mapView(request, attempt === 0 ? { column: 'price_per_area' } : {}));
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([['viewKeys', VIEW_KEYS_TEXT]]);
    expect(run.after[MAP], 'the corrected reply installs the map view').toMatch(/^bower_views: /m);
    expect(rowOf(run), 'no table write').toEqual(FLAT);
  });

  it('AC32 b11-formula-column-on-map-twin (guard): the same map view without a column installs at once', async () => {
    const f = await folder(TABLE_TEXT, { ...FILES, [MAP]: flatMap() });
    const run = await press(f, async (request) => ({ ...empty, views: [{ requestId: request, home: { kind: 'moc', fileId: await f.id(MAP) },
      mode: 'install', definition: { ...COUNT, set: { ...COUNT.set, folderId: await f.id(HUNT) } } }] }));
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution']);
    expect(run.after[MAP]).toMatch(/^bower_views: /m);
  });

  const YEAR = { v: 1, id: 'flat-year', kind: 'formula', type: 'flat', outputs: [{ property: 'rent_year', type: 'money', expr: { op: '*', left: { property: 'rent' }, right: { number: 12 } } }] };
  const TWELVE = { v: 1, id: 'flat-twelve', kind: 'formula', type: 'flat', outputs: [{ property: 'rent_year', type: 'money', expr: { op: '+', left: { property: 'rent' }, right: { property: 'rent' } } }] };
  const SHARE = { v: 1, id: 'flat-share', kind: 'formula', type: 'flat', outputs: [{ property: 'year_share', type: 'number', expr: { op: '/', left: { property: 'rent_year' }, right: { property: 'rent' } } }] };
  it.each<[string, unknown[], string]>([
    ['two formulas claiming one new output', [YEAR, TWELVE], grammar('Another view already computes that property.')],
    ['two formulas claiming one new output, the other order', [TWELVE, YEAR], grammar('Another view already computes that property.')],
    ['a formula reading what an earlier one computes', [YEAR, SHARE], grammar('A formula never reads a computed property.')],
    ['a formula reading what a later one computes', [SHARE, YEAR], grammar('The view uses a property the type does not declare.')],
  ])('AC32 b11-formula-batch-refused: %s is refused whole, with nothing installed; the corrected reply installs', async (_name, pair, why) => {
    const f = await folder();
    const tableId = await f.id(SYSTEM.typeTable);
    let tableWrites = 0;
    const run = await press(f, (request, attempt) => attempt === 0 ? { ...empty, views: pair.map((d) => install(request, d, {}).views[0]) } : install(request), {
      around: (next) => async (input, init) => {
        if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) tableWrites++;
        return next(input, init);
      } });
    expect(phase(run)).toBe('done');
    // Candidates of one reply are checked in order against the row with the earlier ones installed: raw inputs only (R58).
    expect(refused()).toEqual([['viewKeys', why]]);
    expect(tableWrites, 'one write, of the corrected reply only').toBe(1);
    expect(rowOf(run)).toEqual(INSTALLED);
  });

  it('AC32 b11-formula-outputs-kept: a reinstall with other outputs is refused; the installed formula stays', async () => {
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, INSTALLED] }, null, 2)}\n`);
    const changed = { ...FLATS, outputs: [{ ...PRICE, expr: { op: '/', left: { property: 'rent' }, right: { number: 2 } } }, DAYS] };
    const run = await press(f, (request, attempt) => attempt === 0 ? install(request, { ...FLATS, outputs: [DAYS] }, {}) : install(request, changed, {}));
    expect(run.calls).toEqual(['selection', 'execution', 'execution']);
    expect(refused()).toEqual([['viewKeys', grammar('A reinstalled formula keeps its computed properties.')]]);
    expect(phase(run), 'the same outputs with a new expression install in the corrected reply').toBe('done');
    expect(rowOf(run)).toEqual({ ...INSTALLED, views: [changed] });
  });

  it('AC34 b11-formula-concurrent-table: a table the person changes during the run keeps their change; the request waits and installs once next run', async () => {
    const f = await folder();
    const tableId = await f.id(SYSTEM.typeTable);
    let edited = false;
    // The person saves while Bower works (during the model call), after Bower read the table and before the install writes it.
    const first = await press(f, async (request) => {
      if (!edited) {
        edited = true;
        const table = JSON.parse(await f.drive.readText(tableId)) as { rows: Array<{ id: string; match: string[] }> };
        table.rows.find((r) => r.id === 'flat')?.match.push('flat share');
        await f.drive.writeText(tableId, JSON.stringify(table, null, 2), (await f.drive.get(tableId)).modifiedTime);
      }
      return install(request);
    });
    expect(edited, 'the person edited while Bower worked').toBe(true);
    expect(rowOf(first)?.match, 'the person\'s change is kept').toContain('flat share');
    expect(rowOf(first)?.views, 'nothing installed over it').toBeUndefined();
    const second = await press(f, () => install(first.request), { words: 'Update these notes.' });
    expect(phase(second)).toBe('done');
    expect(rowOf(second)?.match).toContain('flat share');
    expect(rowOf(second)?.views).toEqual([FLATS]);
  });

  it('AC34 b11-formula-recovery: a crash after the table write completes once on redispatch, with no model call', async () => {
    const f = await folder();
    const tableId = await f.id(SYSTEM.typeTable);
    let crashed = false;
    const first = await press(f, (request) => install(request), { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up crash after the table write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'main reached the table write').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(rowOf(resumed)).toEqual(INSTALLED);
    expect(computed(resumed.after[AMBER], 'days_left')).toBe(7);
  });

  it('AC31 b11-formula-identical: reinstalling the very formula and column a row holds settles the request with no table write', async () => {
    const text = `${JSON.stringify({ v: 1, rows: [OFFER, INSTALLED] }, null, 2)}\n`;
    const f = await folder(text);
    const tableId = await f.id(SYSTEM.typeTable);
    let tableWrites = 0;
    const run = await press(f, (request) => install(request), { around: (next) => async (input, init) => {
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) tableWrites++;
      return next(input, init);
    } });
    expect(phase(run)).toBe('done');
    expect(tableWrites, 'nothing to write').toBe(0);
    expect(run.after[SYSTEM.typeTable]).toBe(text);
    expect(settled(run, 'press-1'), 'the request is done, never left waiting').toBe(true);
  });

  it('AC31 b11-formula-identical-as-values: keys in another order, inside the outputs too, are the same formula; another output order is not', async () => {
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    const stored = { ...INSTALLED, views: [reorder(FLATS)] };
    expect(Object.keys(stored.views[0] as object)[0], 'stored with its keys reversed').toBe('outputs');
    const writes = async (definition: unknown) => {
      const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, stored] }, null, 2)}\n`);
      const tableId = await f.id(SYSTEM.typeTable);
      let tableWrites = 0;
      const run = await press(f, (request) => install(request, definition), { around: (next) => async (input, init) => {
        if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) tableWrites++;
        return next(input, init);
      } });
      expect(phase(run)).toBe('done');
      return { run, tableWrites };
    };
    expect((await writes(FLATS)).tableWrites, 'equal as JSON values: nothing to write').toBe(0);
    const swapped = { ...FLATS, outputs: [DAYS, PRICE] };
    const other = await writes(swapped);
    expect(other.tableWrites, 'a list in another order is another value').toBe(1);
    expect(rowOf(other.run)?.views).toEqual([swapped]);
  });

  it('AC31 b11-formula-batch: one request may install two formulas in one row, with at most one column, in one table write', async () => {
    const f = await folder();
    const tableId = await f.id(SYSTEM.typeTable);
    let tableWrites = 0;
    const run = await press(f, (request) => ({ ...empty, views: [install(request).views[0], install(request, AREA, {}).views[0]] }), { around: (next) => async (input, init) => {
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) tableWrites++;
      return next(input, init);
    } });
    expect(phase(run)).toBe('done');
    expect(tableWrites, 'one table write').toBe(1);
    expect(rowOf(run)).toEqual({ ...INSTALLED, properties: { ...INSTALLED.properties, area_left: { type: 'number' } }, views: [FLATS, AREA] });
    expect(computed(run.after[AMBER], 'area_left')).toBe(20);
    expect(settled(run, 'press-1')).toBe(true);
  });

  it('AC31 b11-formula-bytes: rows the install does not touch keep their bytes', async () => {
    const offerText = JSON.stringify(OFFER, null, 1).replace(/\n/g, ' ');
    const text = `{"v":1,"rows":[ ${offerText} ,\n${JSON.stringify(FLAT, null, 2)}\n]}\n`;
    const f = await folder(text);
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(run.after[SYSTEM.typeTable], 'the offer row, byte for byte').toContain(offerText);
    expect(rowOf(run)).toEqual(INSTALLED);
  });

  it('AC31 b11-formula-bytes-entries: a reinstall rewrites only its entry; a later entry with its id goes, the others keep their bytes', () => {
    const other = ' { "v": 1, "id": "flat-area", "kind": "formula", "type": "flat", "outputs": [] } ';
    const stored = (views: string) => `{"v":1,"rows":[${JSON.stringify({ ...INSTALLED, views: undefined }).replace(/}$/, `,"views":[${views}]}`)}]}\n`;
    const text = stored(`${JSON.stringify(FLATS)},${other},\n ${JSON.stringify({ ...FLATS, outputs: [] })} `);
    const before = readTypeTable(text).table;
    const row = before.rows[0];
    if (!row) throw new Error('The made-up table has no row');
    const next = { ...before, rows: [{ ...row, views: [HALF_FOR_BYTES, JSON.parse(other) as unknown] }] };
    const written = rewriteTypeTable(text, before, next);
    expect(written).toBe(stored(`${JSON.stringify(HALF_FOR_BYTES)},${other}`));
  });

  it('AC34 b11-formula-crash-before-write: a crash before the table write is sent completes on redispatch with the table written once', async () => {
    const f = await folder();
    const tableId = await f.id(SYSTEM.typeTable);
    const state = { reached: false };
    const first = await press(f, (request) => install(request), { around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) {
        state.reached = true;
        throw new TypeError('Made-up crash before the table write.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the table write').toBe(true);
    let sent = 0;
    const resumed = await redispatchCase(f.c, first, 2, { claude: async () => { throw new Error('A redispatch must not call a model.'); }, pacing: { baseMs: 0, sleep: async () => {} },
      around: (next) => async (input, init) => {
        if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${tableId}`) sent++;
        return next(input, init);
      } });
    expect(phase(resumed)).toBe('done');
    expect(sent, 'one table write').toBe(1);
    expect(rowOf(resumed)).toEqual(INSTALLED);
  });

  it('AC34 b11-formula-manifest: the table write is accepted; a resealed write with a refused formula or undeclared outputs is refused', async () => {
    const f = await folder();
    const run = await press(f, (request) => install(request));
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const write = stored.operations?.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.typeTable);
    expect(write, 'the stored manifest holds the table write').toBeDefined();
    expect(await ok(stored)).toBe(true);
    expect(await ok(await resealed(stored, (t) => t)), 'the reseal itself keeps it valid').toBe(true);
    const swap = (from: unknown, to: unknown) => (t: string) => t.split(JSON.stringify(from)).join(JSON.stringify(to));
    expect(await ok(await resealed(stored, swap(DAYS.expr, { op: 'eval' }))), 'a formula the grammar refuses').toBe(false);
    const retyped = (t: string) => t.split('"days_left":{"type":"number"}').join('"days_left":{"type":"date"}');
    expect(retyped(JSON.stringify(rowOf(run))), 'only the output\'s declaration changes').not.toBe(JSON.stringify(rowOf(run)));
    expect(await ok(await resealed(stored, retyped)), 'an output declared with another type').toBe(false);
  });

  it('AC34 b11-formula-manifest-invalid-sibling: an install beside an invalid stored formula on the same row is written and accepted; that entry keeps its bytes', async () => {
    // Stored as a person may format it: whitespace inside the invalid entry and inside an untouched declaration (R40, R59).
    const spaced = JSON.stringify(BROKEN, null, 1);
    const declaration = '"area_left": { "type": "number" }';
    const table = brokenTable([BROKEN]).replace(JSON.stringify(BROKEN), spaced).replace('"area_left":{"type":"number"}', declaration);
    expect(table).toContain(spaced);
    expect(table).toContain(declaration);
    const f = await folder(table);
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)?.views, 'installed beside it').toEqual([BROKEN, FLATS]);
    expect(run.after[SYSTEM.typeTable], 'the invalid entry, byte for byte').toContain(`[${spaced},`);
    expect(run.after[SYSTEM.typeTable], 'an untouched declaration, byte for byte').toContain(declaration);
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    expect((await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(stored)), f.root, RUNNER_WRITES)).ok, 'the guard checks only what the write adds').toBe(true);
  });

  it('AC34 b11-formula-manifest-forged-before: a resealed write adding an invalid formula is refused, even with before evidence forged to hold it', async () => {
    const f = await folder(brokenTable([BROKEN]));
    const run = await press(f, (request) => install(request));
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    expect(stored.operations?.some((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.typeTable), 'the stored manifest holds the table write').toBe(true);
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const EVIL = { ...BROKEN, id: 'flat-evil', outputs: [{ property: 'rent_year', type: 'money', expr: { op: 'eval' } }] };
    const plant = (t: string) => t.split(JSON.stringify(BROKEN)).join(`${JSON.stringify(BROKEN)},${JSON.stringify(EVIL)}`);
    expect(plant(JSON.stringify(rowOf(run))), 'the forgery plants the formula').toContain('flat-evil');
    expect(await ok(await resealed(stored, (t) => t)), 'the reseal alone keeps it valid').toBe(true);
    expect(await ok(await resealed(stored, plant)), 'planted in the written table only').toBe(false);
    // Every piece of before evidence the write carries, but its verified digest, is forged to hold the planted formula too.
    const forgeDeep = (v: unknown): unknown => typeof v === 'string' ? plant(v)
      : Array.isArray(v) ? v.flatMap((x) => (JSON.stringify(x) === JSON.stringify(BROKEN) ? [x, EVIL] : [forgeDeep(x)]))
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forgeDeep(x)])) : v;
    const forge = (effect: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(effect)) if (!['kind', 'path', 'text', 'content', 'beforeContent', 'before'].includes(key)) effect[key] = forgeDeep(value);
    };
    expect(await ok(await resealed(stored, plant, forge)), 'labelled untouched by forged before evidence: the prior digest decides').toBe(false);
  });

  it.each<[string, unknown]>([
    ['a missing output type', { property: 'days_left', expr: DAYS.expr }],
    ['a corrupt output type', { ...DAYS, type: 'weeks' }],
  ])('AC31 b11-formula-repairs-invalid: an install by id repairs a stored formula with %s; the candidate\'s type is written', async (_name, output) => {
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, { ...INSTALLED, views: [{ ...FLATS, outputs: [PRICE, output] }] }] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(run.calls, 'never refused').toEqual(['selection', 'execution']);
    expect(rowOf(run)).toEqual(INSTALLED);
  });

  it('AC32 b11-formula-repair-contradicted: an install by id whose output contradicts a valid stored type is refused; the stored formula stays', async () => {
    const stored = { ...FLATS, outputs: [PRICE, { ...DAYS, type: 'money', expr: { op: 'eval' } }] };
    const row = { ...INSTALLED, properties: { ...INSTALLED.properties, days_left: { type: 'money' } }, views: [stored] };
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, row] }, null, 2)}\n`);
    const run = await press(f, (request, attempt) => attempt === 0 ? install(request) : install(request, AREA, {}));
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([['viewKeys', grammar('A reinstalled formula keeps its computed properties.')]]);
    expect(rowOf(run)?.views, 'the corrected reply installs beside it').toEqual([stored, AREA]);
  });

  it('AC31 b11-formula-wide-table: a stored row with more than four columns gets the column in the fourth place; the extra columns stay', async () => {
    const wide = { ...FLAT, properties: { ...FLAT.properties, agent: { type: 'text' } }, table: [...FLAT.table, 'agent'] };
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, wide] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(run.calls, 'never refused').toEqual(['selection', 'execution']);
    expect(rowOf(run)?.table, 'the fourth column replaced, the fifth kept').toEqual(['rent', 'area', 'deadline', 'price_per_area', 'agent']);
    expect(rowOf(run)?.views).toEqual([FLATS]);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
  });

  it('AC31 b11-formula-replaces-invalid: an install with the id of an invalid stored formula replaces it', async () => {
    const invalid = { ...FLATS, outputs: [PRICE, { ...DAYS, expr: { op: 'eval' } }] };
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, { ...INSTALLED, views: [invalid] }] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)).toEqual(INSTALLED);
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
  });

  it('AC32 b11-formula-invalid-holds-output: an install claiming an output an invalid stored formula lists is refused; the corrected reply installs beside it', async () => {
    const f = await folder(brokenTable([BROKEN]));
    const run = await press(f, (request, attempt) => attempt === 0 ? install(request, AREA, {}) : install(request));
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([['viewKeys', grammar('Another view already computes that property.')]]);
    expect(rowOf(run)?.views).toEqual([BROKEN, FLATS]);
  });

  it('AC31 b11-formula-install-known-folder: in a folder Bower already knows, every Bower flat gets values, past the prefix too; body lines are kept; an idle run after it writes nothing', async () => {
    const GORSE = `${HUNT}/Gorse flat.md`;
    const files = { ...FILES, [AMBER]: (FILES[AMBER] ?? '').replace('Related:', 'days_left: soon\nprice_per_area: lots\nRelated:'),
      [GORSE]: flat('Gorse flat', [`x_note: ${'p'.repeat(5000)}`, `rent: ${money(400)}`, 'area: 20', 'deadline: 2026-10-14']) };
    const f = await folder(TABLE_TEXT, files);
    // A first run reads the folder with no formula: membership and property evidence are kept from it.
    const known = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(known)).toBe('done');
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)).toEqual(INSTALLED);
    for (const path of [AMBER, GORSE]) {
      expect(computed(run.after[path], 'price_per_area'), `${path}: computed in the install run`).toEqual({ amount: 20, currency: 'EUR' });
      expect(computed(run.after[path], 'days_left'), path).toBe(7);
    }
    expect(run.after[AMBER], 'body text that looks like front matter is kept').toContain('\ndays_left: soon\nprice_per_area: lots\nRelated:');
    expect(run.after[ALEX]).toBe(FILES[ALEX]);
    // Drains the feed of the run's own writes; then a run with nothing to do writes no table and no flat.
    await idle(f);
    const quiet = await idle(f);
    for (const path of [SYSTEM.typeTable, AMBER, GORSE, ALEX]) expect(quiet.after[path], `${path}: unchanged`).toBe(run.after[path]);
  });

  it('AC31 b11-formula-install-with-figures: installing a formula keeps a map\'s figures and their record beside the new formula records', async () => {
    const mapText = flatMap([COUNT]);
    const f = await folder(TABLE_TEXT, { ...FILES, [MAP]: mapText });
    const mapId = await f.id(MAP);
    await f.drive.writeText(mapId, mapText.split('"$folder"').join(JSON.stringify(await f.id(HUNT))), (await f.drive.get(mapId)).modifiedTime);
    const first = await press(f, () => empty, { words: 'Update these notes.' });
    expect(first.after[MAP], 'the figures are written').toContain('### Flats');
    expect(retrieval(first).views?.[`${mapId}/flat-count`], 'and recorded').toBeDefined();
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)).toEqual(INSTALLED);
    expect(run.after[MAP], 'the same figures').toBe(first.after[MAP]);
    expect(retrieval(run).views?.[`${mapId}/flat-count`], 'the figures\' record stays').toBeDefined();
    expect(retrieval(run).views?.[`${await f.id(AMBER)}/flat-metrics`], 'beside the new formula record').toBeDefined();
  });

  // Round-3 rulings (binding like acceptance): the requested column stays where it is; the guard checks against the verified row it replaced.
  const HALF = { ...FLATS, outputs: [{ ...PRICE, expr: { op: '/', left: { property: 'rent' }, right: { number: 2 } } }, DAYS] };
  it('AC31 b11-formula-fifth-column: a reinstall whose output is already the fifth column keeps the table as stored and installs the formula', async () => {
    const wide = { ...INSTALLED, properties: { ...INSTALLED.properties, agent: { type: 'text' } }, table: ['rent', 'area', 'deadline', 'agent', 'price_per_area'] };
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, wide] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request, HALF));
    expect(phase(run)).toBe('done');
    expect(run.calls, 'never refused').toEqual(['selection', 'execution']);
    expect(rowOf(run)?.table, 'no move and no duplicate').toEqual(wide.table);
    expect(rowOf(run)?.views).toEqual([HALF]);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual({ amount: 500, currency: 'EUR' });
  });

  /** A reinstall of a new expression over the installed row, its stored manifest, and resealed edits of the written flat row. */
  async function reinstalled() {
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, INSTALLED] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request, HALF, {}));
    expect(phase(run)).toBe('done');
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    expect(await ok(stored), 'the stored reinstall is accepted').toBe(true);
    const edit = (change: (row: Record<string, unknown>) => void) => (t: string) => {
      const table = JSON.parse(t) as { rows: Array<Record<string, unknown>> };
      const row = table.rows.find((r) => r.id === 'flat');
      if (!row) throw new Error('The written table has no flat row');
      change(row);
      return JSON.stringify(table);
    };
    /** The written row looks valid on its own: only the verified row before the write tells the mutation apart. */
    const looksValid = (change: (t: string) => string) => typeRowOk((JSON.parse(change(JSON.stringify({ v: 1, rows: [rowOf(run)] }))) as { rows: unknown[] }).rows[0]);
    return { stored, ok, edit, looksValid };
  }
  it('AC34 b11-formula-manifest-before-row: a resealed formula taking over raw area, or a reinstall adding outputs, is refused against the verified row it replaced', async () => {
    const { stored, ok, edit, looksValid } = await reinstalled();
    const TAKE = { v: 1, id: 'flat-take', kind: 'formula', type: 'flat', outputs: [{ property: 'area', type: 'number', expr: { number: 50 } }] };
    const takeover = edit((row) => { row.views = [...row.views as unknown[], TAKE]; });
    const YEARLY = { property: 'rent_year', type: 'money', expr: { op: '*', left: { property: 'rent' }, right: { number: 12 } } };
    const grown = edit((row) => {
      row.views = [{ ...HALF, outputs: [...HALF.outputs, YEARLY] }];
      row.properties = { ...row.properties as object, rent_year: { type: 'money' } };
    });
    expect(looksValid(takeover), 'the taken-over row alone looks valid').toBe(true);
    expect(looksValid(grown), 'the grown row alone looks valid').toBe(true);
    expect(await ok(await resealed(stored, takeover)), 'a new formula over the raw area').toBe(false);
    expect(await ok(await resealed(stored, grown)), 'a reinstall adding an output').toBe(false);
  });
  it('AC34 b11-formula-manifest-retyped-input: a resealed install that retypes a raw input its formula reads is refused on the row it writes', async () => {
    const f = await folder();
    const run = await press(f, (request) => install(request));
    expect(phase(run)).toBe('done');
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    expect(await ok(stored)).toBe(true);
    const retyped = (t: string) => t.split('"area":{"type":"number"}').join('"area":{"type":"date"}');
    expect(retyped(JSON.stringify(rowOf(run))), 'only the raw declaration changes').not.toBe(JSON.stringify(rowOf(run)));
    expect(await ok(await resealed(stored, retyped)), 'rent divided by a date').toBe(false);
  });
  it('AC34 b11-formula-manifest-untouched-broken: a resealed install that retypes an input an untouched installed formula reads is refused', async () => {
    const f = await folder(`${JSON.stringify({ v: 1, rows: [OFFER, INSTALLED] }, null, 2)}\n`);
    const run = await press(f, (request) => install(request, AREA, {}));
    expect(phase(run)).toBe('done');
    expect(rowOf(run)?.views).toEqual([FLATS, AREA]);
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    expect(await ok(stored)).toBe(true);
    // The new formula reads only area; the untouched one's money output would come from a number.
    const retyped = (t: string) => t.split('"rent":{"type":"money"}').join('"rent":{"type":"number"}');
    expect(retyped(JSON.stringify(rowOf(run))), 'only the raw declaration changes').not.toBe(JSON.stringify(rowOf(run)));
    expect(await ok(await resealed(stored, retyped)), 'the installed formula broken by the write').toBe(false);
  });
  it('AC34 b11-formula-manifest-before-row-twin (guard): a resealed reinstall changing only the expression is accepted', async () => {
    const { stored, ok, edit, looksValid } = await reinstalled();
    const quarter = edit((row) => { row.views = [{ ...HALF, outputs: [{ ...PRICE, expr: { op: '/', left: { property: 'rent' }, right: { number: 4 } } }, DAYS] }]; });
    expect(looksValid(quarter)).toBe(true);
    expect(await ok(await resealed(stored, quarter)), 'the same outputs, another expression').toBe(true);
  });
});

type Op = { operationId: string; ordinal: number; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
/** The stored manifest with its table write changed, every id sealed again in order as withMaintenance does. */
async function resealed(stored: Manifest, change: (text: string) => string, forge: (effect: Record<string, unknown>) => void = () => {}): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const write = m.operations.find((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.typeTable);
  if (!write) throw new Error('The manifest has no table write');
  const parsed = JSON.parse(String(write.effect.text)) as unknown;
  write.effect.text = `${JSON.stringify(JSON.parse(change(JSON.stringify(parsed))) as unknown, null, 2)}\n`;
  write.effect.content = raw(String(write.effect.text));
  forge(write.effect);
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
