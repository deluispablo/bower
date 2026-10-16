/** audit-runner-refusals: a refused write never leaves a run stuck or reported wrongly (harness from b11-figures.test.ts). */
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { driveEffects } from '../../src/data/spine/engine';
import { runTidy } from '../src/main';
import { providerFor } from '../src/provider';

const DAY = Date.UTC(2026, 9, 7, 9);
const HUNT = 'Projects/Job hunt';
const MAP = `${HUNT}/Job hunt.md`;
const TABLE = { v: 1, rows: [
  { id: 'offer', match: ['job offer'], template: 'source', properties: { skills: { type: 'list' }, deadline: { type: 'date' } }, table: ['skills'] },
  { id: 'receipt', match: ['receipt'], template: 'source', properties: { amount: { type: 'money' }, spent_on: { type: 'date' },
    category: { type: 'enum', values: ['garden', 'kitchen'] } }, table: ['amount', 'spent_on', 'category'] }] };
const SKILLS = { v: 1, id: 'active-offer-skills', kind: 'aggregate', title: 'Skills most active offers ask for',
  set: { type: 'offer', folderId: '$folder', recursive: true, where: { op: 'eq', property: 'status', value: 'active' } },
  groupBy: [], measures: [{ id: 'skills', label: 'Offers', op: 'top', property: 'skills', limit: 3 }] };

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
const OFFERS = {
  [`${HUNT}/Ferrowick offer.md`]: offer('Ferrowick', 'active', '[TypeScript, SQL, SQL]'),
  [`${HUNT}/Mallowick offer.md`]: offer('Mallowick', 'active', '["TypeScript","SQL","dbt"]'),
  [`${HUNT}/Lindenwick offer.md`]: offer('Lindenwick', 'active'),
  [`${HUNT}/Past offer.md`]: offer('Past', 'closed', '[Rust]'),
};

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
const retrieval = (run: CaseRun) => JSON.parse(run.after[SYSTEM.retrieval] ?? '{}') as { views?: Record<string, Record<string, unknown>> };

describe('audit-runner-refusals', () => {
  it('AC1 audit-runner-refusals-map-refused: a map the person edits during the run keeps their edit, and the run reaches done', async () => {
    const f = await folder({ [MAP]: map('Job hunt', [SKILLS]), ...OFFERS }, { [MAP]: HUNT });
    const mapId = await f.id(MAP);
    let edited = false;
    // Alex saves the map while Bower works (during the model call), after Bower read it and before maintain writes it.
    const run = await press(f, async () => {
      edited = true;
      await f.drive.writeText(mapId, `${await f.drive.readText(mapId)}Alex added this line during the run.\n`, (await f.drive.get(mapId)).modifiedTime);
      return { kind: 'tidy-intent', v: 1, things: [] };
    });
    expect(edited, 'Alex edited while Bower worked').toBe(true);
    expect(run.after[MAP]).toContain('Alex added this line during the run.');
    expect(retrieval(run).views?.[`${mapId}/active-offer-skills`], 'no record for figures that were not written').toBeUndefined();
    expect(phase(run), 'a refused map write fails no run').toBe('done');
  });

  it('AC2 audit-runner-refusals-plan-refused: a planned manifest the engine refuses before any write reports the ordinary failure', async () => {
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
    const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
    await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
    const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => DAY, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
    const wire = driveV3(drive);
    wire.folderId = root;
    wire.manifest = admitted.manifest;
    wire.now = Date.now();
    let ids = 0;
    // The plan names another run: the engine refuses it before writing anything (spine/engine.ts runOperations).
    const end = await runTidy({ api: API, runId: RUN_ID, ticket: TICKET, attempt: 1, fetch: wire.fetch, pacing: { baseMs: 0 },
      provider: (d, rootId) => {
        const scripted = providerFor('scripted', d, { rootId, runId: RUN_ID, allowWeb: false });
        return async (took) => ({ ...await scripted(took), runId: 'another-run' });
      },
      effects: (d) => driveEffects(d), clock: () => DAY, newId: () => `id-${++ids}` });
    expect(end.phase).toBe('failed');
    expect(wire.requests.filter((r) => r.method !== 'GET'), 'nothing was written').toEqual([]);
    expect(wire.statuses.at(-1)).toMatchObject({ phase: 'failed', failure: B_FAILURE });
  });
});
