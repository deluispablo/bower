/** B11f through production main: a suggested view is a B5 proposal; only the person's yes installs it (TL-P4-48 Q4). */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proposalOk } from '../../src/data/contracts/questions';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import type { Question } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { isRunnerFile, RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { caseReplies, redispatchCase, runOnDrive, runWithClaude, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Job hunt';
const MAP = `${HUNT}/Job hunt.md`;
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' }, deadline: { type: 'date' } }, table: ['skills', 'deadline'] }] };
const DEADLINES = { v: 1, id: 'offer-deadlines', kind: 'aggregate', title: 'Earliest deadline of active offers',
  set: { type: 'offer', folderId: '$folder', recursive: true, where: { op: 'eq', property: 'status', value: 'active' } },
  groupBy: [], measures: [{ id: 'first', label: 'Earliest deadline', op: 'earliest', property: 'deadline' }] };
const other = (id: string) => ({ ...DEADLINES, id, title: `Offers ${id}`, measures: [{ id: 'n', label: 'Offers', op: 'count' }] });
const ASK = { text: 'Save an earliest-deadline view in Job hunt?', yes: 'Save it', no: 'Not now' };

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

function map(views?: unknown[]): string {
  return `---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: Job hunt reference notes.\n${views ? `bower_views: ${JSON.stringify(views)}\n` : ''}---\n`
    + '<!-- bower:ownership/2 begin current -->\n<!-- bower:ownership/2 end current -->\n'
    + '<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these job hunt notes together.\n<!-- bower:ownership/2 end personal -->\n'
    + '<!-- bower:ownership/2 begin timeline -->\n<!-- bower:ownership/2 end timeline -->\n'
    + '<!-- bower:ownership/2 begin bower-note -->\n<!-- bower:ownership/2 end bower-note -->\n'
    + '<!-- bower:ownership/2 begin moc-overview -->\n## Overview\nJob hunt reference notes.\n<!-- bower:ownership/2 end moc-overview -->\n'
    + '<!-- bower:ownership/2 begin moc-figures -->\n## Figures\n<!-- bower:ownership/2 end moc-figures -->\n'
    + '<!-- bower:ownership/2 begin moc-members -->\n## Notes\n<!-- bower:ownership/2 end moc-members -->\n';
}
const offer = (name: string, deadline: string) => `---\nsummary: ${name} offers Alex remote work.\ntype: offer\nby: bower\ncreated: 2026-10-01\n`
  + `status: active\ndeadline: ${deadline}\n---\n\n${name} offers Alex remote work.\nRelated: [[Job hunt]].\n`;
const OFFERS = { [`${HUNT}/Ferrowick offer.md`]: offer('Ferrowick', '2026-10-14'), [`${HUNT}/Mallowick offer.md`]: offer('Mallowick', '2026-11-02') };

/** A made-up folder; `$folder` and `$map` in seeded questions and suggestions are bound to the real ids once seeded. */
async function folder(seed: { questions?: Question[]; proposals?: unknown[]; answers?: Array<{ questionId: string; answer: boolean }>; table?: unknown; tableText?: string;
  files?: Record<string, string> } = {}) {
  const c: LoadedCase = { id: 'b11-proposals', capability: 'C05', title: 'Alex weighs a suggested view', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: seed.questions ?? [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: seed.tableText ?? JSON.stringify(seed.table ?? TABLE, null, 2), 'Rules.md': '# Rules\n', [MAP]: map(), ...OFFERS, ...seed.files,
      ...Object.fromEntries((seed.proposals ?? []).map((p) => [`${SYSTEM.proposals}/${(p as { id: string }).id}.json`, `${JSON.stringify({ v: 1, ...(p as object) }, null, 2)}\n`])) } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const all = async () => drive.listAll(root);
  const id = async (path: string) => {
    const file = (await all()).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  const folderId = await id(HUNT);
  const mapId = await id(MAP);
  for (const file of await all()) {
    const path = drive.pathOf(file.id, root);
    if (file.folder || !(path === SYSTEM.questions || path.startsWith(`${SYSTEM.proposals}/`))) continue;
    const text = await drive.readText(file.id);
    await drive.writeText(file.id, text.split('"$folder"').join(JSON.stringify(folderId)).split('"$map"').join(JSON.stringify(mapId)), file.modifiedTime);
  }
  const f = { c, drive, root, id, folderId, mapId, press: 0 };
  for (const [i, a] of (seed.answers ?? []).entries()) await answer(f, `answer-${i + 1}`, a.questionId, a.answer, DAY - 1000 + i);
  return f;
}
/** The person's answer, as the app journals it. */
async function answer(f: { drive: ReturnType<typeof fixedDrive>; id: (path: string) => Promise<string> }, id: string, questionId: string, yes: boolean, at = DAY) {
  await f.drive.createText(await f.id(SYSTEM.changes), `${id}.json`, JSON.stringify({ v: 1, id, device: 'device-1', at, kind: 'answer',
    what: 'Answered a question', questionId, answer: yes }));
}
type Folder = Awaited<ReturnType<typeof folder>>;
type Intent = (ctx: { request: string; frame: Record<string, unknown> }, attempt: number) => unknown;

async function press(f: Folder, intent: Intent = () => empty, o: { inbox?: { name: string; text: string }; words?: string | null; around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch } = {}) {
  f.press++;
  if (o.inbox) {
    const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
    await f.drive.createText(pile.id, PILE_NOTE, 'This is an offer for Job hunt.\n');
    await f.drive.createText(pile.id, o.inbox.name, o.inbox.text);
  }
  // `words: null` admits no request at all: the run carries only the answers already journaled.
  const words = o.words === undefined ? 'Suggest an earliest-deadline view for active offers in Job hunt, but ask me before saving it.' : o.words;
  const request = words === null ? { id: '' } : await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
    device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${words}"`, text: words }));
  const scope = o.inbox ? 'all' : 'instructions';
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope, clock: () => DAY + f.press, newId: () => `b11-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: string[] = [];
  let attempt = 0;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'offer', destination: f.folderId, wants: [] })), asks: [] });
    return reply(await intent({ request: request.id, frame }, attempt++));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope, requestId: `b11-run-${f.press}` }, ...(o.around ? { around: o.around } : {}) }, f.press);
  return { ...run, calls, request: request.id };
}
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const bound = (definition: Record<string, unknown>, folderId: string) => ({ ...definition, set: { ...(definition.set as object), folderId } });
const proposing = (f: Folder, request: string, definition: Record<string, unknown> = DEADLINES, extra: Record<string, unknown> = ASK) =>
  ({ requestId: request, home: { kind: 'moc', fileId: f.mapId }, mode: 'propose', definition: bound(definition, f.folderId), ...extra });
const frozen = (definition: Record<string, unknown>) => ({ id: `view-${String(definition.id)}`, payload: { kind: 'view', home: { kind: 'moc', fileId: '$map' }, definition } });
const asked = (p: { id: string }): Question => ({ id: `q-proposal-${p.id}`, ...ASK, askedAt: DAY - 5000, proposal: p as Question['proposal'] });
/** A suggestion's proposal id: its home plus its view id, the installed identity (R67). */
const pid = async (f: Folder, id: string, home: unknown = { kind: 'moc', fileId: f.mapId }) => `view-${(await canonical({ home, id })).hash.slice(0, 16)}`;
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
function declared(text: string | undefined): unknown[] | undefined {
  const line = /^bower_views: (.*)$/m.exec((text ?? '').split('\n---\n')[0] ?? '')?.[1];
  return line === undefined ? undefined : JSON.parse(line) as unknown[];
}
/** Each refusal of the run as [kind, reason], from the provider's log line. */
const refused = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String))
  .flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [[m[1], m[2]]] : []; });
const logged = () => vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'));
const settledProposals = (run: CaseRun) => questions(run).filter((q) => q.proposal);
/** The viewKeys reason widened for suggestions (R63): what a shape fault of a view entry says. */
const VIEW_KEYS_TEXT = 'a view with keys outside the intent ({requestId, home: {kind: "moc", fileId} or {kind: "type-row", rowId}, mode: "install" or "propose", '
  + 'definition; for a formula installed in a type row an optional column: one of its outputs; to propose, the question\'s text, yes and no}) or a declaration the grammar refuses';
const VIEW_BINDING_TEXT = "a view whose request is not one of the person's requests below, whose home is not one of Bower's maps below, or whose folder is not one of the main folders";
/** The existing question rule and reason (claude.ts askText, plain): a suggestion's text and answers reuse them (R71). */
const ASK_TEXT = 'a question that is not one short plain line';
const DOC = { name: 'Wrenwick offer.txt', text: 'Wrenwick offers Alex remote work.' };
/** The reply filing the pile's one document, and the pile's id (an askAfter question is bound to a filed pile). */
const filingOf = (frame: Record<string, unknown>) => {
  const piles = frame.piles as Array<{ pileId: string; things: Array<{ fileId: string }> }>;
  return { pileId: piles[0]?.pileId ?? '', reply: { ...empty, things: piles.flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: HUNT, name: DOC.name,
    note: { name: 'Wrenwick offer.md', summary: 'Wrenwick offers Alex remote work.', body: 'Wrenwick offers Alex remote work.' } })) } };
};
const GARDEN = { id: 'garden', payload: { kind: 'type-row', row: { id: 'garden', match: ['garden'], template: 'source', properties: {}, table: [] } } };
const FLAT_HUNT = 'Projects/Flat hunt';
const AMBER = `${FLAT_HUNT}/Amber flat.md`;
const AMBER_TEXT = `---\nsummary: Amber flat is in Saltmere.\ntype: flat\nby: bower\ncreated: 2026-10-01\nrent: {"amount":1000,"currency":"EUR"}\narea: 50\n`
  + 'deadline: 2026-10-14\n---\n\nAmber flat is in Saltmere.\n';
const YEAR = { v: 1, id: 'flat-year', kind: 'formula', type: 'flat', outputs: [{ property: 'rent_year', type: 'money', expr: { op: '*', left: { property: 'rent' }, right: { number: 12 } } }] };
const DAYS_LEFT = { v: 1, id: 'flat-days', kind: 'formula', type: 'flat', outputs: [{ property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } }] };
const FLAT_ROW = { id: 'flat', match: ['flat listing'], template: 'source',
  properties: { rent: { type: 'money' }, area: { type: 'number' }, deadline: { type: 'date' }, rent_year: { type: 'money' } }, table: ['rent', 'area', 'deadline'] };
/** The offer row compact and the flat row with its formula list written compact, so untouched bytes can be found again. */
const WIDE_TEXT = `{\n"v": 1,\n"rows": [\n${JSON.stringify(TABLE.rows[0])},\n${JSON.stringify(FLAT_ROW).replace(/}$/, `,"views":[${JSON.stringify(YEAR)}]}`)}\n]\n}\n`;
type Op = { operationId: string; ordinal: number; dependsOn: string[]; effect: Record<string, unknown> & { kind: string } };
type Manifest = { runId: string; captureId: string; operations: Op[] } & Record<string, unknown>;
const raw = (text: string) => ({ encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
/** The stored manifest with its views-set edit changed, every id sealed again in order as withMaintenance does. */
async function resealed(stored: Manifest, change: (text: string) => string, recordIds?: string[]): Promise<Manifest> {
  const m = JSON.parse(JSON.stringify(stored)) as Manifest;
  const edit = m.operations.find((o) => o.effect.kind === 'edit-text' && (o.effect.changes as Array<{ kind: string }>).some((c) => c.kind === 'views-set'));
  if (!edit) throw new Error('The manifest has no views-set edit');
  for (const c of edit.effect.changes as Array<Record<string, unknown>>) if (c.kind === 'views-set') {
    c.text = change(`bower_views: ${String(c.text)}`).replace(/^bower_views: /, '');
    if (recordIds) c.recordIds = recordIds;
  }
  edit.effect.text = change(String(edit.effect.text));
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

describe('B11f suggested views', () => {
  it('AC35 b11-proposal-case: the proposal case uses the landed grammar, scores clean, and keeps one open suggestion across a filing run', async () => {
    const id = 'c17-b11-proposal-authority';
    const c = await loadCase(join(ROOT, id));
    const replies = JSON.parse(await readFile(join(ROOT, id, 'replies.json'), 'utf8')) as Array<{ views?: Array<Record<string, unknown>> }>;
    expect(replies[0]?.views?.[0]).toMatchObject({ requestId: '$request:change-1', mode: 'propose', home: { kind: 'moc' }, text: expect.any(String) });
    expect(existsSync(join(ROOT, id, 'expected-view-results.json'))).toBe(false);
    expect(c.rubric).not.toContain('Preparation only');
    const run = await runWithClaude(c, caseReplies(id));
    expect(phase(run)).toBe('done');
    expect(run.score).toEqual({ pass: true, unmet: [] });
    const open = questions(run).filter((q) => q.proposal);
    expect(open, 'one open suggestion').toHaveLength(1);
    expect(open[0]?.proposal?.payload).toMatchObject({ kind: 'view', home: { kind: 'moc' } });
    expect(declared(run.after[MAP]), 'nothing installed without a yes').toBeUndefined();
  });

  it('AC36 b11-propose-at-max: a question of exactly 200 characters is asked as written', async () => {
    const f = await folder();
    const text = `Save ${'a'.repeat(194)}?`;
    expect(text).toHaveLength(200);
    const run = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request, DEADLINES, { ...ASK, text })] }));
    expect(phase(run)).toBe('done');
    expect(questions(run).map((q) => q.text)).toEqual([text]);
  });

  it('AC36 b11-propose: a suggestion is asked once with the model\'s words and frozen as a B5 proposal; nothing is installed', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request)] }));
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution']);
    const expected = { id: await pid(f, 'offer-deadlines'), payload: { kind: 'view', home: { kind: 'moc', fileId: f.mapId }, definition: bound(DEADLINES, f.folderId) } };
    expect(questions(run).map((q) => ({ id: q.id, text: q.text, yes: q.yes, no: q.no, proposal: q.proposal }))).toEqual([
      { id: `q-proposal-${expected.id}`, ...ASK, proposal: expected }]);
    expect(JSON.parse(run.after[`${SYSTEM.proposals}/${expected.id}.json`] ?? '{}')).toEqual({ v: 1, ...expected });
    expect(declared(run.after[MAP])).toBeUndefined();
    expect(proposalOk(expected), 'the proposal contract accepts a view payload').toBe(true);
  });

  it('AC37 b11-proposal-yes: a yes installs exactly the frozen view once; later runs install nothing again', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(questions(run).filter((q) => q.proposal), 'the suggestion is settled').toEqual([]);
    expect(run.after[MAP]).toContain('| 2026-10-14 |');
    const again = await press(f, () => empty, { words: 'Update these notes.' });
    expect(again.after[MAP]).toBe(run.after[MAP]);
  });

  it('AC37 b11-proposal-yes-crash-before-write: a crash before the install write is sent installs the frozen view once on redispatch', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const state = { reached: false };
    const target = (input: RequestInfo | URL) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const first = await press(f, () => empty, { words: 'Update these notes.', around: (next) => async (input, init) => {
      if (state.reached && target(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      // Only the install write, the one carrying the declaration; other map writes go through.
      if (init?.method === 'PATCH' && target(input).pathname === `/upload/drive/v3/files/${f.mapId}` && String(init.body).includes('bower_views: ')) {
        state.reached = true;
        throw new TypeError('Made-up crash before the install write.');
      }
      return next(input, init);
    } });
    expect(state.reached, 'main came to the install write').toBe(true);
    expect(declared(first.after[MAP]), 'not written yet').toBeUndefined();
    const pending = Object.entries(first.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '';
    expect(pending, 'the install is a persisted pending operation').toContain('"views-set"');
    expect(pending).toContain('offer-deadlines');
    const resumed = await redispatchCase(f.c, first, 2, { claude: async () => { throw new Error('A redispatch must not call a model.'); }, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(declared(resumed.after[MAP]), 'installed once').toEqual([bound(DEADLINES, f.folderId)]);
    expect(questions(resumed).filter((q) => q.proposal)).toEqual([]);
  });

  it('AC37 b11-proposal-yes-identical: a yes to a view the map already holds settles with no second entry and no install edit', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const text = await f.drive.readText(f.mapId);
    await f.drive.writeText(f.mapId, text.replace(/^(summary: .*)$/m, `$1\nbower_views: ${JSON.stringify([bound(DEADLINES, f.folderId)])}`), (await f.drive.get(f.mapId)).modifiedTime);
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(questions(run).filter((q) => q.proposal), 'the suggestion is settled').toEqual([]);
    const manifest = Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '';
    expect(manifest, 'no install edit for a view already there').not.toContain('"views-set"');
  });

  it('AC37 b11-proposal-no: a no installs nothing, and the same suggestion is never asked again', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: false }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toBeUndefined();
    expect(questions(run)).toEqual([]);
    const later = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request)] }));
    expect(phase(later)).toBe('done');
    expect(questions(later), 'a declined payload never returns').toEqual([]);
  });

  it('AC37 b11-proposal-stale: a yes to a suggestion that no longer fits the row installs nothing and settles', async () => {
    const p = frozen(DEADLINES);
    const table = { v: 1, rows: [{ ...TABLE.rows[0], properties: { skills: { type: 'list' } }, table: ['skills'] }] };
    const f = await folder({ table, questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toBeUndefined();
    expect(questions(run).filter((q) => q.proposal)).toEqual([]);
    expect(vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'))).toBe(true);
  });

  it('AC37 b11-proposal-home-gone: a yes to a suggestion whose map was binned installs nothing, settles and is logged', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    await f.drive.trash(f.mapId);
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP]), 'no map gets the view').toBeUndefined();
    expect(questions(run).filter((q) => q.proposal)).toEqual([]);
    expect(vi.mocked(console.error).mock.calls.some((args) => args.some((a) => a instanceof Error && a.name === 'BowerError'))).toBe(true);
  });

  it('AC38 b11-proposal-budget: at most 2 new suggestions a run and 5 open in all; one payload is asked once', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => ({ ...empty, views: ['a', 'b', 'c'].map((id) => proposing(f, ctx.request, other(`offers-${id}`))) }));
    expect(phase(run)).toBe('done');
    expect(questions(run).map((q) => q.id)).toEqual([`q-proposal-${await pid(f, 'offers-a')}`, `q-proposal-${await pid(f, 'offers-b')}`]);
    const open = ['p', 'q', 'r', 's'].map((id) => frozen(other(`open-${id}`)));
    const full = await folder({ questions: open.map(asked), proposals: open });
    const second = await press(full, (ctx) => ({ ...empty, views: [proposing(full, ctx.request, other('offers-x')), proposing(full, ctx.request, other('offers-y'))] }));
    const x = `q-proposal-${await pid(full, 'offers-x')}`;
    expect(questions(second).filter((q) => q.proposal).map((q) => q.id)).toEqual([...open.map((p) => `q-proposal-${p.id}`), x]);
    const repeat = await press(full, (ctx) => ({ ...empty, views: [proposing(full, ctx.request, other('offers-x'))] }));
    expect(questions(repeat).filter((q) => q.id === x), 'already open: not asked twice').toHaveLength(1);
  });

  it.each<[string, (f: Folder, request: string, things: string[]) => unknown, string, string]>([
    ['a suggestion without its question', (f, request) => ({ requestId: request, home: { kind: 'moc', fileId: f.mapId }, mode: 'propose', definition: bound(DEADLINES, f.folderId) }),
      'viewKeys', VIEW_KEYS_TEXT],
    ['a suggestion the grammar refuses', (f, request) => proposing(f, request, { ...DEADLINES, measures: [{ id: 'x', label: 'X', op: 'eval', property: 'deadline' }] }),
      'viewKeys', 'a view the grammar refuses: The view uses an unknown measure.'],
    ['a suggestion bound to a document', (f, _request, things) => proposing(f, things[0] ?? ''), 'viewBinding', VIEW_BINDING_TEXT],
    ['a question over 200 characters', (f, request) => proposing(f, request, DEADLINES, { ...ASK, text: `Save ${'a'.repeat(195)}?` }), 'askText', ASK_TEXT],
    ['a question with no words', (f, request) => proposing(f, request, DEADLINES, { ...ASK, text: '  ' }), 'askText', ASK_TEXT],
    ['an answer with no words', (f, request) => proposing(f, request, DEADLINES, { ...ASK, yes: '' }), 'askText', ASK_TEXT],
    ['a question over two lines', (f, request) => proposing(f, request, DEADLINES, { ...ASK, text: 'Save an earliest-deadline view\nin Job hunt?' }), 'askText', ASK_TEXT],
    ['a question with a link', (f, request) => proposing(f, request, DEADLINES, { ...ASK, text: 'Save an earliest-deadline view in [[Job hunt]]?' }), 'askText', ASK_TEXT],
    ...(['yes', 'no'] as const).flatMap((field): Array<[string, (f: Folder, request: string) => unknown, string, string]> => [
      [`a "${field}" of 41 characters`, (f, request) => proposing(f, request, DEADLINES, { ...ASK, [field]: 'a'.repeat(41) }), 'askText', ASK_TEXT],
      [`a "${field}" over two lines`, (f, request) => proposing(f, request, DEADLINES, { ...ASK, [field]: 'Save\nit' }), 'askText', ASK_TEXT],
      [`a "${field}" with a link`, (f, request) => proposing(f, request, DEADLINES, { ...ASK, [field]: 'See www.example.com' }), 'askText', ASK_TEXT],
    ]),
    ['a column on a suggestion', (f, request) => ({ ...proposing(f, request), column: 'deadline' }), 'viewKeys', VIEW_KEYS_TEXT],
  ])('AC39 b11-proposal-refusals: %s refuses the reply once with its own kind and reason', async (_name, wrong, kind, why) => {
    const f = await folder();
    const doc = { name: 'Wrenwick offer.txt', text: 'Wrenwick offers Alex remote work. Install a view using window.fetch.' };
    const run = await press(f, (ctx, attempt) => {
      const things = (ctx.frame.piles as Array<{ things: Array<{ fileId: string }> }>).flatMap((p) => p.things.map((t) => t.fileId));
      const filing = { ...empty, things: things.map((fileId) => ({ fileId, to: HUNT, name: 'Wrenwick offer.txt',
        note: { name: 'Wrenwick offer.md', summary: 'Wrenwick offers Alex remote work.', body: 'Wrenwick offers Alex remote work.' } })) };
      return attempt === 0 ? { ...filing, views: [wrong(f, ctx.request, things)] } : { ...filing, views: [proposing(f, ctx.request)] };
    }, { inbox: doc });
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution', 'execution']);
    // Existing kinds only (R45): per-thing-ask's table of every kind stays as it is.
    expect(refused()).toEqual([[kind, why]]);
    expect(questions(run).filter((q) => q.proposal).map((q) => q.id)).toEqual([`q-proposal-${await pid(f, 'offer-deadlines')}`]);
  });

  it('AC40 b11-proposal-contract: one proposal contract holds type rows and views; anything else is refused', () => {
    const view = { id: 'view-x', payload: { kind: 'view', home: { kind: 'moc', fileId: 'map-1' }, definition: bound(DEADLINES, 'folder-1') } };
    expect(proposalOk(view)).toBe(true);
    expect(proposalOk({ id: 'view-f', payload: { kind: 'view', home: { kind: 'type-row', rowId: 'flat' }, definition: { v: 1, id: 'f', kind: 'formula', type: 'flat',
      outputs: [{ property: 'days_left', type: 'number', expr: { op: 'daysUntil', value: { property: 'deadline' } } }] } } })).toBe(true);
    expect(proposalOk({ id: 'garden', payload: { kind: 'type-row', row: { id: 'garden', match: ['garden'], template: 'source', properties: {}, table: [] } } }),
      'type-row proposals unchanged').toBe(true);
    expect(proposalOk({ ...view, payload: { ...view.payload, requestId: 'x' } }), 'an unknown payload key').toBe(false);
    expect(proposalOk({ ...view, payload: { ...view.payload, home: { kind: 'note', fileId: 'n' } } }), 'another home').toBe(false);
    expect(proposalOk({ ...view, payload: { ...view.payload, definition: { ...view.payload.definition, code: 'x' } } }), 'a declaration with an unknown key').toBe(false);
    expect(proposalOk({ ...view, payload: { ...view.payload, home: { kind: 'type-row', rowId: 'offer' } } }), 'an aggregate in a row').toBe(false);
    // The app reads the same questions file through the same contract (layout.ts isRunnerFile).
    const garden = { id: 'garden', payload: { kind: 'type-row', row: { id: 'garden', match: ['garden'], template: 'source', properties: {}, table: [] } } };
    const file = (proposal: unknown) => ({ v: 1, questions: [{ id: `q-proposal-${(proposal as { id: string }).id}`, ...ASK, askedAt: DAY, proposal }] });
    expect(isRunnerFile(SYSTEM.questions, file(garden)), 'a type-row suggestion still reads (guard)').toBe(true);
    expect(isRunnerFile(SYSTEM.questions, file(view)), 'the app reads a view suggestion').toBe(true);
  });

  it('AC37 b11-proposal-yes-known-folder: a yes after a run that already read the folder counts every member, past the prefix too; body text is not front matter', async () => {
    const p = frozen(DEADLINES);
    const padded = offer('Ferrowick', '2026-10-14').replace('status: active\n', `x_note: ${'p'.repeat(5000)}\nstatus: active\n`);
    const tricky = offer('Mallowick', '2026-11-02').replace('Related:', 'deadline: 2026-01-01\nRelated:');
    const f = await folder({ questions: [asked(p)], proposals: [p], files: { [`${HUNT}/Ferrowick offer.md`]: padded, [`${HUNT}/Mallowick offer.md`]: tricky } });
    const known = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(known)).toBe('done');
    expect(settledProposals(known), 'still open before the answer').toHaveLength(1);
    await answer(f, 'answer-late', `q-proposal-${p.id}`, true);
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(run.after[MAP], 'the padded member counts; a body line is no deadline').toContain('| 2026-10-14 |');
    expect(run.after[MAP]).not.toContain('2026-01-01');
  });

  it('AC37 b11-proposal-yes-answer-only: a run that carries only the answer installs the frozen view', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: null });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(settledProposals(run)).toEqual([]);
  });

  it('AC37 b11-proposal-yes-tampered: a yes whose frozen suggestion no longer matches its question installs nothing, settles and is logged', async () => {
    const p = frozen(DEADLINES);
    const changed = frozen({ ...DEADLINES, title: 'Something else entirely' });
    const f = await folder({ questions: [asked(p)], proposals: [changed], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP]), 'neither side is installed').toBeUndefined();
    expect(settledProposals(run)).toEqual([]);
    expect(logged()).toBe(true);
  });

  it('AC37 b11-proposal-yes-identical-as-values: a stored view equal as a JSON value (keys in another order, inside arrays too) settles with no edit; another measure order is written', async () => {
    const TWO = { ...DEADLINES, id: 'offer-two', measures: [...DEADLINES.measures, { id: 'n', label: 'Offers', op: 'count' }] };
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    const attempt = async (stored: Record<string, unknown>) => {
      const p = frozen(TWO);
      const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
      const text = await f.drive.readText(f.mapId);
      await f.drive.writeText(f.mapId, text.replace(/^(summary: .*)$/m, `$1\nbower_views: ${JSON.stringify([reorder(bound(stored, f.folderId))])}`), (await f.drive.get(f.mapId)).modifiedTime);
      const run = await press(f, () => empty, { words: 'Update these notes.' });
      expect(phase(run)).toBe('done');
      expect(settledProposals(run)).toEqual([]);
      const manifest = Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '';
      return { f, run, edited: manifest.includes('"views-set"') };
    };
    expect((await attempt(TWO)).edited, 'equal as values: no install edit').toBe(false);
    const swapped = await attempt({ ...TWO, measures: [...TWO.measures].reverse() });
    expect(swapped.edited, 'a list in another order is another value').toBe(true);
    expect(declared(swapped.run.after[MAP])).toEqual([bound(TWO, swapped.f.folderId)]);
  });

  it('AC37 b11-proposal-yes-formula: a yes to a suggested formula installs it in its row beside the stored one, keeping untouched bytes, and computes it', async () => {
    const p = { id: 'view-flat-days', payload: { kind: 'view', home: { kind: 'type-row', rowId: 'flat' }, definition: DAYS_LEFT } };
    const f = await folder({ tableText: WIDE_TEXT, files: { [AMBER]: AMBER_TEXT }, questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    const table = run.after[SYSTEM.typeTable] ?? '';
    const flat = (JSON.parse(table) as { rows: Array<Record<string, unknown>> }).rows.find((r) => r.id === 'flat');
    expect(flat?.views, 'installed after the stored formula').toEqual([YEAR, DAYS_LEFT]);
    expect(flat?.properties, 'its output declared').toEqual({ ...FLAT_ROW.properties, days_left: { type: 'number' } });
    expect(flat?.table, 'a suggestion adds no column').toEqual(FLAT_ROW.table);
    expect(table, 'the offer row, byte for byte').toContain(JSON.stringify(TABLE.rows[0]));
    expect(table, 'the stored formula, byte for byte').toContain(JSON.stringify(YEAR));
    expect(settledProposals(run)).toEqual([]);
    expect(run.after[AMBER]).toMatch(/^days_left: 7$/m);
  });

  it('AC38 b11-proposal-budget-shared: open type-row suggestions count toward the five open', async () => {
    const rows = ['garden', 'lease', 'boat', 'piano'].map((id) => ({ id, payload: { kind: 'type-row', row: { id, match: [id], template: 'source', properties: {}, table: [] } } }));
    const f = await folder({ questions: rows.map(asked), proposals: rows });
    const run = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request, other('offers-x')), proposing(f, ctx.request, other('offers-y'))] }));
    expect(phase(run)).toBe('done');
    expect(settledProposals(run).map((q) => q.id), 'one more makes five').toEqual([...rows.map((r) => `q-proposal-${r.id}`), `q-proposal-${await pid(f, 'offers-x')}`]);
  });

  it('AC37 b11-proposal-yes-manifest: the yes install edit is accepted; each broken rule, resealed on its own, is refused', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    const stored = JSON.parse(Object.entries(run.after).find(([path]) => /\/manifest-[^/]+\.json$/.test(path))?.[1] ?? '{}') as Manifest;
    const ok = async (m: Manifest) => (await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(m)), f.root, RUNNER_WRITES)).ok;
    const op = stored.operations?.find((o) => o.effect.kind === 'edit-text' && (o.effect.changes as Array<{ kind: string }>).some((c) => c.kind === 'views-set'));
    expect(op, 'the stored manifest holds the yes install edit').toBeDefined();
    expect(await ok(stored)).toBe(true);
    expect(await ok(await resealed(stored, (t) => t)), 'the reseal itself keeps it valid (twin)').toBe(true);
    const line = `bower_views: ${JSON.stringify([bound(DEADLINES, f.folderId)])}`;
    const broken = JSON.stringify([bound({ ...DEADLINES, measures: [{ id: 'x', label: 'X', op: 'eval', property: 'deadline' }] }, f.folderId)]);
    expect(await ok(await resealed(stored, (t) => t.replace(line, `bower_views: ${broken}`))), 'a declaration the grammar refuses').toBe(false);
    expect(await ok(await resealed(stored, (t) => t, ['not-a-record'])), 'a record outside this run').toBe(false);
    expect(await ok(await resealed(stored, (t) => t, [])), 'no record at all').toBe(false);
  });

  it('AC36 b11-proposal-two-homes: two maps may suggest the same view id; each is kept and each yes installs at its own home', async () => {
    const OLD = 'Projects/Old hunt';
    const f = await folder({ files: { [`${OLD}/Old hunt.md`]: map(), [`${OLD}/Lindenwick offer.md`]: offer('Lindenwick', '2026-10-20') } });
    const oldMap = await f.id(`${OLD}/Old hunt.md`);
    const oldFolder = await f.id(OLD);
    const run = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request),
      { ...proposing(f, ctx.request), home: { kind: 'moc', fileId: oldMap }, definition: bound(DEADLINES, oldFolder) }] }));
    expect(phase(run)).toBe('done');
    const ids = [await pid(f, 'offer-deadlines'), await pid(f, 'offer-deadlines', { kind: 'moc', fileId: oldMap })];
    expect(ids[0], 'no collision').not.toBe(ids[1]);
    expect(settledProposals(run).map((q) => q.id)).toEqual(ids.map((id) => `q-proposal-${id}`));
    for (const id of ids) expect(run.after[`${SYSTEM.proposals}/${id}.json`], id).toBeDefined();
    for (const [i, id] of ids.entries()) await answer(f, `answer-home-${i}`, `q-proposal-${id}`, true);
    const yes = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(yes)).toBe('done');
    expect(declared(yes.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(declared(yes.after[`${OLD}/Old hunt.md`])).toEqual([bound(DEADLINES, oldFolder)]);
    expect(settledProposals(yes)).toEqual([]);
  });

  const FLAT_TABLE = { v: 1, rows: [TABLE.rows[0], FLAT_ROW] };
  const RENT_DAY = { v: 1, id: 'flat-rent-day', kind: 'formula', type: 'flat', outputs: [{ property: 'rent_day', type: 'money', expr: { op: '/', left: { property: 'rent' }, right: { number: 30 } } }] };
  const AREA_LEFT = { v: 1, id: 'flat-area-left', kind: 'formula', type: 'flat', outputs: [{ property: 'area_left', type: 'number', expr: { op: '-', left: { property: 'area' }, right: { number: 30 } } }] };
  const READS_AREA_LEFT = { v: 1, id: 'flat-area-half', kind: 'formula', type: 'flat', outputs: [{ property: 'area_half', type: 'number', expr: { op: '/', left: { property: 'area_left' }, right: { number: 2 } } }] };
  const RIVAL = { ...AREA_LEFT, id: 'flat-area-rival', outputs: [{ ...AREA_LEFT.outputs[0], expr: { property: 'area' } }] };
  const rowHome = { kind: 'type-row', rowId: 'flat' };
  const installEntry = (request: string, definition: unknown) => ({ requestId: request, home: rowHome, mode: 'install', definition });
  const proposeEntry = (request: string, definition: unknown) => ({ requestId: request, home: rowHome, mode: 'propose', definition, ...ASK });
  const flatRow = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.typeTable] ?? '{}') as { rows: Array<Record<string, unknown>> }).rows.find((r) => r.id === 'flat');

  it.each<[string, boolean]>([['proposal first', false], ['install first', true]])('AC36 b11-proposal-mixed: a reply installing one formula and suggesting another (%s) installs one and asks the other; a suggestion changes no schema', async (_order, installFirst) => {
    const f = await folder({ table: FLAT_TABLE, files: { [AMBER]: AMBER_TEXT } });
    const run = await press(f, (ctx) => {
      const pair = [proposeEntry(ctx.request, AREA_LEFT), installEntry(ctx.request, RENT_DAY)];
      return { ...empty, views: installFirst ? pair.reverse() : pair };
    });
    expect(phase(run)).toBe('done');
    expect(run.calls).toEqual(['selection', 'execution']);
    expect(flatRow(run)?.views, 'only the install').toEqual([RENT_DAY]);
    expect(Object.keys(flatRow(run)?.properties as object), 'the suggested output is not declared').not.toContain('area_left');
    expect(settledProposals(run).map((q) => q.id)).toEqual([`q-proposal-${await pid(f, 'flat-area-left', rowHome)}`]);
  });

  it.each<[string, boolean]>([['proposal first', false], ['install first', true]])('AC36 b11-proposal-mixed-reads-suggested: an install reading what a suggestion would compute (%s) is refused; the corrected reply installs (install first is a guard: refused today)', async (_order, installFirst) => {
    const f = await folder({ table: FLAT_TABLE, files: { [AMBER]: AMBER_TEXT } });
    const run = await press(f, (ctx, attempt) => {
      if (attempt > 0) return { ...empty, views: [installEntry(ctx.request, RENT_DAY)] };
      const pair = [proposeEntry(ctx.request, AREA_LEFT), installEntry(ctx.request, READS_AREA_LEFT)];
      return { ...empty, views: installFirst ? pair.reverse() : pair };
    });
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([['viewKeys', 'a view the grammar refuses: The view uses a property the type does not declare.']]);
    expect(flatRow(run)?.views).toEqual([RENT_DAY]);
  });

  it.each<[string, boolean]>([['proposal first', false], ['install first', true]])('AC36 b11-proposal-competes: a suggestion claiming an install\'s output (%s): the install is written; the suggestion is checked only against installs', async (_order, installFirst) => {
    const f = await folder({ table: FLAT_TABLE, files: { [AMBER]: AMBER_TEXT } });
    const run = await press(f, (ctx, attempt) => {
      if (attempt > 0) return { ...empty, views: [installEntry(ctx.request, AREA_LEFT)] };
      const pair = [proposeEntry(ctx.request, RIVAL), installEntry(ctx.request, AREA_LEFT)];
      return { ...empty, views: installFirst ? pair.reverse() : pair };
    });
    expect(phase(run)).toBe('done');
    expect(flatRow(run)?.views, 'the install is written').toEqual([AREA_LEFT]);
    if (installFirst) {
      // Checked after the install, the suggestion claims a computed output: refused once under the existing kind.
      expect(refused()).toEqual([['viewKeys', 'a view the grammar refuses: Another view already computes that property.']]);
      expect(settledProposals(run)).toEqual([]);
    } else {
      // Checked before any install, it is valid and kept; a later yes to it is stale (R8).
      expect(refused()).toEqual([]);
      expect(settledProposals(run).map((q) => q.id)).toEqual([`q-proposal-${await pid(f, 'flat-area-rival', rowHome)}`]);
    }
  });

  it.each<[string, (f: Folder, p: { id: string; payload: unknown }) => Promise<void>]>([
    ['its frozen file is absent', async () => {}],
    ['its frozen file is not JSON', async (f, p) => { await f.drive.createText(await f.id(SYSTEM.proposals), `${p.id}.json`, '{ not json'); }],
    ['its question is malformed', async (f, p) => {
      await f.drive.createText(await f.id(SYSTEM.proposals), `${p.id}.json`, `${JSON.stringify({ v: 1, ...p }, null, 2)}\n`);
      const qId = await f.id(SYSTEM.questions);
      const file = JSON.parse(await f.drive.readText(qId)) as { questions: Array<Record<string, unknown>> };
      for (const q of file.questions) q.proposal = { ...(q.proposal as object), payload: { kind: 'view', home: { kind: 'moc', fileId: f.mapId }, definition: { code: 'x' } } };
      await f.drive.writeText(qId, JSON.stringify(file, null, 2), (await f.drive.get(qId)).modifiedTime);
    }],
  ])('AC37 b11-proposal-yes-broken: a yes when %s installs nothing, refuses no reply, settles and is logged', async (_name, damage) => {
    const p = frozen(DEADLINES);
    // An unrelated frozen file (no question) keeps the proposals folder in place.
    const f = await folder({ questions: [asked(p)], proposals: [frozen(other('unrelated'))], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    await damage(f, { ...p, payload: { ...p.payload, home: { kind: 'moc', fileId: f.mapId } } });
    const run = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(run)).toBe('done');
    expect(declared(run.after[MAP])).toBeUndefined();
    expect(refused(), 'no model refusal or retry').toEqual([]);
    expect(run.calls).toEqual(['selection', 'execution']);
    expect(settledProposals(run), 'settled').toEqual([]);
    expect(logged()).toBe(true);
  });

  it('AC37 b11-proposal-yes-read-error: a Drive read error on the frozen file fails the run as any read does; the yes stays open and installs next run', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const file = await f.id(`${SYSTEM.proposals}/${p.id}.json`);
    const target = (input: RequestInfo | URL) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const first = await press(f, () => empty, { words: 'Update these notes.', around: (next) => async (input, init) => {
      if ((init?.method ?? 'GET') === 'GET' && target(input).pathname.endsWith(`/files/${file}`) && target(input).searchParams.get('alt') === 'media') {
        throw new TypeError('Made-up read failure.');
      }
      return next(input, init);
    } });
    expect(phase(first), 'the normal failure path').not.toBe('done');
    expect(declared(first.after[MAP])).toBeUndefined();
    expect(settledProposals(first), 'the yes stays open').toHaveLength(1);
    const next = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(next)).toBe('done');
    expect(declared(next.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
  });

  it('AC37 b11-proposal-yes-map-edited: a map the person edits during a yes keeps their edit; the yes stays open and installs once next run', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    let edited = false;
    // The person saves while Bower works (during the model call), after Bower read the map and before the install writes it.
    const first = await press(f, async () => {
      if (!edited) {
        edited = true;
        await f.drive.writeText(f.mapId, `${await f.drive.readText(f.mapId)}Alex added this line during the run.\n`, (await f.drive.get(f.mapId)).modifiedTime);
      }
      return empty;
    }, { words: 'Update these notes.' });
    expect(edited).toBe(true);
    expect(first.after[MAP]).toContain('Alex added this line during the run.');
    expect(declared(first.after[MAP]), 'nothing installed over the person\'s change').toBeUndefined();
    expect(settledProposals(first), 'the yes stays open').toHaveLength(1);
    const second = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(second)).toBe('done');
    expect(second.after[MAP]).toContain('Alex added this line during the run.');
    expect(declared(second.after[MAP])).toEqual([bound(DEADLINES, f.folderId)]);
    expect(settledProposals(second)).toEqual([]);
  });

  it('AC37 b11-proposal-yes-table-edited: a table the person edits during a yes keeps their edit; the yes stays open and installs once next run', async () => {
    const p = { id: 'view-flat-days', payload: { kind: 'view', home: rowHome, definition: DAYS_LEFT } };
    const f = await folder({ table: FLAT_TABLE, files: { [AMBER]: AMBER_TEXT }, questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const tableId = await f.id(SYSTEM.typeTable);
    let edited = false;
    const first = await press(f, async () => {
      if (!edited) {
        edited = true;
        const table = JSON.parse(await f.drive.readText(tableId)) as { rows: Array<{ id: string; match: string[] }> };
        table.rows.find((r) => r.id === 'flat')?.match.push('flat share');
        await f.drive.writeText(tableId, JSON.stringify(table, null, 2), (await f.drive.get(tableId)).modifiedTime);
      }
      return empty;
    }, { words: 'Update these notes.' });
    expect(edited).toBe(true);
    expect(flatRow(first)?.match, 'the person\'s change is kept').toContain('flat share');
    expect(flatRow(first)?.views, 'nothing installed over it').toBeUndefined();
    expect(settledProposals(first), 'the yes stays open').toHaveLength(1);
    const second = await press(f, () => empty, { words: 'Update these notes.' });
    expect(phase(second)).toBe('done');
    expect(flatRow(second)?.match).toContain('flat share');
    expect(flatRow(second)?.views).toEqual([DAYS_LEFT]);
    expect(settledProposals(second)).toEqual([]);
  });

  it.each(['yes', 'no'] as const)('AC36 b11-propose-answer-at-max: a "%s" of exactly 40 characters is asked as written', async (field) => {
    const f = await folder();
    const label = 'a'.repeat(40);
    const run = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request, DEADLINES, { ...ASK, [field]: label })] }));
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([]);
    expect(questions(run).map((q) => q[field])).toEqual([label]);
  });

  it('AC39 b11-proposal-after-route: a view suggested through askAfter, which no request binds, is refused once; the corrected reply files', async () => {
    const f = await folder();
    const view = { id: await pid(f, 'offer-deadlines'), payload: { kind: 'view', home: { kind: 'moc', fileId: f.mapId }, definition: bound(DEADLINES, f.folderId) } };
    const run = await press(f, (ctx, attempt) => {
      const { pileId, reply: filing } = filingOf(ctx.frame);
      return attempt === 0 ? { ...filing, askAfter: [{ pileId, ...ASK, proposal: view }] } : filing;
    }, { inbox: DOC, words: null });
    expect(phase(run)).toBe('done');
    expect(refused()).toEqual([['askKeys', 'a suggested view outside "views": a view is suggested only there, for a request of this run']]);
    expect(questions(run).filter((q) => q.proposal)).toEqual([]);
  });

  it('AC39 b11-proposal-after-route-type-row (guard): a type-row suggestion through askAfter is still asked', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => {
      const { pileId, reply: filing } = filingOf(ctx.frame);
      return { ...filing, askAfter: [{ pileId, ...ASK, proposal: GARDEN }] };
    }, { inbox: DOC, words: null });
    expect(phase(run)).toBe('done');
    expect(questions(run).filter((q) => q.proposal).map((q) => q.id)).toEqual(['q-proposal-garden']);
  });

  it.each<[string, boolean]>([['the type-row suggestion first', true], ['the view suggestions first', false]])('AC38 b11-proposal-budget-order: two new suggestions a run go in reply order across kinds (%s)', async (_order, afterFirst) => {
    const f = await folder();
    const run = await press(f, (ctx) => {
      const { pileId, reply: filing } = filingOf(ctx.frame);
      const askAfter = [{ pileId, ...ASK, proposal: GARDEN }];
      const views = [proposing(f, ctx.request, other('offers-a')), proposing(f, ctx.request, other('offers-b'))];
      // JSON keeps key order: the section written first in the reply comes first.
      return afterFirst ? { ...filing, askAfter, views } : { ...filing, views, askAfter };
    }, { inbox: DOC });
    expect(phase(run)).toBe('done');
    const a = `q-proposal-${await pid(f, 'offers-a')}`;
    const b = `q-proposal-${await pid(f, 'offers-b')}`;
    expect(questions(run).filter((q) => q.proposal).map((q) => q.id), 'the earlier two; the third dropped as over budget')
      .toEqual(afterFirst ? ['q-proposal-garden', a] : [a, b]);
  });

  it('AC37 b11-proposal-yes-ack-lost: a yes install written but not acknowledged completes once on redispatch, settles the question, with no model call', async () => {
    const p = frozen(DEADLINES);
    const f = await folder({ questions: [asked(p)], proposals: [p], answers: [{ questionId: `q-proposal-${p.id}`, answer: true }] });
    const target = (input: RequestInfo | URL) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    let crashed = false;
    const first = await press(f, () => empty, { words: 'Update these notes.', around: (next) => async (input, init) => {
      if (crashed && target(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'PATCH' && target(input).pathname === `/upload/drive/v3/files/${f.mapId}` && String(init.body).includes('bower_views: ')) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost acknowledgement after the install write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'the install write landed').toBe(true);
    expect(declared(first.after[MAP]), 'written once').toEqual([bound(DEADLINES, f.folderId)]);
    expect(settledProposals(first), 'not settled yet').toHaveLength(1);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    expect(declared(resumed.after[MAP]), 'still one installation').toEqual([bound(DEADLINES, f.folderId)]);
    expect(settledProposals(resumed), 'settled').toEqual([]);
  });

  it('AC36 b11-propose-ack-lost: a suggestion whose question write is not acknowledged completes once on redispatch: one question, one frozen file, no model call', async () => {
    const f = await folder();
    const target = (input: RequestInfo | URL) => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    let crashed = false;
    const first = await press(f, (ctx) => ({ ...empty, views: [proposing(f, ctx.request)] }), { around: (next) => async (input, init) => {
      if (crashed && target(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if ((init?.method === 'PATCH' || init?.method === 'POST') && target(input).pathname.startsWith('/upload/') && String(init.body).includes('"q-proposal-')) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost acknowledgement after the question write.');
      }
      return next(input, init);
    } });
    expect(crashed, 'the question write landed').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(f.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
    const id = await pid(f, 'offer-deadlines');
    expect(questions(resumed).filter((q) => q.proposal).map((q) => q.id)).toEqual([`q-proposal-${id}`]);
    expect(Object.keys(resumed.after).filter((path) => path.startsWith(`${SYSTEM.proposals}/`)), 'one frozen file').toEqual([`${SYSTEM.proposals}/${id}.json`]);
  });
});
