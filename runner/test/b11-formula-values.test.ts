/** B11d through production main: maintain writes each installed formula's values on Bower's notes (TL-P4-48 Q2, Q3, Q5-Q8). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frontValues, parseNote, propertyValue, readTypeTable, typeRowOk } from '../../src/data/contracts/note-format';
import { viewFault } from '../../src/data/contracts/view-format';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const NEXT_DAY = DAY + 24 * 3600 * 1000;
const HUNT = 'Projects/Flat hunt';
const PRICE = { property: 'price_per_area', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { property: 'area' } } };
const DAYS = { property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } };
const FLATS = { v: 1, id: 'flat-metrics', kind: 'formula', type: 'flat', outputs: [PRICE, DAYS] };
const FLAT_PROPERTIES = { rent: { type: 'money' }, area: { type: 'number' }, deadline: { type: 'date' }, location: { type: 'text' } };
const row = (views: unknown[] = [FLATS], extra: Record<string, { type: string }> = {}) => ({ id: 'flat', match: ['flat listing'], template: 'source',
  properties: { ...FLAT_PROPERTIES, price_per_area: { type: 'money' }, days_left: { type: 'number' }, ...extra },
  table: ['rent', 'area', 'deadline', 'location'], views });
const money = (amount: number) => JSON.stringify({ amount, currency: 'EUR' });
const flat = (name: string, lines: string[], by = 'by: bower\n') => `---\nsummary: ${name} is in Saltmere.\ntype: flat\n${by}created: 2026-10-01\n`
  + `${lines.join('\n')}\n---\n\n${name} is in Saltmere.\nRelated: [[Flat hunt]].\n`;
const FLATS_FILES: Record<string, string> = {
  [`${HUNT}/Amber flat.md`]: flat('Amber flat', [`rent: ${money(1000)}`, 'area: 50', 'deadline: 2026-10-14', `price_per_area: ${money(123)}`]),
  [`${HUNT}/Birch flat.md`]: flat('Birch flat', [`rent: ${money(900)}`, 'area: 0', 'deadline: 2026-10-14']),
  [`${HUNT}/Cedar flat.md`]: flat('Cedar flat', [`rent: ${money(800)}`, 'deadline: 2026-10-14']),
  [`${HUNT}/Alex flat.md`]: flat('Alex flat', [`rent: ${money(500)}`, 'area: 25', 'deadline: 2026-10-14'], ''),
};
const AMBER = `${HUNT}/Amber flat.md`;
const BIRCH = `${HUNT}/Birch flat.md`;
const CEDAR = `${HUNT}/Cedar flat.md`;
const ALEX = `${HUNT}/Alex flat.md`;
const MOC = `---\nby: bower\ntype: moc\nsummary: Flat hunt reference notes.\n---\n# Flat hunt\n`;

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

async function folder(views: unknown[] = [FLATS], files: Record<string, string> = FLATS_FILES, extra: Record<string, { type: string }> = {}) {
  const c: LoadedCase = { id: 'b11-formula-values', capability: 'C05', title: 'Alex compares flats', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: JSON.stringify({ v: 1, rows: [row(views, extra)] }, null, 2), 'Rules.md': '# Rules\n',
      [`${HUNT}/Flat hunt.md`]: MOC, ...files } };
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

async function press(f: Folder, o: { at?: number; intent?: (frame: Record<string, unknown>, attempt: number) => unknown; inbox?: { name: string; text: string };
  around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  const at = o.at ?? DAY;
  vi.setSystemTime(at);
  if (o.inbox) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'File this flat with my flat hunt.\n');
    await f.drive.createText(pile.id, o.inbox.name, o.inbox.text);
  } else {
    await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
      device: 'device-1', at: at + f.press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const scope = o.inbox ? 'all' : 'instructions';
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => at + f.press, newId: () => `b11-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const hunt = await f.id(HUNT);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: o.inbox ? 'flat' : 'unknown',
      destination: hunt, wants: [] })), asks: [] });
    return reply(await o.intent?.(frame, attempt++) ?? { kind: 'tidy-intent', v: 1, things: [] });
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: `b11-run-${f.press}` }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls };
}
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
/** A computed property as the note's front matter holds it, decoded: absent is undefined. */
function computed(text: string | undefined, key: string): unknown {
  const value = parseNote('note.md', text ?? '').properties.find((p) => p.key === key)?.value;
  return value === undefined ? undefined : JSON.parse(value) as unknown;
}
/** Every line but the computed ones, which are front-matter lines only: body text that looks like them is kept. */
const others = (text: string | undefined) => {
  const lines = (text ?? '').split('\n');
  const end = lines.indexOf('---', 1);
  return lines.filter((line, i) => i === 0 || i >= end || !/^(?:price_per_area|days_left|rent_year):/.test(line));
};
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const retrieval = (run: CaseRun) => JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, Record<string, unknown>> };
/** The person rewrites the flat row's formulas (the table is theirs to edit). */
async function setViews(f: Folder, views: unknown[], extra: Record<string, { type: string }> = {}) {
  const tableId = await f.id(SYSTEM.typeTable);
  await f.drive.writeText(tableId, JSON.stringify({ v: 1, rows: [row(views, extra)] }, null, 2), (await f.drive.get(tableId)).modifiedTime);
}
const loggedBowerError = () => vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'));
/** Flats with no stale computed line, so an output nobody computes stays absent. */
const FRESH_FILES = { ...FLATS_FILES, [AMBER]: flat('Amber flat', [`rent: ${money(1000)}`, 'area: 50', 'deadline: 2026-10-14']) };
const TWENTY = { amount: 20, currency: 'EUR' };
const YEAR = { v: 1, id: 'flat-year', kind: 'formula', type: 'flat', outputs: [{ property: 'rent_year', type: 'money',
  expr: { op: '*', left: { property: 'rent' }, right: { number: 12 } } }] };
