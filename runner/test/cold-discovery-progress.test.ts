/** Cold discovery keeps its reading progress across runs (B12 open question 1, B11 open question 3), through production main. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { RUNNER_WRITES, SYSTEM, type RetrievalFile } from '../../src/data/vault/layout';
import { FOLDER_TEMPLATE } from '../../src/data/contracts/folder-template';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase } from '../src/corpus';
import { RunnerDrive } from '../src/drive';
import { HEALTH_NAME } from '../src/lint';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { empty, fileIntent, folder, note, phaseAwareClaude, reply, report, run, select, setup, type Base } from './b1-planning-support';
import { AT, redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import * as transport from './drive-v3';

const pageSize = transport.paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); transport.paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); transport.paging.size = pageSize; });

/** A never-warm folder of 204 notes needs at most this many runs to reach the model (R5). */
const BOUND = 2;
const record = (i: number): string => `Archive/Record ${String(i).padStart(3, '0')}.md`;
const archive = (n: number, from = 0): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, k) =>
  [record(from + k), note(`Alex keeps record ${from + k}.`, `Record ${from + k} evidence.\n`)]));
const MAP = 'Archive/Archive.md';
const MAP_TEXT = '---\nby: bower\ntype: moc\nsummary: Alex keeps old records here.\n---\n\n# Archive\n\n- [[Record 000]]\n- [[Record 001]]\n- [[Record 203]]\n';
const LOOKALIKE = 'Archive/Lookalike.md';
const LOOKALIKE_TEXT = '---\nsummary: Alex writes about front matter.\n---\n\nAlex pasted this block:\n---\nby: bower\ntype: moc\nsummary: Not the real summary.\n---\n';
const edit = async (b: Base, id: string, text: string): Promise<void> => { await b.drive.writeText(id, text, (await b.drive.get(id)).modifiedTime); };
/** Bower's report files every new folder starts with, so the run's own writes are the only ones (FOLDER_TEMPLATE). */
const reports = Object.fromEntries(FOLDER_TEMPLATE.filter((f) => f.path.startsWith(`${SYSTEM.dir}/`) && f.path.endsWith('.json') && f.path !== SYSTEM.questions)
  .map((f) => [f.path, f.content]));
const cold = (n = 204, extra: Record<string, string> = {}): Promise<Base> => setup({ folder: { ...folder, ...reports, ...archive(n), ...extra } });

/** Each press is asked for a moment after the last, as `runOnDrive`'s own admissions are, so its report may follow. */
const feedOnly = (b: Base, press: number): AdmissionManifest => ({ v: 1, id: `feed-only-${press}`, rootId: b.root, scope: 'all', at: AT + press - 1, piles: [], journal: [] });
async function admitted(b: Base, press: number): Promise<AdmissionManifest> {
  const a = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + press - 1, newId: () => `cold-${press}` });
  return a.kind === 'manifest' ? a.manifest : feedOnly(b, press);
}
type Around = (fetch: typeof globalThis.fetch) => typeof globalThis.fetch;
type Result = Awaited<ReturnType<typeof run>>;
/** One press with the inbox pile: the model, when reached, files it under the job hunt; `turns` counts its calls so far. */
async function press(b: Base, n: number, around?: Around, turns = { count: 0 }): Promise<Result> {
  const values: unknown[] = [];
  return run(b, values, { press: n, admission: await admitted(b, n), ...(around ? { around } : {}), beforeReply: async (turn, frame) => {
    turns.count = turn;
    values[turn - 1] = frame.value.selection === undefined ? select(b) : fileIntent(b);
  } });
}
/** A run with nothing admitted: maintenance only. */
async function idle(b: Base, n: number, around?: Around): Promise<Result> {
  const values: unknown[] = [];
  return run(b, values, { press: n, admission: feedOnly(b, n), ...(around ? { around } : {}), beforeReply: async (turn, frame) => {
    values[turn - 1] = frame.value.selection === undefined ? { items: [], asks: [] } : empty;
  } });
}
const stateOf = (r: CaseRun): RetrievalFile | null => JSON.parse(r.after[SYSTEM.retrieval] ?? 'null') as RetrievalFile | null;
const known = (r: CaseRun): string[] => Object.keys(stateOf(r)?.files ?? {});
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
/** Ids whose 4,096-byte prefix this run fetched. */
const prefixed = (r: Result): string[] => r.traffic.filter((t) => t.method === 'GET' && t.range && t.url.searchParams.get('alt') === 'media')
  .map((t) => t.url.pathname.split('/').at(-1) ?? '');
