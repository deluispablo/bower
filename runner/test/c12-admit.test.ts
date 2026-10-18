/**
 * c12-admit (specs/c12-lifecycle/plan-admit-words-warm.md, A1-A15): a run takes whole piles in admission order up to an
 * estimate of what fits (`ADMIT_THINGS`), the rest waits whole (FIFO admission, Google SRE "Handling Overload"); the
 * count of things that wait with no row of their own rides the manifest (`waitingThings`) to the report (`waiting`),
 * one closed key in the four readers. A held run reports what it left too. The budget is 2 here (`vi.mock`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Outcome } from '../../src/data/contracts/run-checkpoint';
import { parseRunReport } from '../../src/data/contracts/run-checkpoint';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import type { RunReport } from '../../src/data/contracts/types';
import type { AdmissionManifest, AdmittedFile } from '../../src/data/spine/admission';
import { fixedReport } from '../../src/data/spine/barrier';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { materialize } from '../../src/data/spine/report';
import { emptyManifest } from '../../src/data/spine/scripted';
import { isRunnerFile, RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import { takeAdmitted } from '../src/spine/admitted';
import { fileIntent, manifest, report, run, seedState, select, setup, type Base, type Frame } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

vi.mock('../src/timing', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/timing')>()), ADMIT_THINGS: 2 }));

const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

const BAD = [0, -1, 1.5, '3', true, false];
const EMPTY_ROWS = { filed: [], created: [], updated: [], setAside: [], questions: [] };
const ROOT = 'FOLDER_ID';

// takeAdmitted over a hand-made admission: each file read back as admitted, but those in `changed`.
const file = (id: string): AdmittedFile => ({ fileId: id, name: `${id}.pdf`, parents: ['INBOX_ID'], modifiedTime: '2026-10-07T09:00:00.000Z' });
const admission = (sizes: number[]): AdmissionManifest => ({ v: 1, id: 'admission-1', rootId: ROOT, scope: 'all', at: AT,
  piles: sizes.map((n, p) => ({ pileId: `P${p + 1}`, anchor: null, declaration: null, items: Array.from({ length: n }, (_, i) => file(`P${p + 1}-${i + 1}`)) })),
  journal: [file('change-1')] });
const reader = (changed: string[] = []) => ({ get: async (id: string) => {
  const seen = file(id);
  return { id, name: seen.name, parents: seen.parents, mimeType: 'application/pdf', folder: false,
    modifiedTime: changed.some((c) => id.startsWith(c)) ? '2026-10-08T09:00:00.000Z' : seen.modifiedTime } as never;
} });
const logs = (): string[] => vi.mocked(console.log).mock.calls.map((a) => a.map(String).join(' '));
const errs = (): string[] => vi.mocked(console.error).mock.calls.map((a) => a.map(String).join(' '));
const budget = (m: AdmissionManifest, piles: string[]) => m.piles.filter((p) => piles.includes(p.pileId))
  .flatMap((p) => p.items.map((i) => ({ fileId: i.fileId, pileId: p.pileId, why: 'budget' })));

describe('takeAdmitted admits whole piles up to the estimate (c12-admit A1-A3)', () => {
  it('AC1 c12-admit-takes: piles in manifest order up to the budget; the rest wait whole as budget; journal lines kept', async () => {
    const m = admission([1, 1, 1, 1]);
    const out = await takeAdmitted(m, reader());
    expect(out.taken.piles.map((p) => p.pileId), 'the first two piles fit').toEqual(['P1', 'P2']);
    expect(out.taken.journal.map((j) => j.fileId), 'your changes are always taken').toEqual(['change-1']);
    expect(out.deferred, 'the rest wait whole for the budget').toEqual(budget(m, ['P3', 'P4']));
    expect(out.waiting, 'their things are counted').toBe(2);
    const said = logs().filter((l) => /wait/.test(l));
    expect(said, 'one line says how many wait').toHaveLength(1);
    expect(said[0]).toMatch(/\b2\b.*wait/);
    expect(errs().filter((l) => /changed since admission/.test(l)), 'a budget wait is not a change').toEqual([]);
  });

  it('AC1 c12-admit-first-pile: the first pile is taken alone even over the budget; the next waits', async () => {
    const m = admission([3, 1]);
    const out = await takeAdmitted(m, reader());
    expect(out.taken.piles.map((p) => p.pileId)).toEqual(['P1']);
    expect(out.deferred).toEqual(budget(m, ['P2']));
    expect(out.waiting).toBe(1);
  });

  it('AC1 c12-admit-fifo: after the first misfit every later pile waits, even one that would fit', async () => {
    const m = admission([1, 2, 1]);
    const out = await takeAdmitted(m, reader());
    expect(out.taken.piles.map((p) => p.pileId)).toEqual(['P1']);
    expect(out.deferred).toEqual(budget(m, ['P2', 'P3']));
    expect(out.waiting).toBe(3);
  });

  it('AC1 c12-admit-changed: a changed pile spends no budget; the error line counts only changed items', async () => {
    const m = admission([1, 1, 1, 1]);
    const out = await takeAdmitted(m, reader(['P1-']));
    expect(out.taken.piles.map((p) => p.pileId)).toEqual(['P2', 'P3']);
    expect(out.deferred).toEqual([{ fileId: 'P1-1', pileId: 'P1', why: 'changed' }, ...budget(m, ['P4'])]);
    expect(out.waiting).toBe(1);
    expect(errs().filter((l) => /changed since admission/.test(l))).toEqual(['1 admitted items changed since admission; they wait for the next tidy-up']);
  });

  it('AC1 c12-admit-default: the real estimate is 144 things of a 720,000 ms model allowance', async () => {
    const real = await vi.importActual<typeof import('../src/timing')>('../src/timing');
    expect(real.MODEL_MS).toBe(720_000);
    expect(real.THING_MS).toBe(3_000);
    expect(real.ADMIT_THINGS).toBe(144);
    expect(new real.RunTiming(0, () => 0).remainingModelMs()).toBe(real.MODEL_MS);
  });
});

/** A run's manifest that captured nothing, one progress write, and `waitingThings` when given. */
async function waitingManifest(waitingThings?: number): Promise<{ manifest: RunManifest; outcomes: Outcome[] }> {
  const base = await emptyManifest(ROOT, { scope: 'all', allowWeb: false, runId: 'run-wait', requestId: 'admission-wait', requestedAt: AT });
  const effect = { kind: 'create-text', parent: { fileId: 'BOWER_DIR' }, name: 'retrieval.json', createKey: 'runner-key', text: '{}',
    content: { encoding: 'utf8', size: 2, sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' }, purpose: 'runner-json' };
  const operationId = (await canonical({ runId: base.runId, captureId: base.captureId, ordinal: 0, effect })).hash;
  const manifest = JSON.parse(JSON.stringify({ ...base, operations: [{ operationId, ordinal: 0, dependsOn: [], effect }],
    ...(waitingThings === undefined ? {} : { waitingThings }) })) as RunManifest;
  const outcomes: Outcome[] = [{ operationId, state: 'applied', evidence: { file: { fileId: 'RETRIEVAL_ID', name: 'retrieval.json',
    parents: ['BOWER_DIR'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'fake-stored' } }];
  return { manifest, outcomes };
}
const reportOf = async (waitingThings?: number): Promise<RunReport> => {
  const { manifest: m, outcomes } = await waitingManifest(waitingThings);
  const body = materialize(m, 'a'.repeat(64), outcomes);
  if (!body) throw new Error('the run settles');
  return body.report;
};

describe('waiting is one closed key (c12-admit A4)', () => {
  it('AC2 c12-admit-report: materialize gives waiting from waitingThings and never nothingReady with it', async () => {
    const report = await reportOf(5);
    expect(report).toHaveProperty('waiting', 5);
    expect(report, 'things wait: not "nothing was ready yet"').not.toHaveProperty('nothingReady');
    const control = await reportOf();
    expect(control).toHaveProperty('nothingReady', true);
    expect(control).not.toHaveProperty('waiting');
  });

  it('AC3 c12-admit-manifest: the manifest reads waitingThings, an integer of at least 1, and refuses any other value', async () => {
    const f04 = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../testing/fixtures/run-recovery-contract/04-report-publication-retry.json'), 'utf8')) as { input: { manifest: Record<string, unknown> } };
    const withWaiting = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify({ ...structuredClone(f04.input.manifest), waitingThings: value }));
    expect(await parseRunManifestV2(new TextEncoder().encode(JSON.stringify(f04.input.manifest)), 'fake-root', RUNNER_WRITES), 'control').toMatchObject({ ok: true });
    expect(await parseRunManifestV2(withWaiting(5), 'fake-root', RUNNER_WRITES), 'waitingThings: 5').toMatchObject({ ok: true });
    for (const bad of BAD) expect(await parseRunManifestV2(withWaiting(bad), 'fake-root', RUNNER_WRITES), `waitingThings: ${JSON.stringify(bad)}`).toMatchObject({ ok: false });
  });

  it('AC3 c12-admit-record: the report record reads waiting, an integer of at least 1, and refuses any other value', async () => {
    const { manifest: m, outcomes } = await waitingManifest();
    const body = materialize(m, 'b'.repeat(64), outcomes);
    if (!body) throw new Error('the run settles');
    const expected = { rootId: ROOT, runId: m.runId, captureId: m.captureId, manifestHash: 'b'.repeat(64) };
    // The canonical record with waiting 5, then the value swapped in its text: a canonical encoder refuses 1.5 itself.
    const record = structuredClone(body);
    delete record.report.nothingReady;
    Object.assign(record.report, { waiting: 5 });
    const text = (await canonical(record)).text;
    const withWaiting = (value: unknown): Uint8Array => new TextEncoder().encode(text.replace('"waiting":5', `"waiting":${JSON.stringify(value)}`));
    expect(await parseRunReport((await canonical(body)).bytes, expected), 'control: the record reads without it').toMatchObject({ ok: true });
    expect(await parseRunReport(withWaiting(5), expected), 'waiting: 5 reads').toMatchObject({ ok: true });
    // -1 and 1.5 are outside the record domain itself (non-negative integers), so its number check refuses them first.
    for (const bad of BAD) expect(await parseRunReport(withWaiting(bad), expected), `waiting: ${JSON.stringify(bad)}`)
      .toMatchObject({ ok: false, reason: bad === -1 || bad === 1.5 ? 'number' : 'shape' });
  });

  it('AC3 c12-admit-last-run: the app reads waiting from last-run.json and refuses any other value', () => {
    const view = (waiting: unknown): unknown => ({ v: 1, run: { id: 'run-wait', scope: 'all', phase: 'done', requestedAt: AT, phaseAt: AT,
      report: { ...EMPTY_ROWS, waiting } } });
    expect(isRunnerFile(SYSTEM.lastRun, view(5)), 'waiting: 5 reads').toBe(true);
    for (const bad of BAD) expect(isRunnerFile(SYSTEM.lastRun, view(bad)), `waiting: ${JSON.stringify(bad)}`).toBe(false);
  });

  it('AC3 c12-admit-fixed-order: a view written again keeps waiting, last', () => {
    const stored = JSON.parse(JSON.stringify({ ...EMPTY_ROWS, requests: ['Add the offer'], waiting: 3,
      answered: [{ questionId: 'q-1', kind: 'place', outcome: 'done', why: 'You chose a place.' }] })) as RunReport;
    const fixed = fixedReport(stored);
    expect(fixed, 'waiting survives a rewrite of the view').toHaveProperty('waiting', 3);
    expect(Object.keys(fixed).slice(-3)).toEqual(['requests', 'answered', 'waiting']);
  });
});

type Shown = { sources?: Array<{ itemId: string }> };
const loose = (names: string[]) => setup({ inbox: names.map((n) => ({ line: '', files: [n] })),
  inboxFiles: Object.fromEntries(names.map((n, i) => [n, `Alex received a remote developer offer, number ${i + 1}.\n`])) });
const THREE = ['First offer.txt', 'Second offer.txt', 'Third offer.txt'];
/** The selection and the intent list only the things the selection frame shows: the budget left the rest out of the run. */
const narrowing = (b: Base, replies: unknown[], then?: (turn: number, frame: Frame) => Promise<void>) => async (turn: number, frame: Frame): Promise<void> => {
  if (turn === 1) {
    const shownIds = new Set(((frame.value as Shown).sources ?? []).map((s) => s.itemId));
    replies[0] = { ...select(b), items: select(b).items.filter((i) => shownIds.has(i.itemId)) };
    replies[1] = { ...fileIntent(b), things: fileIntent(b).things.filter((t) => shownIds.has(t.fileId)) };
  }
  await then?.(turn, frame);
};
type View = { run?: { id?: string; report?: Record<string, unknown> } } | null;
const expire = async (turn: number, frame: Frame): Promise<void> => { if (turn === 1) vi.advanceTimersByTime(frame.call.timeoutMs); };
const progressOnly = (r: Awaited<ReturnType<typeof run>>) => manifest(r).operations.filter((op) => op.effect.kind !== 'write-runner-json' && op.effect.kind !== 'create-text');

describe('through production main (c12-admit A5, A7)', () => {
  it('AC4 c12-admit-through-main: a budget of 2 and 3 piles files 2; the third waits untouched with no row; the next press files it', async () => {
    const b = await loose(THREE); await seedState(b);
    const replies: unknown[] = [select(b), fileIntent(b)];
    const r = await run(b, replies, { beforeReply: narrowing(b, replies) });
    expect(r.code).toBe(0);
    expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(report(r).filed, 'the two piles that fit').toHaveLength(2);
    expect((r.lastRun as View)?.run?.report?.waiting, 'one thing waits').toBe(1);
    const third = b.admission.piles[2]?.items[0];
    const path = r.pathsById[third?.fileId ?? ''] ?? '';
    expect(path, 'the third thing stays in the inbox').toMatch(/^Inbox\//);
    expect(Object.hasOwn(r.after, path), 'readable by the next run').toBe(true);
    expect(r.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method) && e.path === path), 'never written').toEqual([]);
    expect(JSON.stringify(report(r).setAside), 'no row names it').not.toContain(third?.name ?? '-');
    expect((manifest(r) as { waitingThings?: number }).waitingThings).toBe(1);
    const again = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 1, newId: () => 'c12-admit-next' });
    if (again.kind !== 'manifest') throw new Error('the waiting thing is admitted again');
    const next: unknown[] = [select(b), fileIntent(b)];
    const r2 = await run(b, next, { press: 2, admission: again.manifest, beforeReply: narrowing(b, next) });
    expect(report(r2).filed, 'the next press files it').toHaveLength(1);
    expect((r2.lastRun as View)?.run?.report, 'nothing waits').not.toHaveProperty('waiting');
  }, 60_000);

  it('AC5 c12-admit-held: model time used up after selection leaves this run\'s report with waiting and a progress-only plan', async () => {
    const b = await setup(); await seedState(b);
    const r = await run(b, [select(b), fileIntent(b)], { beforeReply: expire });
    expect(r.code).toBe(0);
    expect(r.frames, 'execution never starts').toHaveLength(1);
    const view = r.lastRun as View;
    expect(view?.run?.id, 'the held run leaves a report of its own').toBe(r.dispatch?.runId);
    expect(view?.run?.report).toEqual({ ...EMPTY_ROWS, waiting: 1 });
    expect(progressOnly(r), 'the held plan writes only its reading progress').toEqual([]);
    expect(r.events.filter((e) => ['PATCH', 'POST', 'DELETE'].includes(e.method) && e.path.startsWith(`${SYSTEM.changes}/`)), 'no change consumed').toEqual([]);
  }, 60_000);

  it('AC5 c12-admit-held-sum: a held run with a budget of 2 and 3 piles counts what it took and what the budget left (A11)', async () => {
    const b = await loose(THREE); await seedState(b);
    const replies: unknown[] = [select(b), fileIntent(b)];
    const r = await run(b, replies, { beforeReply: narrowing(b, replies, expire) });
    expect(r.code).toBe(0);
    expect(r.frames).toHaveLength(1);
    expect((r.lastRun as View)?.run?.report).toEqual({ ...EMPTY_ROWS, waiting: 3 });
    expect(progressOnly(r)).toEqual([]);
  }, 60_000);
});