/** A formula still declared but refused by the grammar (R47). */
const BROKEN = { ...FLATS, outputs: [PRICE, { ...DAYS, expr: { op: 'eval' } }] };
/** A run with no request, no pile and no model (the figures' idle harness, b11-figures.test.ts). */
async function idle(f: Folder, at = DAY): Promise<CaseRun> {
  f.press++;
  vi.setSystemTime(at);
  const runId = `b11-idle-${f.press}`;
  const run = await runOnDrive(f.c, f.drive, f.root, { admission: { v: 1, id: runId, rootId: f.root, scope: 'all', at: at + f.press, piles: [], journal: [] },
    pacing: { baseMs: 0, sleep: async () => {} }, answerStart: { scope: 'all', requestId: runId } }, f.press);
  expect(run.code, 'the idle run ends well').toBe(0);
  expect(phase(run), 'the idle run ends well').toBe('done');
  expect(run.requests, 'no captured request').toEqual([]);
  return run;
}

describe('B11d formula values through production main', () => {
  it('AC23 b11-values: Bower\'s flats get their computed values; a zero or missing area gets none; the person\'s flat gets nothing', async () => {
    const f = await folder();
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(run.calls, 'no model call computes a value').toEqual(['selection', 'execution']);
    expect(computed(run.after[AMBER], 'price_per_area'), 'the stale value is replaced').toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
    for (const path of [BIRCH, CEDAR]) {
      expect(computed(run.after[path], 'price_per_area'), `${path}: no value, never a made-up one`).toBeUndefined();
      expect(computed(run.after[path], 'days_left')).toBe(7);
    }
    expect(run.after[ALEX], 'the person\'s flat is never written').toBe(FLATS_FILES[ALEX]);
    for (const path of [AMBER, BIRCH, CEDAR]) expect(others(run.after[path]), `${path}: only computed lines change`).toEqual(others(FLATS_FILES[path]));
  });

  it('AC24 b11-values-same-day: the next run the same day writes no flat', async () => {
    const f = await folder();
    const first = await press(f);
    expect(computed(first.after[AMBER], 'days_left')).toBe(7);
    const ids = await Promise.all([AMBER, BIRCH, CEDAR, ALEX].map((path) => f.id(path)));
    const writes = vi.spyOn(f.drive, 'writeText');
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(writes.mock.calls.filter(([fileId]) => ids.includes(String(fileId)))).toEqual([]);
  });

  it('AC24 b11-values-next-day: the first run of a new day refreshes days left once per Bower flat, with no extra discovery read', async () => {
    const discovery = async (views: unknown[]) => {
      const f = await folder(views);
      await press(f);
      const lists = [vi.spyOn(f.drive, 'listAll'), vi.spyOn(f.drive, 'listChanges'), vi.spyOn(f.drive, 'getStartPageToken')];
      const writes = vi.spyOn(f.drive, 'writeText');
      const next = await press(f, { at: NEXT_DAY });
      return { f, next, writes, discovery: lists.map((spy) => spy.mock.calls.length) };
    };
    const control = await discovery([]);
    const { f, next, writes, discovery: calls } = await discovery([FLATS]);
    expect(phase(next)).toBe('done');
    for (const path of [AMBER, BIRCH, CEDAR]) {
      expect(computed(next.after[path], 'days_left'), path).toBe(6);
    }
    for (const path of [AMBER, BIRCH, CEDAR]) {
      const fileId = await f.id(path);
      expect(writes.mock.calls.filter(([written]) => written === fileId), `${path}: one edit`).toHaveLength(1);
    }
    expect(computed(next.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
    expect(next.after[ALEX]).toBe(FLATS_FILES[ALEX]);
    expect(calls, 'the same discovery reads as a folder with no formula').toEqual(control.discovery);
  });

  it('AC25 b11-values-as-of-on-retry: a run resumed the next day keeps its admission date', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    let crashed = false;
    const first = await press(f, { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${amber}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up crash after the first computed write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'maintain reached the computed write').toBe(true);
    vi.setSystemTime(NEXT_DAY);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    for (const path of [AMBER, BIRCH, CEDAR]) expect(computed(resumed.after[path], 'days_left'), `${path}: the run's own date`).toBe(7);
  });

  it('AC25 b11-values-crash-before-write: a crash before a computed write is sent completes on redispatch with that write sent once', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    const state = { reached: false };
    const first = await press(f, { around: (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${amber}`) {
        state.reached = true;
        throw new TypeError('Made-up crash before the computed write.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'maintain came to the computed write').toBe(true);
    let sent = 0;
    const resumed = await redispatchCase(f.c, first, 2, { claude: async () => { throw new Error('A redispatch must not call a model.'); }, pacing: { baseMs: 0, sleep: async () => {} },
      around: (next) => async (input, init) => {
        if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${amber}`) sent++;
        return next(input, init);
      } });
    expect(phase(resumed)).toBe('done');
    expect(sent, 'one computed write').toBe(1);
    expect(computed(resumed.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
  });

  it('AC25 b11-values-edited-before-redispatch: a flat the person edits after its landed write keeps the edit; recovery ends and the next run recomputes', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    let crashed = false;
    const first = await press(f, { around: (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && url(input).pathname === `/upload/drive/v3/files/${amber}`) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up crash after the first computed write.');
      }
      return next(input, init);
    } });
    expect(crashed).toBe(true);
    await f.drive.writeText(amber, (await f.drive.readText(amber)).replace(`rent: ${money(1000)}`, `rent: ${money(1500)}`), (await f.drive.get(amber)).modifiedTime);
    const resumed = await redispatchCase(f.c, first, 2, { claude: async () => { throw new Error('A redispatch must not call a model.'); }, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed), 'recovery never freezes on a changed note').toBe('done');
    expect(resumed.after[AMBER], 'the person\'s edit stands').toContain(`rent: ${money(1500)}`);
    expect(retrieval(resumed).views?.[`${amber}/flat-metrics`], 'no record computed now is put on the landed values').toBeUndefined();
    const next = await press(f);
    expect(computed(next.after[AMBER], 'price_per_area')).toEqual({ amount: 30, currency: 'EUR' });
    expect(next.after[AMBER]).toContain(`rent: ${money(1500)}`);
  });

  it('AC24 b11-values-equal-as-values: a stored value equal as a value (keys in another order, 7.0 for 7) is not rewritten; a different one is', async () => {
    const lines = [`rent: ${money(1000)}`, 'area: 50', 'deadline: 2026-10-14'];
    const files = { ...FLATS_FILES,
      [`${HUNT}/Fern flat.md`]: flat('Fern flat', [...lines, 'price_per_area: {"currency": "EUR", "amount": 20}', 'days_left: 7.0']),
      [`${HUNT}/Gorse flat.md`]: flat('Gorse flat', [...lines, 'price_per_area: {"currency": "EUR", "amount": 20.5}', 'days_left: 7']) };
    const f = await folder([FLATS], files);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(run.after[`${HUNT}/Fern flat.md`], 'equal values: nothing written').toBe(files[`${HUNT}/Fern flat.md`]);
    expect(computed(run.after[`${HUNT}/Gorse flat.md`], 'price_per_area'), 'a different amount is rewritten').toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(run.after[AMBER], 'price_per_area'), 'the control flat is computed').toEqual({ amount: 20, currency: 'EUR' });
  });

  it('AC24 b11-values-member-edit: a flat edited the same day is computed again from its new values and version', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    await press(f);
    await f.drive.writeText(amber, (await f.drive.readText(amber)).replace(`rent: ${money(1000)}`, `rent: ${money(1250)}`), (await f.drive.get(amber)).modifiedTime);
    const version = (await f.drive.get(amber)).modifiedTime;
    const second = await press(f);
    expect(computed(second.after[AMBER], 'price_per_area')).toEqual({ amount: 25, currency: 'EUR' });
    expect(retrieval(second).views?.[`${amber}/flat-metrics`]?.inputs, 'the version the values were computed from').toEqual([[amber, version]]);
  });

  it('AC23 b11-values-membership: every Bower note of the type gets values, in any folder and past the prefix; no other type and no person\'s note', async () => {
    const pad = `x_note: ${'p'.repeat(5000)}`;
    const elsewhere = `Areas/Elsewhere`;
    const files = { ...FLATS_FILES,
      [`${elsewhere}/Fern flat.md`]: flat('Fern flat', [`rent: ${money(700)}`, 'area: 35', 'deadline: 2026-10-14']),
      [`${HUNT}/Gorse flat.md`]: flat('Gorse flat', [pad, `rent: ${money(400)}`, 'area: 20', 'deadline: 2026-10-14']),
      [`${HUNT}/Heath offer.md`]: flat('Heath offer', [`rent: ${money(900)}`, 'area: 30', 'deadline: 2026-10-14']).replace('type: flat', 'type: offer') };
    const f = await folder([FLATS], files);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(computed(run.after[`${elsewhere}/Fern flat.md`], 'price_per_area'), 'another folder').toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(run.after[`${HUNT}/Gorse flat.md`], 'price_per_area'), 'front matter past the prefix is read whole to be written').toEqual({ amount: 20, currency: 'EUR' });
    expect(run.after[`${HUNT}/Heath offer.md`], 'another type is never written').toBe(files[`${HUNT}/Heath offer.md`]);
    expect(run.after[ALEX]).toBe(FLATS_FILES[ALEX]);
    // Taken out of the row, the formula takes the long note's lines too: its whole read made it a member (R35, R37).
    const gorse = await f.id(`${HUNT}/Gorse flat.md`);
    await setViews(f, []);
    const removed = await press(f);
    expect(phase(removed)).toBe('done');
    expect(computed(removed.after[`${HUNT}/Gorse flat.md`], 'price_per_area'), 'no stale value past the prefix').toBeUndefined();
    expect(computed(removed.after[`${HUNT}/Gorse flat.md`], 'days_left')).toBeUndefined();
    expect(others(removed.after[`${HUNT}/Gorse flat.md`]), 'only computed lines change').toEqual(others(files[`${HUNT}/Gorse flat.md`]));
    expect(retrieval(removed).views?.[`${gorse}/flat-metrics`], 'no stale record').toBeUndefined();
  });

  it('AC26 b11-values-filed-flat: a Bower flat filed in the run gets its values in that run\'s maintain', async () => {
    const f = await folder();
    await press(f);
    const flatNote = (properties: Record<string, unknown>) => (frame: Record<string, unknown>) => {
      const things = (frame.piles as Array<{ things: Array<{ fileId: string }> }>).flatMap((p) => p.things);
      return { kind: 'tidy-intent', v: 1, things: things.map((t) => ({ fileId: t.fileId, to: HUNT, name: 'Dune flat.txt',
        note: { name: 'Dune flat.md', summary: 'Dune flat is in Saltmere.', body: 'Dune flat is in Saltmere. Rent 600 EUR, area 30, reply by 2026-10-21.',
          typeRow: 'flat', properties } })) };
    };
    const run = await press(f, { inbox: { name: 'Dune flat.txt', text: 'Dune flat is in Saltmere. Rent 600 EUR, area 30, reply by 2026-10-21.' },
      intent: flatNote({ rent: { amount: 600, currency: 'EUR' }, area: 30, deadline: '2026-10-21' }) });
    expect(phase(run)).toBe('done');
    const dune = run.after[`${HUNT}/Dune flat.md`];
    expect(dune, 'the flat was filed').toBeDefined();
    expect(computed(dune, 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
    expect(computed(dune, 'days_left')).toBe(14);
  });

  it('AC26 b11-values-never-authored: a reply that writes a computed property itself is refused once; the corrected reply files', async () => {
    const f = await folder();
    const intent = (frame: Record<string, unknown>, attempt: number) => {
      const things = (frame.piles as Array<{ things: Array<{ fileId: string }> }>).flatMap((p) => p.things);
      const properties = { rent: { amount: 600, currency: 'EUR' }, area: 30, deadline: '2026-10-21', ...(attempt === 0 ? { days_left: 30 } : {}) };
      return { kind: 'tidy-intent', v: 1, things: things.map((t) => ({ fileId: t.fileId, to: HUNT, name: 'Dune flat.txt',
        note: { name: 'Dune flat.md', summary: 'Dune flat is in Saltmere.', body: 'Dune flat is in Saltmere. Rent 600 EUR, area 30, reply by 2026-10-21.',
          typeRow: 'flat', properties } })) };
    };
    const run = await press(f, { inbox: { name: 'Dune flat.txt', text: 'Dune flat is in Saltmere. Rent 600 EUR, area 30, reply by 2026-10-21.' }, intent });
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution', 'execution']);
    expect(computed(run.after[`${HUNT}/Dune flat.md`], 'days_left'), 'the script\'s value, never the model\'s').toBe(14);
    // Refused by the one authored-property rule (propertyValuesOk) under its existing kind: no new refusal kind (R45).
    const kinds = vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String)).flatMap((line) => [.../was refused \((\w+)\): /.exec(line) ?? []].slice(1, 2));
    expect(kinds).toEqual(['noteKeys']);
  });

  it('AC27 b11-values-provenance: retrieval keeps each note\'s result with its declaration hash, evaluator, input version and as-of date', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    const version = (await f.drive.get(amber)).modifiedTime;
    const run = await press(f);
    expect(retrieval(run).views?.[`${amber}/flat-metrics`]).toEqual({ hash: (await canonical(FLATS)).hash, evaluator: 1, asOf: '2026-10-07',
      inputs: [[amber, version]], result: { price_per_area: { value: { amount: 20, currency: 'EUR' } }, days_left: { value: 7 } } });
    const birch = await f.id(BIRCH);
    expect(retrieval(run).views?.[`${birch}/flat-metrics`]?.result).toEqual({ price_per_area: { unavailable: 'division-by-zero' }, days_left: { value: 7 } });
  });

  it('AC28 b11-values-person-edit: a flat the person edits during the run keeps their edit and is computed next run; the others are written', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    let edited = false;
    // The person saves while Bower works (during the model call), after Bower read the flat and before maintain writes it.
    // An edit inside Drive's read-then-write window cannot be seen by anyone (src/data/drive/drive-http.ts writeText).
    const first = await press(f, { intent: async () => {
      if (!edited) {
        edited = true;
        const now = await f.drive.get(amber);
        await f.drive.writeText(amber, (await f.drive.readText(amber)).replace('Amber flat is in Saltmere.\nRelated', 'Amber flat is in Saltmere. Alex likes it.\nRelated'), now.modifiedTime);
      }
      return { kind: 'tidy-intent', v: 1, things: [] };
    } });
    expect(edited, 'the person edited while Bower worked').toBe(true);
    expect(phase(first), 'one refused computed edit fails no run').toBe('done');
    expect(first.after[AMBER]).toContain('Alex likes it.');
    expect(computed(first.after[BIRCH], 'days_left')).toBe(7);
    const second = await press(f);
    expect(second.after[AMBER]).toContain('Alex likes it.');
    expect(computed(second.after[AMBER], 'days_left')).toBe(7);
    expect(computed(second.after[AMBER], 'price_per_area')).toEqual({ amount: 20, currency: 'EUR' });
  });

  it('AC29 b11-values-stored-faults: a stored formula the grammar refuses is skipped and logged; the others are computed', async () => {
    const weeks = { v: 1, id: 'flat-weeks', kind: 'formula', type: 'flat', outputs: [{ property: 'weeks_left', type: 'number',
      expr: { op: '/', left: { property: 'days_left' }, right: { number: 7 } } }] };
    // A stored row is read leniently: a refused formula in it, or a key a later version added, never drops the row.
    const later = { ...FLATS, note: 'kept by a later version' };
    expect(typeRowOk(row([later, weeks]), true), 'the stored row stays readable').toBe(true);
    expect(readTypeTable(JSON.stringify({ v: 1, rows: [row([later, weeks])] })).table.rows.map((r) => r.id)).toEqual(['flat']);
    expect(typeRowOk(row([later, null, weeks]), true), 'a null entry is skipped, not the row').toBe(true);
    const f = await folder([later, null, weeks]);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
    expect(computed(run.after[AMBER], 'weeks_left'), 'a computed value never feeds another').toBeUndefined();
    expect(vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'))).toBe(true);
  });

  it('AC29 b11-values-removed: a formula taken out of the row takes its values and records with it on the next run', async () => {
    const f = await folder();
    const first = await press(f);
    const amber = await f.id(AMBER);
    expect(computed(first.after[AMBER], 'days_left'), 'computed first').toBe(7);
    const tableId = await f.id(SYSTEM.typeTable);
    await f.drive.writeText(tableId, JSON.stringify({ v: 1, rows: [row([])] }, null, 2), (await f.drive.get(tableId)).modifiedTime);
    const second = await press(f);
    expect(phase(second)).toBe('done');
    for (const path of [AMBER, BIRCH, CEDAR]) {
      expect(computed(second.after[path], 'price_per_area'), `${path}: no stale value`).toBeUndefined();
      expect(computed(second.after[path], 'days_left'), `${path}: no stale value`).toBeUndefined();
      expect(others(second.after[path]), `${path}: only computed lines change`).toEqual(others(FLATS_FILES[path]));
    }
    expect(second.after[ALEX], 'the person\'s flat is never written').toBe(FLATS_FILES[ALEX]);
    expect(retrieval(second).views?.[`${amber}/flat-metrics`], 'no stale record').toBeUndefined();
  });

  it('AC29 b11-values-bound: one formula computes 200 notes; over 200 it computes none that run', async () => {
    const api = await import(/* @vite-ignore */ new URL('../src/views.ts', import.meta.url).pathname).catch((error: unknown) => {
      expect(String(error)).toMatch(/views/);
      return {};
    }) as Record<string, unknown>;
    expect(api.evaluateFormulas, 'runner/src/views.ts exports evaluateFormulas').toBeTypeOf('function');
    const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `flat-${i + 1}`, properties: { rent: money(1000), area: '50', deadline: '2026-10-14' } }));
    const run = api.evaluateFormulas as (view: unknown, r: unknown, notes: unknown, asOf: string) => Record<string, unknown> | 'over';
    const at = run(FLATS, row(), notes(200), '2026-10-07');
    expect(at === 'over' ? 0 : Object.keys(at).length).toBe(200);
    expect(at === 'over' ? undefined : at['flat-200']).toEqual({ price_per_area: { value: { amount: 20, currency: 'EUR' } }, days_left: { value: 7 } });
    expect(run(FLATS, row(), notes(201), '2026-10-07')).toBe('over');
    expect(run(FLATS, row(), [], '2026-10-07'), 'no notes: nothing to write, never over').toEqual({});
  });

  it('AC33 b11-row-grammar: a row may carry formulas whose outputs it declares with their types; anything else is no valid row', () => {
    const installed = row();
    expect(typeRowOk(installed), 'write').toBe(true);
    expect(typeRowOk(installed, true), 'stored read').toBe(true);
    expect(typeRowOk({ ...installed, properties: FLAT_PROPERTIES }), 'outputs not declared').toBe(false);
    expect(typeRowOk({ ...installed, properties: { ...installed.properties, days_left: { type: 'date' } } }), 'an output declared with another type').toBe(false);
    expect(typeRowOk(row([{ ...FLATS, outputs: [{ ...DAYS, expr: { op: 'eval' } }] }])), 'a formula the grammar refuses').toBe(false);
    const many = (n: number) => ({ ...installed, properties: { ...FLAT_PROPERTIES, ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { type: 'number' }])) },
      table: ['rent'], views: Array.from({ length: n }, (_, i) => ({ v: 1, id: `f-${i}`, kind: 'formula', type: 'flat', outputs: [{ property: `k${i}`, type: 'number', expr: { property: 'area' } }] })) });
    expect(typeRowOk(many(10)), 'ten views').toBe(true);
    expect(typeRowOk(many(11)), 'eleven views').toBe(false);
    expect(typeRowOk(row([{ v: 1, id: 'agg', kind: 'aggregate', title: 'T', set: { type: 'flat', folderId: 'x', recursive: true }, groupBy: [],
      measures: [{ id: 'n', label: 'N', op: 'count' }] }])), 'an aggregate belongs in a map').toBe(false);
  });

  it('AC23 b11-values-date: a date output is saved as a plain date the Table reads back, and the next run leaves it as it is', async () => {
    const REPLY = { v: 1, id: 'flat-reply', kind: 'formula', type: 'flat', outputs: [{ property: 'reply_by', type: 'date',
      expr: { op: 'if', when: { op: 'exists', property: 'area' }, then: { property: 'deadline' }, else: { property: 'deadline' } } }] };
    const extra = { reply_by: { type: 'date' } };
    const installed = readTypeTable(JSON.stringify({ v: 1, rows: [row([REPLY], extra)] })).table.rows[0];
    if (!installed) throw new Error('The made-up row must stay readable.');
    expect(viewFault(REPLY, readTypeTable(JSON.stringify({ v: 1, rows: [row([REPLY], extra)] })).table, 'read'), 'a valid date formula').toBeNull();
    const f = await folder([REPLY], FRESH_FILES, extra);
    const first = await press(f);
    expect(phase(first)).toBe('done');
    const raw = parseNote('note.md', first.after[AMBER] ?? '').properties.find((p) => p.key === 'reply_by')?.value;
    expect(raw, 'a plain date, never a quoted one').toBe('2026-10-14');
    expect(propertyValue(installed, 'reply_by', raw), 'the one decode reads it back').toEqual({ value: '2026-10-14' });
    const ids = await Promise.all([AMBER, BIRCH, CEDAR].map((path) => f.id(path)));
    const writes = vi.spyOn(f.drive, 'writeText');
    const second = await press(f, { at: NEXT_DAY });
    expect(phase(second)).toBe('done');
    expect(writes.mock.calls.filter(([fileId]) => ids.includes(String(fileId))), 'an unchanged date is never rewritten').toEqual([]);
    expect(second.after[AMBER]).toBe(first.after[AMBER]);
  });

  it('AC29 b11-values-invalid-kept: a stored formula made invalid keeps its last lines and records; restored, it computes again', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    const first = await press(f);
    expect(computed(first.after[AMBER], 'price_per_area'), 'computed first').toEqual(TWENTY);
    const record = retrieval(first).views?.[`${amber}/flat-metrics`];
    expect(record, 'recorded first').toBeDefined();
    await setViews(f, [BROKEN]);
    await f.drive.writeText(amber, (await f.drive.readText(amber)).replace(`rent: ${money(1000)}`, `rent: ${money(1500)}`), (await f.drive.get(amber)).modifiedTime);
    const edited = await f.drive.readText(amber);
    const second = await press(f, { at: NEXT_DAY });
    expect(phase(second)).toBe('done');
    expect(second.after[AMBER], 'nothing recomputed, nothing removed').toBe(edited);
    for (const path of [BIRCH, CEDAR]) expect(second.after[path], `${path}: as last written`).toBe(first.after[path]);
    expect(retrieval(second).views?.[`${amber}/flat-metrics`], 'the record stays').toEqual(record);
    expect(loggedBowerError(), 'the skipped formula is logged').toBe(true);
    await setViews(f, [FLATS]);
    const version = (await f.drive.get(amber)).modifiedTime;
    const third = await press(f, { at: NEXT_DAY });
    expect(computed(third.after[AMBER], 'price_per_area'), 'restored: computed from the new rent').toEqual({ amount: 30, currency: 'EUR' });
    expect(computed(third.after[AMBER], 'days_left')).toBe(6);
    expect(retrieval(third).views?.[`${amber}/flat-metrics`]?.inputs).toEqual([[amber, version]]);
  });

  it.each([['in list order', false], ['in the other order', true]])('AC29 b11-values-duplicate-id: two formulas with one id: the first wins; the later is skipped and logged (%s)', async (_order, reversed) => {
    const days = { ...FLATS, outputs: [DAYS] };
    const price = { ...FLATS, outputs: [PRICE] };
    const views = reversed ? [price, days] : [days, price];
    const table = readTypeTable(JSON.stringify({ v: 1, rows: [row(views)] })).table;
    expect(viewFault(views[0], table, 'read'), 'the grammar reads the first as installed').toBeNull();
    expect(viewFault(views[1], table, 'read'), 'and the later as not').not.toBeNull();
    const f = await folder(views, FRESH_FILES);
    const amber = await f.id(AMBER);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(computed(run.after[AMBER], 'days_left')).toBe(reversed ? undefined : 7);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual(reversed ? TWENTY : undefined);
    expect(retrieval(run).views?.[`${amber}/flat-metrics`]?.hash).toBe((await canonical(views[0])).hash);
    expect(loggedBowerError()).toBe(true);
  });

  it.each([['in list order', false], ['in the other order', true]])('AC29 b11-values-shared-output: two formulas claiming one property: the first owns it; the later is skipped whole and logged (%s)', async (_order, reversed) => {
    const soon = { v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [DAYS] };
    const both = { v: 1, id: 'flat-both', kind: 'formula', type: 'flat', outputs: [PRICE, { ...DAYS, expr: { op: '-', left: DAYS.expr, right: { number: 1 } } }] };
    const views = reversed ? [both, soon] : [soon, both];
    const table = readTypeTable(JSON.stringify({ v: 1, rows: [row(views)] })).table;
    expect(viewFault(views[0], table, 'read'), 'the grammar reads the first as the owner').toBeNull();
    expect(viewFault(views[1], table, 'read')).not.toBeNull();
    const f = await folder(views, FRESH_FILES);
    const amber = await f.id(AMBER);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(computed(run.after[AMBER], 'days_left'), 'the owner\'s value').toBe(reversed ? 6 : 7);
    expect(computed(run.after[AMBER], 'price_per_area'), 'a skipped formula computes nothing').toEqual(reversed ? TWENTY : undefined);
    expect(retrieval(run).views?.[`${amber}/flat-both`] !== undefined, 'flat-both recorded').toBe(reversed);
    expect(retrieval(run).views?.[`${amber}/flat-days`] !== undefined, 'flat-days recorded').toBe(!reversed);
    expect(loggedBowerError()).toBe(true);
  });

  it('AC29 b11-values-removed-broken-records: with broken or missing records, taking the formula out ends in a normal run that touches nothing else', async () => {
    const f = await folder();
    const first = await press(f);
    const [amber, birch, cedar] = await Promise.all([AMBER, BIRCH, CEDAR].map((path) => f.id(path)));
    expect(retrieval(first).views?.[`${cedar}/flat-metrics`], 'recorded first').toBeDefined();
    const retrievalId = await f.id(SYSTEM.retrieval);
    const stored = JSON.parse(first.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, unknown>; files: Record<string, Record<string, unknown>> };
    // Amber's record is broken, Birch's is missing, Cedar's is intact; property evidence is broken everywhere.
    stored.views = { [`${amber}/flat-metrics`]: 'broken', [`${cedar}/flat-metrics`]: stored.views?.[`${cedar}/flat-metrics`], other: { hash: 1 } };
    for (const file of Object.values(stored.files)) if (file.properties !== undefined) file.properties = { rent: 7 };
    await f.drive.writeText(retrievalId, JSON.stringify(stored), (await f.drive.get(retrievalId)).modifiedTime);
    await setViews(f, []);
    const second = await press(f);
    expect(phase(second), 'a normal run, never a frozen one').toBe('done');
    for (const path of [AMBER, BIRCH]) expect(second.after[path], `${path}: no readable record, so its lines are left as written`).toBe(first.after[path]);
    expect(computed(second.after[CEDAR], 'days_left'), 'an intact record still cleans up').toBeUndefined();
    for (const path of [AMBER, BIRCH, CEDAR]) expect(others(second.after[path]), `${path}: unrelated lines untouched`).toEqual(others(first.after[path]));
    expect(second.after[ALEX]).toBe(FLATS_FILES[ALEX]);
    expect(Object.keys(retrieval(second).views ?? {}).filter((key) => [amber, birch, cedar].some((id) => key.startsWith(`${id ?? ''}/`)) || key === 'other'), 'no stale record').toEqual([]);
  });

  it('AC29 b11-values-two-formulas: two formulas on one note make one edit per run; removing one keeps the other\'s value', async () => {
    const extra = { rent_year: { type: 'money' } };
    const f = await folder([FLATS, YEAR], FLATS_FILES, extra);
    const amber = await f.id(AMBER);
    const edits = vi.spyOn(f.drive, 'writeText');
    const first = await press(f);
    expect(phase(first)).toBe('done');
    expect(edits.mock.calls.filter(([fileId]) => fileId === amber), 'one computed edit').toHaveLength(1);
    expect(computed(first.after[AMBER], 'price_per_area')).toEqual(TWENTY);
    expect(computed(first.after[AMBER], 'rent_year')).toEqual({ amount: 12000, currency: 'EUR' });
    expect(retrieval(first).views?.[`${amber}/flat-metrics`], 'both records').toBeDefined();
    expect(retrieval(first).views?.[`${amber}/flat-year`]).toBeDefined();
    await setViews(f, [YEAR], extra);
    edits.mockClear();
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(edits.mock.calls.filter(([fileId]) => fileId === amber), 'one cleanup edit').toHaveLength(1);
    expect(computed(second.after[AMBER], 'price_per_area')).toBeUndefined();
    expect(computed(second.after[AMBER], 'days_left')).toBeUndefined();
    expect(computed(second.after[AMBER], 'rent_year'), 'the survivor\'s value stays').toEqual({ amount: 12000, currency: 'EUR' });
    expect(retrieval(second).views?.[`${amber}/flat-metrics`]).toBeUndefined();
    expect(retrieval(second).views?.[`${amber}/flat-year`]?.result).toEqual({ rent_year: { value: { amount: 12000, currency: 'EUR' } } });
  });

  it('AC24 b11-values-idle-next-day: a next-day run with no request and no change still refreshes days left', async () => {
    const f = await folder();
    const first = await press(f);
    expect(computed(first.after[AMBER], 'days_left'), 'computed first').toBe(7);
    // Drains the feed of the press's own writes, so the next run sees no change at all.
    const drained = await idle(f);
    expect(drained.after[AMBER], 'nothing to refresh the same day').toBe(first.after[AMBER]);
    const next = await idle(f, NEXT_DAY);
    for (const path of [AMBER, BIRCH, CEDAR]) expect(computed(next.after[path], 'days_left'), `${path}: refreshed by an idle run`).toBe(6);
    expect(computed(next.after[AMBER], 'price_per_area')).toEqual(TWENTY);
    expect(next.after[ALEX]).toBe(FLATS_FILES[ALEX]);
  });

  it('AC29 b11-values-idle-table-only: a formula the person adds to the table is computed by a run with nothing else to do', async () => {
    const f = await folder([], FRESH_FILES);
    await press(f);
    const drained = await idle(f);
    expect(computed(drained.after[AMBER], 'days_left'), 'no formula yet').toBeUndefined();
    await setViews(f, [FLATS]);
    const run = await idle(f);
    expect(computed(run.after[AMBER], 'price_per_area')).toEqual(TWENTY);
    expect(computed(run.after[AMBER], 'days_left')).toBe(7);
  });

  it.each<[string, unknown[], boolean]>([
    ['an invalid formula listed first holds its outputs', [BROKEN, { v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [DAYS] }], false],
    ['an invalid formula listed later holds nothing before it', [{ v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [DAYS] }, BROKEN], true],
    ['an entry with no readable id holds nothing', [{ v: 1, kind: 'formula', type: 'flat', outputs: [DAYS] }, { v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [DAYS] }], true],
  ])('AC29 b11-values-invalid-holds: %s', async (_name, views, computes) => {
    const soon = views.find((v) => (v as { id?: string }).id === 'flat-days');
    const table = readTypeTable(JSON.stringify({ v: 1, rows: [row(views)] })).table;
    expect(viewFault(soon, table, 'read') === null, 'the grammar agrees on who holds days left').toBe(computes);
    const f = await folder(views, FRESH_FILES);
    const amber = await f.id(AMBER);
    const run = await press(f);
    expect(phase(run)).toBe('done');
    expect(computed(run.after[AMBER], 'days_left')).toBe(computes ? 7 : undefined);
    expect(computed(run.after[AMBER], 'price_per_area'), 'the invalid formula computes nothing').toBeUndefined();
    expect(retrieval(run).views?.[`${amber}/flat-days`] !== undefined, 'flat-days recorded').toBe(computes);
    expect(loggedBowerError(), 'what is skipped is logged').toBe(true);
  });

  it('AC29 b11-values-replaced-output: a run that removes one formula and adds another claiming its output keeps the new value and record', async () => {
    const f = await folder();
    const amber = await f.id(AMBER);
    const first = await press(f);
    expect(computed(first.after[AMBER], 'days_left'), 'computed first').toBe(7);
    const later = { v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [{ ...DAYS, expr: { op: '-', left: DAYS.expr, right: { number: 1 } } }] };
    await setViews(f, [later]);
    const edits = vi.spyOn(f.drive, 'writeText');
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(computed(second.after[AMBER], 'days_left'), 'the write wins over the removal').toBe(6);
    expect(computed(second.after[AMBER], 'price_per_area'), 'the removed formula\'s other output goes').toBeUndefined();
    expect(retrieval(second).views?.[`${amber}/flat-days`]?.result).toEqual({ days_left: { value: 6 } });
    expect(retrieval(second).views?.[`${amber}/flat-metrics`], 'the removed formula\'s record goes').toBeUndefined();
    expect(edits.mock.calls.filter(([fileId]) => fileId === amber), 'one edit').toHaveLength(1);
  });

  it('AC27 b11-values-with-figures: map figures and formulas keep their records side by side; removing a formula keeps the others', async () => {
    const COUNT = { v: 1, id: 'flat-count', kind: 'aggregate', title: 'Flats', set: { type: 'flat', folderId: '$folder', recursive: true }, groupBy: [],
      measures: [{ id: 'n', label: 'Flats', op: 'count' }] };
    const MAP = `${HUNT}/Flat hunt.md`;
    const region = (name: string, body = '') => `<!-- bower:ownership/2 begin ${name} -->\n${body}<!-- bower:ownership/2 end ${name} -->\n`;
    const mapText = `---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: Flat hunt reference notes.\nbower_views: ${JSON.stringify([COUNT])}\n---\n`
      + region('current') + region('personal', '## My notes\nAlex keeps the flats together.\n') + region('timeline') + region('bower-note')
      + region('moc-overview', '## Overview\nFlat hunt reference notes.\n') + region('moc-figures', '## Figures\n') + region('moc-members', '## Notes\n');
    const extra = { rent_year: { type: 'money' } };
    const f = await folder([FLATS, YEAR], { ...FLATS_FILES, [MAP]: mapText }, extra);
    const mapId = await f.id(MAP);
    await f.drive.writeText(mapId, mapText.split('"$folder"').join(JSON.stringify(await f.id(HUNT))), (await f.drive.get(mapId)).modifiedTime);
    const amber = await f.id(AMBER);
    const first = await press(f);
    expect(phase(first)).toBe('done');
    expect(first.after[MAP], 'the figures are written').toContain('### Flats');
    for (const key of [`${mapId}/flat-count`, `${amber}/flat-metrics`, `${amber}/flat-year`]) expect(retrieval(first).views?.[key], key).toBeDefined();
    await setViews(f, [YEAR], extra);
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(retrieval(second).views?.[`${amber}/flat-metrics`], 'the removed formula\'s record goes').toBeUndefined();
    expect(retrieval(second).views?.[`${amber}/flat-year`]?.result, 'the other formula\'s record stays').toEqual({ rent_year: { value: { amount: 12000, currency: 'EUR' } } });
    // Run 2's cleanup rewrites the flats, so their versions in the record change legitimately (R38); the rest stays.
    const { inputs: _after, ...kept } = retrieval(second).views?.[`${mapId}/flat-count`] ?? {};
    const { inputs: _before, ...stored } = retrieval(first).views?.[`${mapId}/flat-count`] ?? {};
    expect(retrieval(second).views?.[`${mapId}/flat-count`], 'the figures\' record stays').toBeDefined();
    expect(kept, 'the figures\' record stays').toEqual(stored);
  });

  it('AC23 b11-values-duplicate-lines: duplicate lines of a computed key leave one line in the first one\'s place; removal takes every line of the key (ruling 4)', async () => {
    const DUNE = `${HUNT}/Dune flat.md`;
    const text = flat('Dune flat', ['days_left: 3', `rent: ${money(1000)}`, 'area: 50', 'deadline: 2026-10-14', 'days_left: 9']);
    const front = (t: string | undefined) => {
      const lines = (t ?? '').split('\n');
      return lines.slice(1, lines.indexOf('---', 1));
    };
    const f = await folder([FLATS], { ...FLATS_FILES, [DUNE]: text });
    const dune = await f.id(DUNE);
    const first = await press(f);
    expect(phase(first)).toBe('done');
    expect(front(first.after[DUNE]).filter((l) => l.startsWith('days_left:')), 'one line').toEqual(['days_left: 7']);
    expect(front(first.after[DUNE]).indexOf('days_left: 7'), 'in the first one\'s place').toBe(front(text).indexOf('days_left: 3'));
    // The first copy goes stale while the last holds the right value: readers take the first, so Bower writes.
    await f.drive.writeText(dune, (first.after[DUNE] ?? '').replace('days_left: 7', 'days_left: 2').replace('area: 50\n', 'area: 50\ndays_left: 7\n'),
      (await f.drive.get(dune)).modifiedTime);
    const second = await press(f);
    expect(phase(second)).toBe('done');
    expect(front(second.after[DUNE]).filter((l) => l.startsWith('days_left:')), 'no stale copy survives').toEqual(['days_left: 7']);
    expect(front(second.after[DUNE]).indexOf('days_left: 7'), 'in the first one\'s place').toBe(front(text).indexOf('days_left: 3'));
    // The same stale first copy, with this version's evidence kept by an earlier build that did not note duplicates.
    const stale = (second.after[DUNE] ?? '').replace('days_left: 7', 'days_left: 2').replace('area: 50\n', 'area: 50\ndays_left: 7\n');
    await f.drive.writeText(dune, stale, (await f.drive.get(dune)).modifiedTime);
    const retrievalId = await f.id(SYSTEM.retrieval);
    const kept = JSON.parse(second.after[SYSTEM.retrieval] ?? '{}') as { files: Record<string, Record<string, unknown>> };
    kept.files[dune] = { ...kept.files[dune], version: (await f.drive.get(dune)).modifiedTime, properties: frontValues(stale) };
    delete kept.files[dune]?.doubled;
    await f.drive.writeText(retrievalId, JSON.stringify(kept), (await f.drive.get(retrievalId)).modifiedTime);
    const cached = await press(f);
    expect(phase(cached)).toBe('done');
    expect(front(cached.after[DUNE]).filter((l) => l.startsWith('days_left:')), 'evidence that never noted duplicates is read again').toEqual(['days_left: 7']);
    // The person copies the line again, then takes the formula out of the row.
    await f.drive.writeText(dune, (cached.after[DUNE] ?? '').replace('area: 50\n', 'area: 50\ndays_left: 7\n'), (await f.drive.get(dune)).modifiedTime);
    await setViews(f, []);
    const third = await press(f);
    expect(phase(third)).toBe('done');
    expect(front(third.after[DUNE]).filter((l) => /^(?:days_left|price_per_area):/.test(l)), 'every line of a removed key goes').toEqual([]);
    expect(others(third.after[DUNE]), 'only computed lines change').toEqual(others(text));
  });

  it('AC23 b11-values-body-kept: body lines that look like computed properties, a rule line and CRLF line ends are kept exactly', async () => {
    const DUNE = `${HUNT}/Dune flat.md`;
    const body = '\r\nDune flat is in Saltmere.\r\n---\r\ndays_left: 99\r\nprice_per_area: lots\r\nRelated: [[Flat hunt]].\r\n';
    const text = `---\r\nsummary: Dune flat is in Saltmere.\r\ntype: flat\r\nby: bower\r\ncreated: 2026-10-01\r\nrent: ${money(1000)}\r\narea: 50\r\ndeadline: 2026-10-14\r\n---\r\n${body}`;
    const f = await folder([FLATS], { ...FLATS_FILES, [DUNE]: text });
    const run = await press(f);
    expect(phase(run)).toBe('done');
    const after = run.after[DUNE] ?? '';
    expect(computed(after, 'price_per_area'), 'the front matter gets its values').toEqual(TWENTY);
    expect(computed(after, 'days_left')).toBe(7);
    expect(after.endsWith(`---\r\n${body}`), 'the body is kept byte for byte').toBe(true);
    expect(/(?<!\r)\n/.test(after), 'every line keeps its CRLF end').toBe(false);
  });
});