const personFiles = (r: CaseRun): Record<string, string> => Object.fromEntries(Object.entries(r.after).filter(([path]) => !path.startsWith('.bower/')));
/** Every file's text by path, as the folder holds it now. */
const contents = async (b: Base): Promise<Record<string, string>> => Object.fromEntries(await Promise.all((await b.drive.listAll(b.root))
  .filter((f) => !f.folder).map(async (f) => [b.drive.pathOf(f.id, b.root), await b.drive.readText(f.id)] as const)));
/** A held run's one write is the retrieval state: no other runner file, no log, no health note, no person file (R7, R10). */
const onlyProgress = (r: CaseRun, seeded: Record<string, string>): void => {
  for (const path of RUNNER_WRITES.filter((p) => p !== SYSTEM.retrieval)) expect(r.after[path], `${path} is neither written nor created`).toBe(seeded[path]);
  expect(Object.keys(r.after).filter((p) => p.startsWith('.bower/log')), 'no log').toEqual([]);
  expect(r.after[HEALTH_NAME], 'no health note from a partial view').toBeUndefined();
  expect(personFiles(r), 'every person file and the pile stay byte-identical').toEqual(personFiles({ ...r, after: seeded }));
};
const sameNotes = (a: CaseRun, b: CaseRun): void => {
  const strip = (s: RetrievalFile | null) => Object.fromEntries(Object.entries(s?.files ?? {}).map(([id, n]) => [id, { ...n, version: undefined }]));
  expect(strip(stateOf(a))).toEqual(strip(stateOf(b)));
};
/** The retrieval files on the folder by name, live or not yet listed by path (a second create would show two). */
const retrievalFiles = async (b: Base): Promise<number> => (await b.drive.listAll(b.root)).filter((f) => f.name === 'retrieval.json').length;
/** Ids whose prefix discovery or maintenance asks for, inside maintenance's ledger (never the provider's link reads). */
function maintenanceReads() {
  const context = new AsyncLocalStorage<boolean>();
  const ids = new Set<string>();
  const maintenance = RunTiming.prototype.maintenance;
  const prefix = RunnerDrive.prototype.readPrefix;
  const spies = [
    vi.spyOn(RunTiming.prototype, 'maintenance').mockImplementation(function<T>(this: RunTiming, task: () => Promise<T>, items?: number): Promise<T> {
      return context.run(true, () => maintenance.call(this, task, items)) as Promise<T>;
    }),
    vi.spyOn(RunnerDrive.prototype, 'readPrefix').mockImplementation(function(this: RunnerDrive, file, cold) {
      if (context.getStore()) ids.add(file.id);
      return prefix.call(this, file, cold);
    }),
  ];
  return { ids, stop: () => { for (const spy of spies) spy.mockRestore(); context.disable(); } };
}
/** Every maintenance send and refusal, observed beside the production meter. */
function ledgerProbe() {
  let refused = 0;
  const meter = RunTiming.prototype.meter;
  const spy = vi.spyOn(RunTiming.prototype, 'meter').mockImplementation(function(this: RunTiming, fetch) {
    const measured = meter.call(this, fetch);
    return async (input, init) => {
      try { return await measured(input, init); } catch (error) { if (error instanceof LedgerExhausted) refused++; throw error; }
    };
  });
  return { get refused() { return refused; }, stop: () => spy.mockRestore() };
}

