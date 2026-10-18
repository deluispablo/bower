/**
 * c12-warm-start (specs/c12-lifecycle/plan-admit-words-warm.md H1-H5, plan-warm-start-r1.md WS1-WS13): a press whose
 * discovery the ledger ends plans on what it knows: unread notes are cards marked `unread` and the folders line says they
 * are not fully read (a no-proof-of-fit rule), the pile is filed, and the plan adds the reading progress and the log, both
 * outside the ledger (R13). Index, health and hot wait for the press that completes discovery. Through production main.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { FOLDER_TEMPLATE } from '../../src/data/contracts/folder-template';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM, type RetrievalFile } from '../../src/data/vault/layout';
import { HEALTH_NAME } from '../src/lint';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { empty, folder, HUB, note, run, seedState, setup, type Base, type Frame } from './b1-planning-support';
import type { ClaudeSpawn } from '../src/claude';
import { AT, redispatchCase, type CaseRun } from './corpus-run';
import * as transport from './drive-v3';

// The budget is 2 things here (c12-admit's own way), so a third pile waits whole.
vi.mock('../src/timing', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/timing')>()), ADMIT_THINGS: 2 }));

const pageSize = transport.paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); transport.paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); transport.paging.size = pageSize; });

const UNREAD = '> folders not fully read: no match does not mean no destination.';
const CUT = '> folders cut: no match does not mean no destination.';
const MONTH = '.bower/log/2026-10.md';
const record = (i: number): string => `Archive/Record ${String(i).padStart(3, '0')}.md`;
const archive = (n: number): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, k) =>
  [record(k), note(`Alex keeps record ${k}.`, `Record ${k} evidence.\n`)]));
/** Bower's report files every new folder starts with, so the run's own writes are the only ones. */
const reports = Object.fromEntries(FOLDER_TEMPLATE.filter((f) => f.path.startsWith(`${SYSTEM.dir}/`) && f.path.endsWith('.json') && f.path !== SYSTEM.questions)
  .map((f) => [f.path, f.content]));
const cold = (n = 204, options: Parameters<typeof setup>[0] = {}): Promise<Base> => setup({ ...options, folder: { ...folder, ...reports, ...archive(n) } });

type Result = Awaited<ReturnType<typeof run>>;
type View = { filed: unknown[]; setAside: Array<{ name: string }>; waiting?: number; nothingReady?: true };
const viewOf = (r: CaseRun): View => (r.lastRun as { run?: { report?: View } } | null)?.run?.report ?? { filed: [], setAside: [] };
const stateOf = (r: CaseRun): RetrievalFile | null => JSON.parse(r.after[SYSTEM.retrieval] ?? 'null') as RetrievalFile | null;
const known = (r: CaseRun): string[] => Object.keys(stateOf(r)?.files ?? {});
/** Ids whose 4,096-byte prefix this run fetched. */
const prefixed = (r: Result): string[] => r.traffic.filter((t) => t.method === 'GET' && t.range && t.url.searchParams.get('alt') === 'media')
  .map((t) => t.url.pathname.split('/').at(-1) ?? '');
type Op = { effect: { kind: string; path?: string; name?: string; before?: { modifiedTime: string }; inputs?: { targets?: Array<{ kind?: string }> } } };
/** This run's plan: its manifest sits under `.bower/runs/<runId>/`, beside the earlier presses'. */
const opsOf = (r: CaseRun): Op[] => {
  const text = Object.entries(r.after).find(([p]) => p.startsWith(`.bower/runs/${r.dispatch?.runId}/manifest-`))?.[1];
  return (JSON.parse(text ?? '{"operations":[]}') as { operations: Op[] }).operations;
};
const retrievalWrites = (ops: Op[]): Op[] => ops.filter(({ effect: e }) => e.path === SYSTEM.retrieval || e.name === 'retrieval.json');
const feedOnly = (b: Base, n: number): AdmissionManifest => ({ v: 1, id: `warm-idle-${n}`, rootId: b.root, scope: 'all', at: AT + n - 1, piles: [], journal: [] });
async function admitted(b: Base, n: number): Promise<AdmissionManifest> {
  const a = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + n - 1, newId: () => `warm-${n}` });
  return a.kind === 'manifest' ? a.manifest : feedOnly(b, n);
}
/** The things an admission took, as a selection places them under the job hunt and an execution reply files them. */
const things = (m: AdmissionManifest) => m.piles.flatMap((p) => p.items.filter((i) => i.name !== PILE_NOTE));
const select = (b: Base, m: AdmissionManifest, to: Record<string, string | { parentId: string; name: string }> = {}) => ({ asks: [], items: things(m).map((i) => ({
  itemId: i.fileId, kind: 'unknown', destination: to[i.name] ?? b.id('Projects/Remote search'), wants: [b.id(HUB)] })) });
