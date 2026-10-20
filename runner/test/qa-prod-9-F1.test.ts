/**
 * qa-prod-9-F1: a refused view holds only the request it names, after the retry, and the rest of the tidy-up is filed; a view
 * naming a request the run does not know still refuses the whole reply, and its last log line says it names no pile or request
 * (specs/qa-prod-9/plan.md, F1). Prior art: partial-success batch APIs (SQS SendMessageBatch, Elasticsearch _bulk) and the
 * Invalid Message Channel. The harness is b11-proposals' `folder` and `press`. Every run goes through production main over a
 * made-up folder; only the model is replaced.
 */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission, SET_ASIDE } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { NOTHING_FOUND_WHY } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { REFUSALS, type ClaudeSpawn, type RefusalKind } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Job hunt';
const MAP = `${HUNT}/Job hunt.md`;
const IDEAS = 'Resources/Ideas/Ideas.md';
const TABLE = { v: 1, rows: [{ id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' }, deadline: { type: 'date' } }, table: ['skills', 'deadline'] }] };
const DEADLINES = { v: 1, id: 'offer-deadlines', kind: 'aggregate', title: 'Earliest deadline of active offers',
  set: { type: 'offer', folderId: '$folder', recursive: true, where: { op: 'eq', property: 'status', value: 'active' } },
  groupBy: [], measures: [{ id: 'first', label: 'Earliest deadline', op: 'earliest', property: 'deadline' }] };
const ASK = { text: 'Save an earliest-deadline view in Job hunt?', yes: 'Save it', no: 'Not now' };
const WORDS = 'Suggest an earliest-deadline view for active offers in Job hunt, but ask me before saving it.';
const DOC = { name: 'Wrenwick offer.txt', text: 'Wrenwick offers Alex remote work.' };
const WAITS = "Bower couldn't tidy this up yet. Try again.";

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

function map(by = 'by: bower\n'): string {
  return `---\nbower_format: ownership/2\n${by}type: moc\nsummary: Job hunt reference notes.\n---\n`
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

/** A made-up folder (b11-proposals' `folder`, without seeded questions): `files` are added beside the map and offers. */
async function folder(files: Record<string, string> = {}) {
  const c: LoadedCase = { id: 'qa-prod-9-F1', capability: 'C05', title: 'Alex weighs a suggested view', covers: 'model', source: 'new', scope: 'all',
    allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inbox: [], inboxFiles: {}, folder: { [SYSTEM.typeTable]: JSON.stringify(TABLE, null, 2), 'Rules.md': '# Rules\n', [MAP]: map(), ...OFFERS, ...files } };
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const id = async (path: string) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`Missing made-up file ${path}`);
    return file.id;
  };
  return { c, drive, root, id, folderId: await id(HUNT), mapId: await id(MAP), press: 0 };
}
type Folder = Awaited<ReturnType<typeof folder>>;
type Intent = (ctx: { request: string; frame: Record<string, unknown> }) => unknown;

/** One tidy-up (b11-proposals' `press`): the offer in a pile of the Inbox and the default request words; the same execution reply for both attempts. */
async function press(f: Folder, intent: Intent) {
  f.press++;
  const pile = await f.drive.createFolder(await f.id('Inbox'), `Pile ${f.press}`, { pile: `pile-${f.press}` });
  await f.drive.createText(pile.id, PILE_NOTE, 'This is an offer for Job hunt.\n');
  await f.drive.createText(pile.id, DOC.name, DOC.text);
  const request = await f.drive.createText(await f.id(SYSTEM.changes), `press-${f.press}.json`, JSON.stringify({ v: 1, id: `press-${f.press}`,
    device: 'device-1', at: DAY + f.press, kind: 'request', what: `Asked Bower: "${WORDS}"`, text: WORDS }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'all', clock: () => DAY + f.press, newId: () => `qa9-admission-${f.press}` });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const calls: string[] = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf(call) as Record<string, unknown> & { sources?: Array<{ itemId: string }> };
    calls.push(phase);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'offer', destination: f.folderId, wants: [] })), asks: [] });
    return reply(await intent({ request: request.id, frame }));
  }, () => ({ drive: f.drive, root: f.root, admission: admission.manifest }), true);
  const run = await runOnDrive(f.c, f.drive, f.root, { claude: spawn, admission: admission.manifest, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'all', requestId: `qa9-run-${f.press}` } }, f.press);
  return { ...run, calls };
}
const empty = { kind: 'tidy-intent', v: 1, things: [] };
const bound = (definition: Record<string, unknown>, folderId: string) => ({ ...definition, set: { ...(definition.set as object), folderId } });
const proposing = (f: Folder, request: string, definition: Record<string, unknown> = DEADLINES, extra: Record<string, unknown> = ASK) =>
  ({ requestId: request, home: { kind: 'moc', fileId: f.mapId }, mode: 'propose', definition: bound(definition, f.folderId), ...extra });