describe('cold discovery keeps its reading progress', () => {
  it('AC1 cold-discovery-progress-held: a cold run over 204 notes keeps what it read and holds the model', async () => {
    const b = await cold();
    const seeded = await contents(b);
    const first = await press(b, 1);
    const state = stateOf(first);
    expect(state, 'the held run keeps its reading progress in the one retrieval state').not.toBeNull();
    const count = known(first).length;
    expect(count, 'some notes are read').toBeGreaterThan(0);
    expect(count, 'not every note fits one cold run').toBeLessThan(204);
    const listed = new Map((await b.drive.listAll(b.root)).map((f) => [f.id, f.modifiedTime]));
    for (const [id, entry] of Object.entries(state?.files ?? {})) expect(entry.version, 'each entry is keyed by its read version').toBe(listed.get(id));
    expect(first.frames, 'no model call while discovery is unfinished').toHaveLength(0);
    expect(first.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(Object.keys(first.after).filter((p) => p.startsWith('Inbox/') && p.endsWith('Offer.txt')), 'the pile waits in the inbox').toHaveLength(1);
    expect(personFiles(first), 'every person file is byte-identical').toEqual(personFiles({ ...first, after: seeded }));
  });

  it('AC1 cold-discovery-progress-continues: the next run reads only notes it does not know yet', async () => {
    const b = await cold();
    const first = await press(b, 1);
    const before = new Set(known(first));
    expect(before.size, 'the first run kept its progress').toBeGreaterThan(0);
    const second = await press(b, 2);
    expect(prefixed(second).filter((id) => before.has(id)), 'no note read before is fetched again').toEqual([]);
    expect(known(second).length, 'progress grows').toBeGreaterThan(before.size);
    for (const id of before) expect(known(second), 'progress is never lost').toContain(id);
  });

  it(`AC1 cold-discovery-progress-reaches-model: a never-warm folder of 204 notes reaches the model within ${BOUND} runs and files the pile`, async () => {
    const b = await cold();
    let last: Result | undefined;
    let runs = 0;
    while (runs < BOUND && !last?.frames.length) last = await press(b, ++runs);
    expect(last?.frames.length, `the model is reached within ${BOUND} runs`).toBe(2);
    expect(report(last as Result).filed, 'the pile is filed on that run').toHaveLength(1);
    // The selection index is cut at 32,000 characters by design, so discovery is judged by the retrieval state (ruling).
    expect(last?.frames[0]?.value.selection, 'a selection frame reaches the model').toBeUndefined();
    const records = (await b.drive.listAll(b.root)).filter((f) => f.name.startsWith('Record ')).map((f) => f.id);
    expect(records).toHaveLength(204);
    for (const id of records) expect(known(last as Result), 'the model is reached with every note discovered').toContain(id);
    expect(last?.after[SYSTEM.index], 'the completing run writes the index').toContain('[[Record 203]]');
    expect(last?.after[HEALTH_NAME], 'and the health note').toBeDefined();
  });

  it(`AC1 cold-discovery-progress-stale-question: a folder over the ledger with an open question whose thing left the inbox still reaches the model within ${BOUND} runs`, async () => {
    const b = await cold();
    const questions = (await b.drive.listAll(b.root)).find((f) => f.name === 'questions.json')?.id ?? '';
    // The question's thing left the inbox: a plan with nothing taken would still close it (R7, R21).
    await edit(b, questions, `${JSON.stringify({ v: 1, questions: [{ id: 'q-stale', text: 'Where does the old offer go?', yes: 'Projects', no: 'Leave it',
      askedAt: AT - 60_000, subject: 'GONE_FILE_ID' }] })}\n`);
    const held: Result[] = [];
    let last: Result | undefined;
    for (let n = 1; n <= BOUND && !last?.frames.length; n++) held.push(last = await press(b, n));
    expect(stateOf(held[0] as Result), 'the held run keeps its reading progress despite the stale question').not.toBeNull();
    expect(held[0]?.after[SYSTEM.questions], 'a held run leaves the questions as they were').toContain('q-stale');
    expect(last?.frames.length, `the model is reached within ${BOUND} runs`).toBe(2);
    expect(report(last as Result).filed, 'the pile is filed on that run').toHaveLength(1);
  });

  it('AC1 cold-discovery-progress-each-once: across the runs each note prefix is fetched exactly once', async () => {
    const b = await cold();
    const ids = new Set((await b.drive.listAll(b.root)).filter((f) => f.name.startsWith('Record ')).map((f) => f.id));
    const fetched: string[] = [];
    let last: Result | undefined;
    for (let n = 1; n <= BOUND && !last?.frames.length; n++) {
      last = await press(b, n);
      fetched.push(...prefixed(last).filter((id) => ids.has(id)));
    }
    expect(last?.frames.length, 'discovery completed').toBe(2);
    expect(fetched.length, 'one prefix read per note, never repeated').toBe(ids.size);
    expect(new Set(fetched).size).toBe(ids.size);
  });

  it('AC2 cold-discovery-progress-equivalent: index, hot, health and retrieval after a discovery in parts equal one unlimited run', async () => {
    const extra = { [MAP]: MAP_TEXT, [LOOKALIKE]: LOOKALIKE_TEXT };
    const oracleBase = await cold(204, extra);
    const lifted = vi.spyOn(RunTiming.prototype, 'meter').mockImplementation((fetch) => fetch);
    const oracle = await idle(oracleBase, 1);
    lifted.mockRestore();
    expect(oracle.after[SYSTEM.index], 'the unlimited oracle discovers in one run, the map standing for its folder').toMatch(/\[\[Archive\]\] \(\d+\)/);
    const b = await cold(204, extra);
    let last: Result | undefined;
    for (let n = 1; n <= BOUND && !last?.after[SYSTEM.index]; n++) last = await idle(b, n);
    expect(last?.after[SYSTEM.index], `discovery in parts completes within ${BOUND} runs`).toBeDefined();
    expect(last?.after[SYSTEM.index], 'the same index').toBe(oracle.after[SYSTEM.index]);
    expect(last?.after[SYSTEM.hot], 'the same hot context: every note counts as new until discovery completes once').toBe(oracle.after[SYSTEM.hot]);
    expect(last?.after[HEALTH_NAME], 'the same health note (no orphan from a partial graph)').toBe(oracle.after[HEALTH_NAME]);
    sameNotes(last as Result, oracle);
    const lookalike = Object.values(stateOf(last as Result)?.files ?? {}).find((n) => n.path === LOOKALIKE);
    expect(lookalike?.summary, 'body text that looks like front matter is never a value').toBe('Alex writes about front matter.');
  });

  it('AC2 cold-discovery-progress-changed-since: an edit, a Bin, a rename and a new note between runs are all honoured', async () => {
    const b = await cold();
    const first = await idle(b, 1);
    const read = known(first).map((id) => first.pathsById[id] ?? '').filter((p) => p.startsWith('Archive/Record ')).sort();
    expect(read.length, 'the first run kept progress').toBeGreaterThan(3);
    const [edited, binned, renamed] = [read[0] ?? '', read[1] ?? '', read[2] ?? ''];
    await edit(b, b.id(edited), note('Alex rewrote this record.', 'New evidence.\n'));
    await b.drive.trash(b.id(binned));
    await b.drive.update(b.id(renamed), { name: 'Renamed record.md' });
    await b.drive.createText(b.id('Archive'), 'Late record.md', note('Alex added a late record.'));
    let last: Result | undefined;
    for (let n = 2; n <= BOUND + 1 && !last?.after[SYSTEM.index]; n++) last = await idle(b, n);
    const index = last?.after[SYSTEM.index] ?? '';
    expect(index, 'an edited note is read again').toContain('Alex rewrote this record.');
    expect(index, 'a binned note is gone').not.toContain(`[[${binned.split('/').at(-1)?.replace(/\.md$/, '')}]]`);
    expect(index, 'a renamed note keeps its entry under its new name').toContain('[[Renamed record]]');
    expect(index, 'a note added between runs is discovered').toContain('[[Late record]]');
  });

  it('AC2 cold-discovery-progress-person-edit: a note the person edits during a held run is read again next run', async () => {
    const b = await cold();
    let target = '';
    let edited = false;
    const first = await idle(b, 1, (next) => async (input, init) => {
      const response = await next(input, init);
      const u = url(input);
      if (!edited && new Headers(init?.headers).get('Range') && u.searchParams.get('alt') === 'media') {
        target = u.pathname.split('/').at(-1) ?? '';
        edited = true;
        await edit(b, target, note('Alex changed this during the run.'));
      }
      return response;
    });
    expect(edited, 'a prefix was read').toBe(true);
    expect(known(first), 'the held run kept progress').toContain(target);
    let last: Result | undefined;
    for (let n = 2; n <= BOUND + 1 && !last?.after[SYSTEM.index]; n++) last = await idle(b, n);
    expect(stateOf(last as Result)?.files[target]?.summary, 'the person\'s change is read, never the stale version').toBe('Alex changed this during the run.');
  });

  it('AC3 cold-discovery-progress-only-progress: a held run writes only the retrieval state; questions, requests and the pile stay', async () => {
    const b = await cold();
    const changes = b.id(SYSTEM.changes);
    await b.drive.createText(changes, 'ask-1.json', JSON.stringify({ v: 1, id: 'ask-1', device: 'device-1', at: AT, kind: 'request',
      what: 'Asked Bower: "Keep my records tidy."', text: 'Keep my records tidy.' }));
    const seeded = await contents(b);
    const first = await press(b, 1);
    expect(stateOf(first), 'progress is kept').not.toBeNull();
    expect(first.frames, 'no model call').toHaveLength(0);
    onlyProgress(first, seeded);
    expect(first.after[`${SYSTEM.changes}/ask-1.json`], 'the request waits unarchived').toBeDefined();
  });

  it('AC3 cold-discovery-progress-warm-keeps: a warm folder given 400 notes at once keeps its stored state and cursor while it reads them', async () => {
    const b = await cold(10);
    const warm = await press(b, 1);
    expect(warm.frames, 'the small folder completes in one run').toHaveLength(2);
    const stored = stateOf(warm);
    expect(stored?.health, 'the warm state names its health note').toBeTruthy();
    expect((stored as { listing?: unknown } | null)?.listing, 'a complete run keeps its listing').toBeDefined();
    // The person damages the stored listing: it is dropped as today (ruling 3), and the progress is still kept.
    await edit(b, (await b.drive.listAll(b.root)).find((f) => f.name === 'retrieval.json')?.id ?? '', JSON.stringify({ ...stored, listing: [{ id: 42 }] }));
    const archiveId = b.id('Archive');
    for (let i = 100; i < 500; i++) await b.drive.createText(archiveId, `Record ${i}.md`, note(`Alex keeps record ${i}.`));
    const held = await idle(b, 2);
    const state = stateOf(held);
    expect(known(held).length, 'the held run keeps new progress').toBeGreaterThan(Object.keys(stored?.files ?? {}).length);
    expect(known(held).length, 'not all 400 fit one run').toBeLessThan(Object.keys(stored?.files ?? {}).length + 400);
    expect(state?.health, 'the stored health id is kept').toBe(stored?.health);
    expect(state?.cursor, 'the cursor waits until discovery completes, so no change is skipped').toBe(stored?.cursor);
    expect((state as { listing?: unknown } | null)?.listing, 'the malformed listing is dropped, as today').toBeUndefined();
    expect({ ...state, files: {} }, 'every other stored key is kept as read').toEqual({ ...stored, listing: undefined, files: {} });
    for (const [id, entry] of Object.entries(stored?.files ?? {})) expect(state?.files[id], 'every earlier entry is kept exactly').toEqual(entry);
    expect(held.after[SYSTEM.index], 'the index is not rewritten from a partial view').toBe(warm.after[SYSTEM.index]);
  });

  it('AC3 cold-discovery-progress-exhausted-later: a run that meets the ledger after its discovery completed keeps every note it read; the next run reads no other prefix', async () => {
    const b = await cold(40);
    const refused = b.id(record(5));
    const seeded = await contents(b);
    const turns = { count: 0 };
    let atExhaustion = -1;
    let reads = 0;
    const first = await press(b, 1, (next) => async (input, init) => {
      const u = url(input);
      if (u.pathname === `/drive/v3/files/${refused}` && u.searchParams.get('alt') === 'media' && new Headers(init?.headers).get('Range')) {
        reads++;
        // Discovery's read is refused, so the note owes its check; maintenance's read of it then meets the ledger.
        if (reads === 1) return new Response(JSON.stringify({ error: { code: 403, message: 'Made-up refused read', errors: [{ reason: 'forbidden' }] } }), { status: 403 });
        if (reads === 2) { atExhaustion = turns.count; throw new LedgerExhausted(0); }
      }
      return next(input, init);
    }, turns);
    expect(reads, 'maintenance came to the owed read after discovery').toBe(2);
    expect(first.frames.length, 'no model call follows the exhaustion (ruling 1)').toBe(atExhaustion);
    onlyProgress(first, seeded);
    expect(Object.keys(first.after).filter((p) => p.startsWith('Inbox/') && p.endsWith('Offer.txt')), 'the pile waits').toHaveLength(1);
    expect(known(first).length, 'the run keeps every note it read').toBeGreaterThanOrEqual(43);
    const asked = maintenanceReads();
    const second = await press(b, 2).finally(() => asked.stop());
    // The provider's link reads of matched notes (claude.ts) are no discovery read, and are not counted (ruling).
    expect(asked.ids.has(refused), 'the probe sees the refused note read again inside the ledger').toBe(true);
    expect(prefixed(second).filter((id) => id !== refused && asked.ids.has(id)), 'the next run\'s discovery reads no other prefix again').toEqual([]);
    expect(report(second).filed).toHaveLength(1);
  });

  it('AC4 cold-discovery-progress-crash-before-write: a crash before the progress write ends with one retrieval state on redispatch', async () => {
    const b = await cold();
    const state = { reached: false };
    const first = await idle(b, 1, (next) => async (input, init) => {
      if (state.reached && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'POST' && url(input).pathname === '/upload/drive/v3/files' && (await new Response(init.body).text()).includes('"retrieval.json"')) {
        state.reached = true;
        throw new TypeError('Made-up crash before the progress write.');
      }
      return next(input, init);
    });
    expect(state.reached, 'main came to the progress write').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A held run never calls a model.'); });
    const resumed = await redispatchCase(b.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(await retrievalFiles(b), 'one retrieval state').toBe(1);
    expect(known(resumed).length, 'with the progress').toBeGreaterThan(0);
    expect(model).not.toHaveBeenCalled();
  });

  it('AC4 cold-discovery-progress-ack-lost: a lost answer after the progress write ends with one retrieval state on redispatch', async () => {
    const b = await cold();
    let crashed = false;
    const first = await idle(b, 1, (next) => async (input, init) => {
      if (crashed && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (init?.method === 'POST' && url(input).pathname === '/upload/drive/v3/files' && (await new Response(init.body).clone().text()).includes('"retrieval.json"')) {
        const response = await next(input, init);
        crashed = response.ok;
        throw new TypeError('Made-up lost answer after the progress write.');
      }
      return next(input, init);
    });
    expect(crashed, 'the progress write landed').toBe(true);
    const resumed = await redispatchCase(b.c, first, 2, { pacing: { baseMs: 0, sleep: async () => {} } });
    expect(await retrievalFiles(b), 'one retrieval state, never a second create').toBe(1);
    expect(known(resumed).length).toBeGreaterThan(0);
  });

  it('AC5 cold-discovery-progress-fits-one-run (guard): a cold folder that fits one run reaches the model at once', async () => {
    const b = await cold(40);
    const first = await press(b, 1);
    expect(first.frames, 'selection and execution in the first run').toHaveLength(2);
    expect(report(first).filed).toHaveLength(1);
    expect(first.after[SYSTEM.index]).toContain('[[Record 039]]');
  });

  it('AC5 cold-discovery-progress-idle-continues: runs with nothing admitted continue discovery; once complete an idle run changes no note entry', async () => {
    const b = await cold();
    const sizes: number[] = [];
    let last: Result | undefined;
    for (let n = 1; n <= BOUND && !last?.after[SYSTEM.index]; n++) {
      last = await idle(b, n);
      sizes.push(known(last).length);
    }
    expect(sizes[0], 'an idle run keeps progress too').toBeGreaterThan(0);
    expect(last?.after[SYSTEM.index], 'idle runs complete discovery').toContain('[[Record 203]]');
    const after = await idle(b, BOUND + 1);
    expect(stateOf(after)?.files, 'a later idle run reads nothing new').toEqual(stateOf(last as Result)?.files);
    expect(prefixed(after), 'and fetches no prefix').toEqual([]);
  });

  it('AC6 cold-discovery-progress-ledger: reads use the whole maintenance ledger until it refuses, and the progress write still lands outside it', async () => {
    const b = await cold();
    const probe = ledgerProbe();
    try {
      const first = await press(b, 1);
      expect(probe.refused, 'the ledger, not a second budget, ends the reads').toBeGreaterThan(0);
      expect(stateOf(first), 'the progress write lands after the ledger is spent').not.toBeNull();
      expect(known(first).length, 'a cold run keeps what today\'s ledger reads (two calls a note)').toBeGreaterThanOrEqual(120);
    } finally { probe.stop(); }
  });

  it('AC7 cold-discovery-progress-large-case: c17-b12-large-first-part, seeded cold, reaches the model with all 201 notes and files its notice', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b12-large-first-part'));
    const drive = transport.fixedDrive();
    const root = await seedCase(drive, c);
    const gardening = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Gardening')?.id ?? '';
    let reached: { filed: number; after: Record<string, string> } | undefined;
    for (let n = 1; n <= BOUND && !reached; n++) {
      const a = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT + n, newId: () => `large-${n}` });
      if (a.kind !== 'manifest') throw new Error(`Not admitted: ${a.cause}`);
      let selected = false;
      const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
        const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { sources?: Array<{ itemId: string }>;
          piles?: Array<{ things: Array<{ fileId: string; name: string }> }> };
        if (phase === 'selection') {
          selected = true;
          return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: gardening, wants: [] })), asks: [] });
        }
        return reply({ ...empty, things: (frame.piles ?? []).flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: 'Resources/Gardening', name: t.name,
          note: { name: t.name.replace(/\.[^.]+$/, '.md'), summary: 'Alex has a garden notice.', body: 'Alex has a garden notice.' } })) });
      }, () => ({ drive, root, admission: a.manifest }), true);
      const r = await runOnDrive(c, drive, root, { claude: spawn, admission: a.manifest, pacing: { baseMs: 0, sleep: async () => {} },
        answerStart: { scope: 'all', requestId: `large-run-${n}` } }, n);
      if (selected) reached = { filed: report(r as Result).filed.length, after: r.after };
      else expect(Object.keys(r.after).some((p) => p.startsWith('Inbox/') && p.endsWith('Garden notice.txt')), 'a held run leaves the notice in the inbox').toBe(true);
    }
    expect(reached, `the large case reaches the model within ${BOUND} runs`).toBeDefined();
    // The selection index is cut at 32,000 characters by design (seeing all 201 is B12), so discovery is judged by the
    // retrieval state the reaching run writes (ruling).
    const readings = (await drive.listAll(root)).filter((f) => !f.folder && /^Reading \d{3}\.md$/.test(f.name)).map((f) => f.id);
    expect(readings).toHaveLength(201);
    const files = (JSON.parse(reached?.after[SYSTEM.retrieval] ?? 'null') as RetrievalFile | null)?.files ?? {};
    for (const id of readings) expect(Object.keys(files), 'the model is reached with every Reading note discovered').toContain(id);
    expect(reached?.filed, 'the notice is filed').toBe(1);
    expect(Object.keys(reached?.after ?? {}).some((p) => p.startsWith('Resources/Gardening/') && p.endsWith('Garden notice.txt'))).toBe(true);
  });
});