const fileIntent = (m: AdmissionManifest, only?: string) => ({ ...empty, things: things(m).filter((i) => !only || i.name === only).map((i) => ({
  fileId: i.fileId, to: 'Projects/Remote search', name: i.name, basis: HUB,
  note: { name: i.name.replace(/\.[^.]+$/, '.md'), summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.' } })) });

/** One press: the model, when reached, places the admitted things under the job hunt (or as `to` says) and files `only`. */
async function press(b: Base, n: number, options: { admission?: AdmissionManifest; to?: Record<string, string | { parentId: string; name: string }>;
  only?: string; frames?: Frame[] } = {}): Promise<Result> {
  const m = options.admission ?? await admitted(b, n);
  const values: unknown[] = [];
  return run(b, values, { press: n, admission: m, beforeReply: async (turn, frame) => {
    options.frames?.push(frame);
    // Only what the frame lists is placed: the budget may leave a pile out of the run.
    const listed = new Set(((frame.value.sources ?? []) as Array<{ itemId: string }>).map((s) => s.itemId));
    const placed = select(b, m, options.to);
    const filing = fileIntent(m, options.only);
    values[turn - 1] = frame.value.selection === undefined ? { ...placed, items: placed.items.filter((i) => listed.has(i.itemId)) }
      : { ...filing, things: filing.things.filter((t) => listed.has(t.fileId)) };
  } });
}
/** A press with nothing admitted: discovery and maintenance only. */
const idle = (b: Base, n: number): Promise<Result> => run(b, [{ items: [], asks: [] }, empty], { press: n, admission: feedOnly(b, n) });
/** Presses with nothing admitted, until the index names `[[Record 203]]` (discovery complete). */
async function finish(b: Base, from: number, fetched: string[] = []): Promise<Result> {
  let last: Result | undefined;
  for (let n = from; n < from + 6 && !last?.after[SYSTEM.index]?.includes('[[Record 203]]'); n++) { last = await idle(b, n); fetched.push(...prefixed(last)); }
  return last as Result;
}
/** Every maintenance refusal, observed beside the production meter. */
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
/** What goes out inside maintenance's context (as b1d-r6's `budgetProbe` counts it): method, and whether the ledger had refused. */
function maintenanceSends() {
  const context = new AsyncLocalStorage<boolean>();
  const sends: Array<{ method: string; afterExhaustion: boolean }> = [];
  let exhausted = false;
  const maintenance = RunTiming.prototype.maintenance;
  const meter = RunTiming.prototype.meter;
  const spies = [
    vi.spyOn(RunTiming.prototype, 'maintenance').mockImplementation(function<T>(this: RunTiming, task: () => Promise<T>, items?: number): Promise<T> {
      return context.run(true, () => maintenance.call(this, task, items)) as Promise<T>;
    }),
    vi.spyOn(RunTiming.prototype, 'meter').mockImplementation(function(this: RunTiming, fetch) {
      const measured = meter.call(this, async (url, init) => {
        if (context.getStore() && new URL(url).origin === 'https://www.googleapis.com') sends.push({ method: (init?.method ?? 'GET').toUpperCase(), afterExhaustion: exhausted });
        return fetch(url, init);
      });
      return async (url, init) => {
        try { return await measured(url, init); } catch (error) { if (context.getStore() && error instanceof LedgerExhausted) exhausted = true; throw error; }
      };
    }),
  ];
  return { sends, stop: () => { for (const spy of spies) spy.mockRestore(); context.disable(); } };
}

describe('a press whose discovery is unfinished plans first (c12-warm-start)', () => {
  it('AC1 c12-warm-start-first-press: 204 cold notes and the job-hunt pile: two model calls, the pile filed, progress and log written, index and health wait', async () => {
    const b = await cold();
    const first = await press(b, 1);
    expect(first.code).toBe(0);
    expect(first.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(first.frames, 'selection and execution').toHaveLength(2);
    expect(first.after['Projects/Remote search/Offer.txt'], 'filed, its bytes unchanged').toBe(b.c.inboxFiles['Offer.txt']);
    const ops = opsOf(first);
    expect(ops.some(({ effect }) => effect.kind === 'move'), 'the plan has the filing').toBe(true);
    expect(retrievalWrites(ops), 'one retrieval write').toHaveLength(1);
    const maintains = ops.filter(({ effect }) => effect.kind === 'maintain');
    expect(maintains, 'one maintain op').toHaveLength(1);
    const targets = maintains[0]?.effect.inputs?.targets ?? [];
    expect(targets.length, 'with targets').toBeGreaterThan(0);
    expect(targets.every((t) => t.kind === 'log' || t.kind === 'log-folder'), 'only the log').toBe(true);
    expect(first.after[SYSTEM.index], 'no index from a partial view').toBeUndefined();
    expect(first.after[SYSTEM.hot], 'no hot').toBeUndefined();
    expect(first.after[HEALTH_NAME], 'no health note').toBeUndefined();
    const ingests = (first.after[MONTH] ?? '').split('\n').filter((line) => line.includes(' | ingest | '));
    expect(ingests, 'one ingest line, for Offer.txt').toHaveLength(1);
    expect(ingests[0]).toContain('Offer.txt');
    const count = known(first).length;
    expect(count, 'some Record notes are known').toBeGreaterThan(0);
    expect(count, 'not all of them').toBeLessThan(204);
    const listed = new Map((await b.drive.listAll(b.root)).map((f) => [f.id, f.modifiedTime]));
    for (const [id, entry] of Object.entries(stateOf(first)?.files ?? {})) expect(entry.version, 'each entry at its listed version').toBe(listed.get(id));
    const view = viewOf(first);
    expect(view.filed, 'one filed row').toHaveLength(1);
    expect(view.nothingReady, 'filed is not nothing ready').toBeUndefined();
    expect(view.waiting, 'nothing waits').toBeUndefined();
  }, 60_000);

  it('AC2 c12-warm-start-cards: unread notes are cards marked unread, the folders line says so, and a new folder waits unplaced and counted', async () => {
    const b = await cold(204, { inbox: [{ line: 'Alex has a remote developer offer.', files: ['Offer.txt'] }, { line: '', files: ['Kayak permit.txt'] }],
      inboxFiles: { 'Kayak permit.txt': 'Alex has a kayak permit for the lake.\n' } });
    const frames: Frame[] = [];
    const first = await press(b, 1, { admission: b.admission, only: 'Offer.txt', frames, to: { 'Kayak permit.txt': { parentId: b.id('Areas'), name: 'Kayaking' } } });
    expect(first.code).toBe(0);
    const cards = (frames[0]?.value.cards ?? []) as Array<{ id: string; unread?: boolean; summary?: string; type?: string; tags?: string[] }>;
    const unread = cards.filter((c) => c.unread);
    expect(unread.map((c) => c.id), 'the job hunt\'s hub is not read yet').toContain(b.id(HUB));
    for (const card of unread) {
      expect(card.unread).toBe(true);
      for (const key of ['summary', 'type', 'tags']) expect(card, `an unread card has no ${key}`).not.toHaveProperty(key);
    }
    expect(frames[0]?.prompt, 'the prompt file says the folders are not fully read').toContain(UNREAD);
    expect(frames[0]?.prompt).not.toContain(CUT);
    expect(first.after['Projects/Remote search/Offer.txt'], 'Offer.txt is filed').toBe(b.c.inboxFiles['Offer.txt']);
    expect(first.after['Inbox/Kayak permit.txt'], 'the permit stays').toBe('Alex has a kayak permit for the lake.\n');
    expect(first.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method) && e.path === 'Inbox/Kayak permit.txt'), 'and is never written').toEqual([]);
    expect(opsOf(first).some(({ effect }) => effect.kind === 'create-folder'), 'no folder is created').toBe(false);
    const view = viewOf(first);
    expect(view.filed, 'one filed row').toHaveLength(1);
    expect(view.waiting, 'the permit is counted as waiting').toBe(1);
    expect(view.nothingReady).toBeUndefined();
    expect(JSON.stringify(view.setAside), 'no row names it').not.toContain('Kayak');
  }, 60_000);

  it('AC3 c12-warm-start-continues: idle presses read no prefix twice; the press that completes discovery writes index, health and hot', async () => {
    const b = await cold();
    const first = await press(b, 1);
    expect(viewOf(first).filed, 'the first press filed the pile').toHaveLength(1);
    const fetched = prefixed(first);
    const last = await finish(b, 2, fetched);
    expect(new Set(fetched).size, 'no prefix is read twice').toBe(fetched.length);
    expect(last.after[SYSTEM.index], 'the completing press writes the index').toContain('[[Record 203]]');
    expect(last.after[HEALTH_NAME], 'and the health note').toBeDefined();
    expect(last.after[SYSTEM.hot], 'and hot').toBeDefined();
  }, 60_000);

  it('AC4 c12-warm-start-guard: a warm, fully discovered folder has neither marker and no unread card', async () => {
    const b = await setup(); await seedState(b);
    const frames: Frame[] = [];
    const r = await press(b, 1, { admission: b.admission, frames });
    expect(r.frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.prompt).not.toContain(UNREAD);
      expect(frame.prompt).not.toContain(CUT);
      expect(((frame.value.cards ?? []) as Array<{ unread?: boolean }>).filter((c) => c.unread)).toEqual([]);
    }
    expect(viewOf(r).filed).toHaveLength(1);
  }, 60_000);

  /** 400 notes whose stored entries are at their listed versions with no owner and no lint, and no index: discovery reads each prefix again (unreadable-kept's fixture). */
  async function unread(extra: number) {
    const b = await setup({ folder: { ...folder, ...reports, ...archive(extra ? 10 : 400) } });
    const state = await seedState(b);
    if (extra) {
      for (let i = 100; i < 100 + extra; i++) await b.drive.createText(b.id('Archive'), `Record ${i}.md`, note(`Alex keeps record ${i}.`));
    } else {
      const files = Object.fromEntries(Object.entries(state.files).map(([id, n]) => {
        const { owner: _owner, type: _type, lint: _lint, ...rest } = n as typeof n & { owner?: unknown; type?: unknown; lint?: unknown };
        return [id, rest];
      }));
      const retrieval = (await b.drive.listAll(b.root)).find((f) => f.name === 'retrieval.json');
      await b.drive.writeText(retrieval?.id ?? '', JSON.stringify({ ...state, files }), retrieval?.modifiedTime ?? '');
      await b.drive.trash((await b.drive.listAll(b.root)).find((f) => b.drive.pathOf(f.id, b.root) === SYSTEM.index)?.id ?? '');
    }
    return b;
  }

  it('AC5 c12-warm-start-known (WS9): every listed note has a stored entry, so the ledger ending discovery marks nothing unread; 400 new notes do', async () => {
    const framesOf = async (extra: number) => {
      const b = await unread(extra);
      const probe = ledgerProbe();
      const frames: Frame[] = [];
      try {
        const r = await press(b, 1, { admission: b.admission, frames });
        return { r, frames, refused: probe.refused };
      } finally { probe.stop(); }
    };
    const all = await framesOf(0);
    expect(all.refused, 'the ledger refused during discovery').toBeGreaterThan(0);
    expect(all.frames.length, 'the model was reached').toBeGreaterThan(0);
    for (const frame of all.frames) {
      expect(frame.prompt, 'no marker').not.toContain(UNREAD);
      expect(frame.prompt).not.toContain(CUT);
      expect(((frame.value.cards ?? []) as Array<{ unread?: boolean }>).filter((c) => c.unread), 'no unread card').toEqual([]);
    }
    const control = await framesOf(400);
    expect(control.refused).toBeGreaterThan(0);
    expect(control.frames[0]?.prompt, '400 new notes are not known').toContain(UNREAD);
  }, 120_000);

  it('WS14 c12-warm-start-requests-wait: unfinished discovery files the pile and leaves your request unconsumed; the press that completes discovery plans it', async () => {
    const TEXT = 'Keep my records tidy.';
    const b = await cold(204, { journal: [{ kind: 'request', text: TEXT }] });
    const change = (await b.drive.listAll(b.root)).find((f) => /^change-1\.json$/.test(f.name));
    const place = b.drive.pathOf(change?.id ?? '', b.root);
    const shown: Array<{ press: number; requests: unknown }> = [];
    const values: unknown[] = [];
    const go = async (n: number, admission: AdmissionManifest) => run(b, values, { press: n, admission, beforeReply: async (turn, frame) => {
      shown.push({ press: n, requests: frame.value.requests });
      const sources = (frame.value.sources ?? []) as Array<{ itemId: string }>;
      values[turn - 1] = frame.value.selection === undefined
        ? { asks: [], items: sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [b.id(HUB)] })) }
        : fileIntent(admission);
    } });
    const first = await go(1, b.admission);
    expect(viewOf(first).filed, 'the pile is filed').toHaveLength(1);
    expect(first.after[place ?? ''], 'your request is still where it was').toBeDefined();
    expect(shown.some((s) => s.requests !== undefined), 'the model is not shown it').toBe(false);
    let last = first;
    for (let n = 2; n <= 8 && !last.after[SYSTEM.index]?.includes('[[Record 203]]'); n++) {
      // With the pile gone, only your request is left to take: an instructions run takes it.
      const a = await planAdmission(fakeRead(b.drive), b.root, { scope: 'instructions', clock: () => AT + n - 1, newId: () => `warm-${n}` });
      last = await go(n, a.kind === 'manifest' ? a.manifest : feedOnly(b, n));
    }
    expect(last.after[SYSTEM.index], 'discovery completed').toContain('[[Record 203]]');
    expect([...new Set(shown.filter((s) => s.requests !== undefined).map((s) => s.press))], 'only the completing press is shown the request')
      .toEqual([shown.at(-1)?.press]);
  }, 120_000);

  const OLD_LOG = '# Log\n2026-10-01 | create | Resources/Old.md | An old note. · op:abcdef012345\n';
  const upload = (init?: RequestInit): boolean => ['POST', 'PATCH'].includes((init?.method ?? 'GET').toUpperCase());
  it.each([
    ['before the retrieval write', 'retrieval', false],
    ['after the retrieval write', 'retrieval', true],
    ['before the log write', ' | ingest | ', false],
    ['after the log write', ' | ingest | ', true],
  ] as const)('WS16 c12-warm-start-crash-replay: a crash %s is replayed with no model call, one filing and one ingest line', async (_name, marker, after) => {
    const b = await cold();
    const sys = (await b.drive.createFolder(b.id(SYSTEM.dir), 'log')).id;
    await b.drive.createText(sys, '2026-10.md', OLD_LOG);
    const crash = { hit: false };
    const hits = (text: string): boolean => marker === 'retrieval' ? text.includes('"v":1,"folderId"') : text.includes(marker);
    const values: unknown[] = [];
    const m = b.admission;
    const first = await run(b, values, { press: 1, admission: m, around: (next) => async (input, init) => {
      const host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin;
      if (crash.hit && host === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (upload(init) && init?.body && hits(await new Response(init.body).clone().text())) {
        crash.hit = true;
        if (after) await next(input, init);
        throw new TypeError('Made-up connection lost at the write.');
      }
      return next(input, init);
    }, beforeReply: async (turn, frame) => { values[turn - 1] = frame.value.selection === undefined ? select(b, m) : fileIntent(m); } });
    expect(crash.hit, 'the crash point was reached').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A replay never calls a model.'); });
    const resumed = await redispatchCase(b.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(model, 'no model replay').not.toHaveBeenCalled();
    expect(Object.keys(resumed.after).filter((p) => p.endsWith('/Offer.txt')), 'filed once').toEqual(['Projects/Remote search/Offer.txt']);
    const log = resumed.after[MONTH] ?? '';
    expect(log.startsWith(OLD_LOG), 'the existing log bytes are kept').toBe(true);
    expect(log.split('\n').filter((line) => line.includes(' | ingest | ')), 'one ingest line').toHaveLength(1);
    expect((await b.drive.listAll(b.root)).filter((f) => f.name === 'retrieval.json'), 'one retrieval state').toHaveLength(1);
    expect(known(resumed).length, 'with the progress').toBeGreaterThan(0);
  }, 120_000);

  /** A concurrent edit before the first write: Offer.txt renamed (the filing is refused), retrieval.json touched when `both`. */
  async function refusedRun(both: boolean, crashOn: string) {
    const b = await cold();
    const all = await b.drive.listAll(b.root);
    const offer = all.find((f) => f.name === 'Offer.txt');
    const retrieval = all.find((f) => f.name === 'retrieval.json');
    const state = { sabotaged: false, crashed: false };
    const values: unknown[] = [];
    const m = b.admission;
    const first = await run(b, values, { press: 1, admission: m, around: (next) => async (input, init) => {
      const host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin;
      if (state.crashed && host === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (upload(init) && init?.body) {
        const text = await new Response(init.body).clone().text();
        // The plan is made and admitted: the edit lands between the opening checkpoint and the writes.
        if (!state.sabotaged && /"name":"checkpoint-/.test(text)) {
          state.sabotaged = true;
          await b.drive.update(offer?.id ?? '', { name: 'Moved offer.txt' });
          if (both) b.drive.touch(retrieval?.id ?? '');
        }
        if (/"name":"checkpoint-/.test(text) && text.includes(crashOn)) { state.crashed = true; throw new TypeError('Made-up connection lost at the checkpoint.'); }
      }
      return next(input, init);
    }, beforeReply: async (turn, frame) => { values[turn - 1] = frame.value.selection === undefined ? select(b, m) : fileIntent(m); } });
    expect(state.crashed, 'the checkpoint was reached').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A replay never calls a model.'); });
    const resumed = await redispatchCase(b.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(model, 'no model replay').not.toHaveBeenCalled();
    return { first, resumed };
  }

  it('WS21 c12-warm-start-rejected-filing: a filing refused by a conflict, the progress applied: the run finishes with the progress kept and no log line, and so does its replay', async () => {
    const { resumed } = await refusedRun(false, '"state":"applied"');
    expect(resumed.code).toBe(0);
    expect(resumed.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(resumed.after['Inbox/Alex has a remote developer offer./Moved offer.txt'], 'the filing did not happen').toBeDefined();
    expect(known(resumed).length, 'the progress is kept').toBeGreaterThan(0);
    expect(resumed.after[MONTH] ?? '', 'no log line').not.toContain(' | ');
  }, 120_000);

  it('WS22 c12-warm-start-rejected-all: the filing and the progress both refused by a concurrent edit of retrieval.json: the run finishes with no log line, and so does its replay', async () => {
    const { first, resumed } = await refusedRun(true, '"state":"pending"');
    for (const r of [first, resumed]) expect(r.after[MONTH] ?? '', 'no log line').not.toContain(' | ');
    expect(resumed.code).toBe(0);
    expect(resumed.wire?.statuses.at(-1)?.phase).toBe('done');
  }, 120_000);

  it('WS18 c12-warm-start-answers-wait: a queued answer is not consumed while discovery is unfinished; the press that completes applies it once', async () => {
    const A = 'Projects/Remote search/A.md';
    const B = 'Projects/Remote search/B.md';
    const b = await setup({ folder: { ...folder, ...reports, ...archive(204), [A]: note('Remote developer offer.', '## Timeline\n- Alex received an offer.\n', true),
      [B]: note('Remote developer offer.', '## Timeline\n- Alex checked the terms.\n', true) } });
    // The keep-one question of b1d-r8: its yes merges B into A, an effect only a run that reads the folder whole may have.
    const question = { id: `q-pair-${[b.id(A), b.id(B)].sort().join('.')}`, text: 'Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', about: A, askedAt: AT - 2 };
    const questions = await b.drive.get(b.id(SYSTEM.questions));
    await b.drive.writeText(questions.id, JSON.stringify({ v: 1, questions: [question] }), questions.modifiedTime);
    const answer = await b.drive.createText(b.id(SYSTEM.changes), 'warm-answer.json', JSON.stringify({ v: 1, id: 'warm-answer', device: 'device-1',
      kind: 'answer', questionId: question.id, askedAt: question.askedAt, at: AT - 1, what: 'Answered a question', text: 'yes' }));
    const first = await press(b, 1);
    expect(viewOf(first).filed, 'the pile is filed').toHaveLength(1);
    expect(first.pathsById[answer.id], 'the answer is not consumed').toBe(`${SYSTEM.changes}/warm-answer.json`);
    expect(first.after[SYSTEM.questions], 'its question stays').toContain(question.id);
    expect(first.after[B], 'and has no effect').toBeDefined();
    const keep = [{ asks: [], items: [{ itemId: answer.id, kind: 'unknown', destination: b.id('Projects/Remote search'), wants: [b.id(A), b.id(B)] }] }, { ...empty, keep: [{ kept: A, other: B }] }];
    const taken = async (n: number): Promise<Result> => {
      const a = await planAdmission(fakeRead(b.drive), b.root, { scope: 'instructions', clock: () => AT + n - 1, newId: () => `warm-${n}` });
      return run(b, keep, { press: n, admission: a.kind === 'manifest' ? a.manifest : feedOnly(b, n) });
    };
    let last = first;
    for (let n = 2; n <= 8 && !last.after[SYSTEM.index]?.includes('[[Record 203]]'); n++) last = await taken(n);
    expect(last.after[SYSTEM.index], 'discovery completed').toContain('[[Record 203]]');
    expect(last.pathsById[answer.id], 'the answer is consumed when discovery completes').toBe(`${SYSTEM.archive}/warm-answer.json`);
    expect(JSON.parse(last.after[SYSTEM.questions] ?? '{}'), 'and its question is settled').toEqual({ v: 1, questions: [] });
    expect(last.after[B], 'the merge was applied once').toBeUndefined();
    expect(last.after[A], 'into the kept note').toContain('Alex checked the terms.');
  }, 120_000);

  it('WS19 c12-warm-start-waiting-sum: one filed, one unplaced and one budget-deferred pile report waiting 2 with no duplicate row', async () => {
    const b = await cold(204, { inbox: [{ line: 'Alex has a remote developer offer.', files: ['Offer.txt'] }, { line: '', files: ['Kayak permit.txt'] },
      { line: '', files: ['Third thing.txt'] }], inboxFiles: { 'Kayak permit.txt': 'Alex has a kayak permit.\n', 'Third thing.txt': 'Alex has a third thing.\n' } });
    const first = await press(b, 1, { admission: b.admission, only: 'Offer.txt', to: { 'Kayak permit.txt': { parentId: b.id('Areas'), name: 'Kayaking' } } });
    expect(first.code).toBe(0);
    const view = viewOf(first);
    expect(view.filed, 'one filed row').toHaveLength(1);
    expect(view.waiting, 'the unplaced and the deferred pile are counted once each').toBe(2);
    expect(view.nothingReady).toBeUndefined();
    expect(view.setAside, 'no row names either').toEqual([]);
    for (const name of ['Kayak permit.txt', 'Third thing.txt']) expect(first.after[`Inbox/${name}`], `${name} stays in the inbox`).toBeDefined();
  }, 120_000);

  it('WS17 c12-warm-start-lost-checkpoint: a lost checkpoint after the effects and the empty-target maintain landed is replayed with no duplicate memory and no made-up log line', async () => {
    const WORDS = 'Alex prefers green tea in the morning.';
    const b = await cold(500, { inbox: [{ line: WORDS, files: [] }] });
    const pile = b.admission.piles[0]?.pileId ?? '';
    const values: unknown[] = [];
    const lost = { hit: false };
    const first = await run(b, values, { admission: b.admission, around: (next) => async (input, init) => {
      const host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin;
      if (lost.hit && host === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      if (upload(init) && init?.body) {
        const text = await new Response(init.body).clone().text();
        // The checkpoint that records every effect as applied: the effects landed, nothing says so.
        if (/"name":"checkpoint-/.test(text) && text.includes('"state":"applied"')) { lost.hit = true; throw new TypeError('Made-up connection lost at the checkpoint.'); }
      }
      return next(input, init);
    }, beforeReply: async (turn, frame) => {
      values[turn - 1] = frame.value.selection === undefined ? { asks: [], items: [{ itemId: pile, kind: 'unknown', destination: b.id('Resources'), wants: [] }] }
        : { ...empty, observations: [{ source: { pileId: pile }, section: 'about-you', category: 'biography', text: WORDS }] };
    } });
    expect(lost.hit, 'the checkpoint was reached').toBe(true);
    expect(first.after['.bower/observations.jsonl'], 'the memory landed').toContain(WORDS);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A replay never calls a model.'); });
    const resumed = await redispatchCase(b.c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(model, 'no model replay').not.toHaveBeenCalled();
    expect(resumed.code).toBe(0);
    expect((resumed.after['.bower/observations.jsonl'] ?? '').split(WORDS).length - 1, 'the fact is written once').toBe(1);
    expect(resumed.after[MONTH] ?? '', 'no log line is made up').not.toContain(' | ');
    expect(resumed.after[SYSTEM.index], 'discovery is still unfinished').toBeUndefined();
  }, 120_000);

  it('WS10 c12-warm-start-memory-no-log: an unfinished press whose plan has memory and no log line still ends in a maintain, so the guard holds', async () => {
    const WORDS = 'Alex prefers green tea in the morning.';
    const b = await cold(500, { inbox: [{ line: WORDS, files: [] }] });
    const pile = b.admission.piles[0]?.pileId ?? '';
    const values: unknown[] = [];
    const r = await run(b, values, { admission: b.admission, beforeReply: async (turn, frame) => {
      values[turn - 1] = frame.value.selection === undefined ? { asks: [], items: [{ itemId: pile, kind: 'unknown', destination: b.id('Resources'), wants: [] }] }
        : { ...empty, observations: [{ source: { pileId: pile }, section: 'about-you', category: 'biography', text: WORDS }] };
    } });
    expect(r.code).toBe(0);
    expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
    const ops = opsOf(r);
    expect(ops.some(({ effect: e }) => e.path === '.bower/observations.jsonl'), 'the plan has memory').toBe(true);
    expect(r.after[MONTH] ?? '', 'and no log line').not.toContain(' | ');
    expect(ops.at(-1)?.effect.kind, 'it ends in a maintain').toBe('maintain');
    expect(ops.at(-1)?.effect.inputs?.targets ?? [], 'with no target').toEqual([]);
    expect(retrievalWrites(ops), 'the progress is in the plan').toHaveLength(1);
    expect(r.after['.bower/observations.jsonl'], 'the fact is kept').toContain(WORDS);
    expect(r.after[SYSTEM.index], 'discovery is unfinished').toBeUndefined();
  }, 60_000);

  it('AC6 c12-warm-start-outside-ledger (WS4): the progress and the log of an unfinished press are sent outside maintenance\'s context', async () => {
    const b = await cold(500);
    const first = await press(b, 1);
    expect(first.after['Projects/Remote search/Offer.txt'], 'the first press filed its pile').toBeDefined();
    const retrieval = (await b.drive.listAll(b.root)).find((f) => f.name === 'retrieval.json');
    await b.drive.createText(b.id('Inbox'), 'Second offer.txt', 'Alex received another remote developer offer.\n');
    const probe = maintenanceSends();
    let second: Result;
    try { second = await press(b, 2); } finally { probe.stop(); }
    expect(second.code).toBe(0);
    expect(second.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(second.after['Projects/Remote search/Second offer.txt'], 'the pile is filed').toBe('Alex received another remote developer offer.\n');
    const [write] = retrievalWrites(opsOf(second));
    expect(write?.effect.kind, 'the state is updated').toBe('write-runner-json');
    expect(write?.effect.before?.modifiedTime, 'at the version read').toBe(retrieval?.modifiedTime);
    expect(known(second).length, 'progress grows').toBeGreaterThan(known(first).length);
    expect(second.after[SYSTEM.index], 'discovery is still unfinished').toBeUndefined();
    expect(second.after[MONTH], 'the log has the filing').toContain('Second offer.txt');
    expect(probe.sends.length, 'discovery spent the ledger').toBeGreaterThan(0);
    expect(probe.sends.filter((s) => s.afterExhaustion), 'no send after exhaustion').toEqual([]);
    expect(probe.sends.filter((s) => s.method !== 'GET'), 'no write is sent inside maintenance\'s context').toEqual([]);
  }, 120_000);
});