const phase = (run: CaseRun) => run.wire?.statuses.at(-1)?.phase;
const questions = (run: CaseRun) => (JSON.parse(run.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
/** The reply filing the pile's one document (b11-proposals' `filingOf`). */
const filingOf = (frame: Record<string, unknown>) => {
  const piles = frame.piles as Array<{ pileId: string; things: Array<{ fileId: string }> }>;
  return { ...empty, things: piles.flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: HUNT, name: DOC.name,
    note: { name: 'Wrenwick offer.md', summary: 'Wrenwick offers Alex remote work.', body: 'Wrenwick offers Alex remote work.' } })) };
};
const errors = () => vi.mocked(console.error).mock.calls.flatMap((args) => args.map(String));
/** Each refusal of the run as [kind, reason], from the provider's first-attempt log line (b11-proposals' `refused`). */
const refused = () => errors().flatMap((line) => { const m = /was refused \((\w+)\): (.*); asking once more/.exec(line); return m ? [[m[1], m[2]]] : []; });
const drops = () => errors().flatMap((line) => { const m = /drops a (pile|request) \((\w+)\): (.*); it waits for the next tidy-up/.exec(line); return m ? [{ what: m[1] ?? '', kind: m[2] ?? '', why: m[3] ?? '' }] : []; });
/** The run's last log line: the plan refused after the retry and any drops. */
const finalLine = () => errors().filter((line) => line.includes(' is refused: ')).at(-1) ?? 'no final line';
type Row = { name: string; why: string };
const reportOf = (run: CaseRun) => (run.lastRun as { run?: { report?: { setAside?: Row[]; leftAsWritten?: Row[] } } } | null)?.run?.report;
const manifestText = (run: CaseRun): string | undefined => Object.entries(run.after).find(([p]) => p.includes('/qa9-run-1/manifest-'))?.[1];
const manifestOf = (run: CaseRun) => { const text = manifestText(run); return text === undefined ? undefined : JSON.parse(text) as { waiting?: Row[] }; };
const inInbox = (run: CaseRun) => Object.values(run.pathsById).some((p) => p.startsWith('Inbox/') && p.endsWith(`/${DOC.name}`));

/** Both replies file the offer and carry the given views for the request: only the request waits, the offer is filed. */
async function expectRequestWaits(files: Record<string, string>, views: (f: Folder, request: string) => unknown[] | Promise<unknown[]>, kind: RefusalKind) {
  const f = await folder(files);
  const run = await press(f, async (ctx) => ({ ...filingOf(ctx.frame), views: await views(f, ctx.request) }));
  expect(refused().map(([k]) => k), 'the first attempt is refused for the view').toEqual([kind]);
  expect(phase(run)).toBe('done');
  expect(inInbox(run), 'the offer left the Inbox').toBe(false);
  expect(Object.values(run.pathsById), 'the offer is filed').toContain(`${HUNT}/${DOC.name}`);
  expect(run.after[`${SYSTEM.changes}/press-1.json`], 'the request is still journaled').toBeDefined();
  expect(run.after[`${SYSTEM.archive}/press-1.json`], 'the request is not archived').toBeUndefined();
  expect(SET_ASIDE.notTidied).toBe(WAITS);
  expect(reportOf(run)?.setAside).toEqual([{ name: WORDS, why: WAITS }]);
  expect(manifestOf(run)?.waiting).toEqual([{ name: WORDS, why: WAITS }]);
  expect([...reportOf(run)?.setAside ?? [], ...reportOf(run)?.leftAsWritten ?? []].filter((r) => r.why === NOTHING_FOUND_WHY), 'no nothing-found row').toEqual([]);
  expect(drops()).toEqual([{ what: 'request', kind, why: REFUSALS[kind] }]);
  expect(questions(run).filter((q) => q.proposal), 'no suggestion is asked').toEqual([]);
  // Filing the offer lists it on the map; the front matter, where views are declared, is untouched.
  expect(run.after[MAP]?.split('<!--')[0], 'the map declares no view').toBe(map().split('<!--')[0]);
  for (const [path, text] of Object.entries(files)) expect(run.after[path], `${path} is byte-identical`).toBe(text);
  expect(run.calls.filter((c) => c === 'execution')).toHaveLength(2);
}

describe('qa-prod-9-F1: a refused view holds only its request; the rest of the tidy-up is filed', () => {
  it('AC1 qa9-view-grammar-holds-request: a measure over a property the type does not declare waits the request and files the offer', async () => {
    await expectRequestWaits({}, (f, request) => [proposing(f, request, { ...DEADLINES, measures: [{ id: 'd', label: 'D', op: 'earliest', property: 'start' }] })], 'viewKeys');
    expect(refused()).toEqual([['viewKeys', 'a view the grammar refuses: The view uses a property the type does not declare.']]);
  });
  it('AC2 qa9-view-binding-holds-request: a view homed on a person\'s map waits the request and files the offer', async () => {
    await expectRequestWaits({ [IDEAS]: map('') }, async (f, request) => [{ ...proposing(f, request), home: { kind: 'moc', fileId: await f.id(IDEAS) } }], 'viewBinding');
  });
  it('AC3 qa9-view-shape-holds-request: a view row with a key outside the shape waits the request and files the offer', async () => {
    await expectRequestWaits({}, (f, request) => [proposing(f, request, DEADLINES, { ...ASK, extra: 1 })], 'viewKeys');
  });
  it('AC4 qa9-view-limit-holds-request: the same view twice in one map waits the request and files the offer', async () => {
    await expectRequestWaits({}, (f, request) => [proposing(f, request), proposing(f, request)], 'viewLimit');
  });
  it('AC5 qa9-view-unknown-request-fails (guard): a view naming a request the run does not know refuses the whole reply, with nothing changed', async () => {
    const f = await folder();
    const run = await press(f, (ctx) => ({ ...filingOf(ctx.frame), views: [{ ...proposing(f, ctx.request), requestId: '$note:Projects/Job hunt/Past offer.md' }] }));
    expect(refused().map(([k]) => k), 'the first attempt is refused for the view').toEqual(['viewBinding']);
    expect(phase(run)).toBe('failed');
    expect(run.code).toBe(1);
    expect(manifestText(run), 'no manifest').toBeUndefined();
    expect(inInbox(run), 'the offer stays in the Inbox').toBe(true);
    for (const [path, text] of Object.entries(f.c.folder)) if (!path.startsWith('.bower/')) expect(run.after[path], `${path} is unchanged`).toBe(text);
    expect(drops(), 'a failed run logs no drop').toEqual([]);
    const line = finalLine();
    expect(line.endsWith('(viewBinding; names no pile or request)'), `${line} ends with (viewBinding; names no pile or request)`).toBe(true);
  });
});
