import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hashRecordJson } from './record-json';
import { parseRunManifestV2 } from './run-manifest';
import { RUNNER_WRITES } from '../vault/layout';
import {
  parseRunCheckpoint, parseRunReport, verifyCheckpointChain,
  type Checkpoint, type Outcome, type ReportRecord, type RunExpectation,
} from './run-checkpoint';

// Positive records are the ratified literal fixtures. Their expected digests are
// copied from those fixtures; the module under test never supplies them.
const dir = 'testing/fixtures/run-recovery-contract/';
const load = (file: string): unknown => JSON.parse(readFileSync(`${dir}${file}`, 'utf8')) as unknown;
type Path = (string | number)[];
const at = (value: unknown, path: Path): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], value);
function set(value: unknown, path: Path, next: unknown): void {
  const parent = at(value, path.slice(0, -1)) as Record<string | number, unknown>;
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('A field path is required');
  parent[key] = next;
}
function drop(value: unknown, path: Path): void {
  const parent = at(value, path.slice(0, -1)) as Record<string | number, unknown>;
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('A field path is required');
  // Test-only removal of one known field to prove omission differs from null.
  Reflect.deleteProperty(parent, key);
}
const clone = <T>(value: T): T => structuredClone(value);

const f01 = load('01-admission-reopen.json');
const f02 = load('02-lost-reply.json');
const f04 = load('04-report-publication-retry.json');
const f05 = load('05-invalid-new-records.json');

const MANIFEST_01 = '9badff317145d753071b77cb70bd17c13ac745047180d0e0b6e341c1a1eef088';
const CAPTURE_01 = 'ae3b36b25031ccb1c4003080e90e08e146df73b93a9e74941db58909a1046314';
const OPERATION_01 = 'ffc686d1c2d38997ab8d92f0fd566b21a1989fd900b8ba38c5b9f5a1cd1ac1da';
const CHECKPOINT_0 = '2331ffc91a81ef0c0cb90aed68fd9f70263205cf6b99a9c6c22d6e9d27af287b';
const CHECKPOINT_1 = 'daf46b16a1e83726c3ec36863863c0263f03170f87efc525154d44f8b0ef431d';
const CHECKPOINT_2 = 'c4a51f314933b9bf1ba5a8e765d50deba71392753cb88690ceaf4d6b04c52599';
const REPORT_02 = '0cd0587cca6328889ab16642f1b20c7ef1942fea3b770f297d45fe8a1d46ee8c';
const MANIFEST_04 = '109ccdb48872207b5125ac2f4db2844af31c0ec55328de644ab7957f407e4d86';
const CAPTURE_04 = '3686529180d812b27dc18b309ba211d87390c4a1923d4a707125aad740aff193';
const CHAIN_04_FIRST = 'e7b82956fb06e9997d48f92a844bea19ca8bec3c1e096e7b00028d1734c02bf5';
const CHAIN_04_LAST = 'e0b4088d03514d9b294a29a2913e94b9081f078c4da48ef802e553f447ee6343';
const PENDING_04 = 'cb9231b25a6ba2a1fdf041eb909f8e67642dcffa4047431477194b979f289295';
const PUBLISHED_04 = 'd4b8a39a56abf776bc61cf2f24bd04dbeb50bd6646c792ff6d0524d16df391b6';
const REPORT_04 = '7a18f387d37ecc892557b84e70cef3a74efb1f80e686f3a3bb37a0eab7531f8f';
const OTHER = '0'.repeat(64);
type Pending = { reportHash: string; body: ReportRecord };

const cp0 = (): Checkpoint => clone(at(f01, ['input', 'checkpoint0']) as Checkpoint);
const cp1 = (): Checkpoint => clone(at(f02, ['input', 'checkpoint1']) as Checkpoint);
const cp2 = (): Checkpoint => clone(at(f02, ['expected', 'checkpoint2']) as Checkpoint);
const report02 = (): ReportRecord => clone(at(f02, ['expected', 'pendingReportBody']) as ReportRecord);
const chain04 = (): { record: Checkpoint; sha256: string }[] => clone(at(f04, ['input', 'checkpointChain']) as { record: Checkpoint; sha256: string }[]);
const pending04 = (): Checkpoint => clone(at(f04, ['input', 'pendingCheckpoint']) as Checkpoint);
const published04 = (): Checkpoint => clone(at(f04, ['input', 'publishedCheckpoint']) as Checkpoint);
const report04 = (): ReportRecord => clone(at(f04, ['input', 'reportRecord']) as ReportRecord);
const operations04 = (at(f04, ['input', 'manifest', 'operations']) as { operationId: string }[]).map((item) => item.operationId);
function op04(index: number): string {
  const value = operations04[index];
  if (!value) throw new Error('Fixture 04 must contain this operation');
  return value;
}

const run01: RunExpectation = { rootId: 'fake-root', runId: 'run-one', captureId: CAPTURE_01, manifestHash: MANIFEST_01, operationIds: [OPERATION_01] };
const run04: RunExpectation = { rootId: 'fake-root', runId: 'run-fifteen', captureId: CAPTURE_04, manifestHash: MANIFEST_04, operationIds: operations04 };

/** A pending checkpoint after fixture 02's applied head, carrying its literal pending report. */
function cp3Pending(): Checkpoint {
  const value = cp2();
  value.revision = 3; value.previous = CHECKPOINT_2;
  value.report = { state: 'pending', reportHash: REPORT_02, body: report02() };
  return value;
}
/** The terminal record after fixture 04's published head; the fixture stops at saving. */
function done04(): Checkpoint {
  const value = published04();
  value.revision = 33; value.previous = PUBLISHED_04; value.phase = 'done'; value.phaseAt = 1791194400200;
  return value;
}
function outcome(value: Checkpoint, index = 0): Outcome {
  const item = value.outcomes[index];
  if (!item) throw new Error('Fixture must contain this outcome');
  return item;
}
const applied02 = (): Outcome => outcome(cp2());
const refused = (operationId = OPERATION_01): Outcome => ({ operationId, state: 'before-effect-refused', failure: { code: 'offline', message: 'You seem to be offline.' } });
const rejected = (operationId = OPERATION_01): Outcome => ({ operationId, state: 'rejected', failure: { code: 'conflict', message: 'This file changed elsewhere.' } });
const possible = (dispatchId = 'dispatch-one'): Outcome => ({ operationId: OPERATION_01, state: 'possible-effect', dispatchId });
const waiting = (): Outcome => ({ operationId: OPERATION_01, state: 'not-dispatched' });
function withOutcome(base: Checkpoint, next: Outcome): Checkpoint {
  const value = clone(base); value.outcomes = [next]; return value;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (value: unknown): Uint8Array => utf8(JSON.stringify(value));

async function accept(value: Checkpoint, expected: RunExpectation, digest?: string): Promise<void> {
  const source = bytes(value);
  const before = source.slice();
  // Synthetic positives get an expected digest from the integrated hasher, never from the result.
  const independent = await hashRecordJson(value);
  if (!independent.ok) throw new Error('Synthetic checkpoint must be canonical');
  const result = await parseRunCheckpoint(source, expected);
  expect(result).toEqual({ ok: true, value, sha256: digest ?? independent.value });
  expect(source).toEqual(before);
}
async function refuse(source: Uint8Array, expected: RunExpectation, reason: string): Promise<void> {
  const before = source.slice();
  const result = await parseRunCheckpoint(source, expected);
  expect(result).toEqual({ ok: false, reason });
  expect(result).not.toHaveProperty('value');
  expect(source).toEqual(before);
}
async function refuseReport(source: Uint8Array, expected: RunExpectation, reason: string): Promise<void> {
  const before = source.slice();
  const result = await parseRunReport(source, expected);
  expect(result).toEqual({ ok: false, reason });
  expect(result).not.toHaveProperty('value');
  expect(source).toEqual(before);
}
/** Links a synthetic successor with the integrated canonical hash, not the module under test. */
async function after(previous: Checkpoint, next: Checkpoint): Promise<Checkpoint> {
  const digest = await hashRecordJson(previous);
  if (!digest.ok) throw new Error('Synthetic predecessor must be canonical');
  const value = clone(next); value.revision = previous.revision + 1; value.previous = digest.value;
  return value;
}

describe('run checkpoints keep one honest recoverable chain', () => {
  it.each([
    ['01 checkpoint0', cp0, run01, CHECKPOINT_0],
    ['02 checkpoint1', cp1, run01, CHECKPOINT_1],
    ['02 checkpoint2', cp2, run01, CHECKPOINT_2],
    ['04 first chain record', (): Checkpoint => outcomeChain()[0] ?? cp0(), run04, CHAIN_04_FIRST],
    ['04 last chain record', (): Checkpoint => outcomeChain()[30] ?? cp0(), run04, CHAIN_04_LAST],
    ['04 pending checkpoint', pending04, run04, PENDING_04],
    ['04 published checkpoint', published04, run04, PUBLISHED_04],
  ])('accepts fixture %s at its literal digest', async (_label, make, expected, digest) => {
    await accept(make(), expected, digest);
  });

  it('accepts every fixture 04 chain record at the digest the fixture records', async () => {
    const chain = chain04();
    expect(chain).toHaveLength(31);
    for (const item of chain) await accept(item.record, run04, item.sha256);
  });

  it.each([
    ['02 pending body', report02, run01, REPORT_02],
    ['04 report record', report04, run04, REPORT_04],
  ])('accepts report record %s at its literal digest', async (_label, make, expected, digest) => {
    const value = make();
    const source = bytes(value);
    const before = source.slice();
    const result = await parseRunReport(source, expected);
    expect(result).toEqual({ ok: true, value, sha256: digest });
    expect(source).toEqual(before);
  });

  it('verifies the fixture chains to their literal heads', async () => {
    expect(await verifyCheckpointChain([cp0(), cp1(), cp2()])).toEqual({ ok: true, head: CHECKPOINT_2 });
    expect(await verifyCheckpointChain([...outcomeChain(), pending04(), published04()])).toEqual({ ok: true, head: PUBLISHED_04 });
  });

  it('accepts a pending report bound to this run and carries it through the chain', async () => {
    await accept(cp3Pending(), run01);
    const result = await verifyCheckpointChain([cp0(), cp1(), cp2(), cp3Pending()]);
    expect(result.ok).toBe(true);
  });

  it('accepts done once every outcome is applied or rejected and the report is published', async () => {
    await accept(done04(), run04);
    const withRejection = done04();
    withRejection.outcomes[3] = rejected(op04(3));
    await accept(withRejection, run04);
    const result = await verifyCheckpointChain([...outcomeChain(), pending04(), published04(), done04()]);
    expect(result.ok).toBe(true);
  });

  it('accepts a run with no fixed operations and evidence without content', async () => {
    const empty = cp0(); empty.outcomes = [];
    await accept(empty, { ...run01, operationIds: [] });
    const bare = cp2();
    const item = outcome(bare);
    if (item.state === 'applied') item.evidence.content = null;
    await accept(bare, run01);
  });

  it.each([
    ['corrupt JSON', utf8('{"v":1,'), 'syntax'],
    ['duplicate key', utf8('{"v":1,"v":2}'), 'duplicate-key'],
    ['invalid UTF-8', new Uint8Array([0x7b, 0xff, 0x7d]), 'encoding'],
    ['lone surrogate', utf8(JSON.stringify(cp0()).replace('"bootstrap"', '"\\ud800"')), 'unicode'],
    ['unsafe revision', utf8(JSON.stringify(cp0()).replace('"revision":0', '"revision":9007199254740992')), 'number'],
    ['fractional time', utf8(JSON.stringify(cp0()).replace('"phaseAt":1791194400001', '"phaseAt":1791194400001.5')), 'number'],
    ['negative epoch', utf8(JSON.stringify(cp0()).replace('"epoch":0', '"epoch":-1')), 'number'],
  ])('refuses %s source bytes', async (_label, source, reason) => {
    await refuse(source, run01, reason);
  });

  it('refuses the literal unknown-field fixture and keeps the wrong-previous fixture out of the chain', async () => {
    const cases = at(f05, ['inputCases']) as { label: string; record?: Checkpoint }[];
    const unknown = cases.find((item) => item.label === 'unknown-field')?.record;
    const wrong = cases.find((item) => item.label === 'wrong-previous')?.record;
    if (!unknown || !wrong) throw new Error('Fixture 05 must contain both checkpoint cases');
    await refuse(bytes(unknown), run01, 'shape');
    await accept(wrong, run01);
    expect(await verifyCheckpointChain([cp0(), wrong])).toEqual({ ok: false, reason: 'previous', at: 1 });
  });

  it.each([
    ['checkpoint', cp0, []],
    ['scope', cp0, ['scope']],
    ['waiting outcome', cp0, ['outcomes', 0]],
    ['possible outcome', cp1, ['outcomes', 0]],
    ['applied outcome', cp2, ['outcomes', 0]],
    ['evidence', cp2, ['outcomes', 0, 'evidence']],
    ['evidence file', cp2, ['outcomes', 0, 'evidence', 'file']],
    ['evidence content', cp2, ['outcomes', 0, 'evidence', 'content']],
    ['refusal failure', (): Checkpoint => withOutcome(cp1(), refused()), ['outcomes', 0, 'failure']],
    ['rejection failure', (): Checkpoint => withOutcome(cp2(), rejected()), ['outcomes', 0, 'failure']],
    ['not-ready report', cp0, ['report']],
    ['pending report', cp3Pending, ['report']],
    ['pending body', cp3Pending, ['report', 'body']],
    ['pending body scope', cp3Pending, ['report', 'body', 'scope']],
    ['pending run report', cp3Pending, ['report', 'body', 'report']],
    ['pending filed row', cp3Pending, ['report', 'body', 'report', 'filed', 0]],
    ['published report', published04, ['report']],
  ] as [string, () => Checkpoint, Path][])('refuses an unknown field in the %s', async (_label, make, path) => {
    const value = make();
    Object.assign(at(value, path) as object, { unapproved: true });
    await refuse(bytes(value), make === published04 ? run04 : run01, 'shape');
  });

  it.each([
    ['created row', ['created'], { path: 'Areas/Home/Receipt.md', what: 'A note.', extra: 1 }],
    ['updated row', ['updated'], { path: '.bower/questions.json', what: 'Asked.', extra: 1 }],
    ['set-aside row', ['setAside'], { name: 'receipt.txt', why: 'Unclear.', extra: 1 }],
    ['question', ['questions'], { id: 'q1', text: 'Keep?', yes: 'Yes', no: 'No', askedAt: 1, extra: 1 }],
  ] as [string, Path, unknown][])('refuses an unknown field in a pending %s', async (_label, path, row) => {
    const value = cp3Pending();
    set(value.report, ['body', 'report', ...path], [row]);
    await refuse(bytes(value), run01, 'shape');
  });

  it.each([
    ['previous omitted', cp0, ['previous'], undefined],
    ['evidence content omitted', cp2, ['outcomes', 0, 'evidence', 'content'], undefined],
    ['filed note null', cp3Pending, ['report', 'body', 'report', 'filed', 0, 'note'], null],
    ['your changes null', cp3Pending, ['report', 'body', 'report', 'yourChanges'], null],
    ['requests null', cp3Pending, ['report', 'body', 'report', 'requests'], null],
    ['rules worded null', cp3Pending, ['report', 'body', 'report', 'rulesWorded'], null],
    ['questions omitted', cp3Pending, ['report', 'body', 'report', 'questions'], undefined],
    ['retained piles omitted', cp0, ['retainedPileIds'], undefined],
    ['dispatch null', cp1, ['outcomes', 0, 'dispatchId'], null],
  ] as [string, () => Checkpoint, Path, unknown][])('keeps omission distinct from null: refuses %s', async (_label, make, path, next) => {
    const value = make();
    if (next === undefined) drop(value, path); else set(value, path, next);
    await refuse(bytes(value), run01, 'shape');
  });

  it('accepts optional report fields when present with their types', async () => {
    const value = cp3Pending();
    Object.assign(value.report.state === 'pending' ? value.report.body.report : {}, {
      yourChanges: 2, requests: ['Keep receipts together.'], rulesWorded: 0,
      questions: [{ id: 'question-one', text: 'Keep this?', yes: 'Keep', no: 'Bin', askedAt: 1791194400000, about: 'receipt.txt' }],
    });
    if (value.report.state === 'pending') {
      const row = value.report.body.report.filed[0];
      if (row) row.note = 'Areas/Home/Receipt.md';
      const digest = await hashRecordJson(value.report.body);
      if (!digest.ok) throw new Error('Synthetic body must be canonical');
      value.report.reportHash = digest.value;
    }
    await accept(value, run01);
  });

  // report-kept-your-change: the kept rows are read as the unconfirmed ones are: a name and a why each, never empty.
  it('accepts kept rows and refuses an empty or malformed kept list', async () => {
    const withKept = async (kept: unknown): Promise<Checkpoint> => {
      const value = cp3Pending();
      if (value.report.state !== 'pending') throw new Error('a pending report');
      Object.assign(value.report.body.report, { kept });
      const digest = await hashRecordJson(value.report.body);
      if (!digest.ok) throw new Error('Synthetic body must be canonical');
      value.report.reportHash = digest.value;
      return value;
    };
    await accept(await withKept([{ name: 'August pay.pdf', why: 'You changed it after Bower did; Bower kept your change.' }]), run01);
    for (const bad of [[], [{ name: 'August pay.pdf' }], [{ name: 'August pay.pdf', why: 'x', fileId: 'FILE_ID' }], 'August pay.pdf']) {
      await refuse(bytes(await withKept(bad)), run01, 'shape');
    }
  });

  // TL-P4-19 addendum 3: an updated row names the operation that wrote it and its Timeline line, an additive field;
  // what was stored before it (this fixture) still reads, in the report and in the manifest's report plan.
  it('an old report without row op ids still reads', async () => {
    const path = 'Projects/Flat hunt/Flat hunt.md';
    const old = report04();
    old.report.updated = [{ path, what: 'Rent went up.' }];
    expect(await parseRunReport(bytes(old), run04)).toMatchObject({ ok: true });
    const now = report04();
    // A row with its line's ordinal and the note as the run left it (TL-P4-19 addendum 5); one from part 3 without them.
    const left = { lines: 2, md5: 'a'.repeat(32), stamp: 'b'.repeat(32) };
    now.report.updated = [{ path, what: 'Rent went up.', op: op04(0), line: 1, ...left }, { path, what: 'Rent went up.', op: op04(0), line: 0 }, { path, what: 'Current state brought up to date.', op: op04(0) }];
    expect(await parseRunReport(bytes(now), run04)).toMatchObject({ ok: true });
    for (const bad of [{ op: 'not-an-op' }, { op: op04(0), line: -1 }, { op: op04(0), line: 0.5 }, { line: 0 }, { op: op04(0), ...left },
      { op: op04(0), line: 2, ...left }, { op: op04(0), line: 0, ...left, md5: 'A'.repeat(32) }, { op: op04(0), line: 0, ...left, stamp: 'b'.repeat(64) }]) {
      const value = report04();
      value.report.updated = [{ path, what: 'Rent went up.', ...bad } as (typeof value.report.updated)[number]];
      expect(await parseRunReport(bytes(value), run04), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    const manifest = (rows: unknown[]): Uint8Array => {
      const m = clone(at(f04, ['input', 'manifest'])) as { reportPlan: { value: { updated: unknown[] } }[] };
      const first = m.reportPlan[0];
      if (first) first.value.updated = rows;
      return bytes(m);
    };
    expect(await parseRunManifestV2(manifest([{ path, what: 'Rent went up.' }]), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
    expect(await parseRunManifestV2(manifest([{ path, what: 'Rent went up.', op: op04(0), line: 0 }]), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
    expect(await parseRunManifestV2(manifest([{ path, what: 'Rent went up.', op: op04(0), line: -1 }]), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: false });
    expect(await parseRunManifestV2(manifest([{ path, what: 'Rent went up.', op: op04(0), line: 0, ...left }]), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
    expect(await parseRunManifestV2(manifest([{ path, what: 'Rent went up.', op: op04(0), ...left }]), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: false });
  });

  it.each([
    ['version 2', cp0, ['v'], 2],
    ['string version', cp0, ['v'], '1'],
    ['manifest kind', cp0, ['kind'], 'run-manifest'],
    ['phase', cp0, ['phase'], 'paused'],
    ['outcome state', cp0, ['outcomes', 0, 'state'], 'done'],
    ['report state', cp0, ['report', 'state'], 'ready'],
    ['evidence provenance', cp2, ['outcomes', 0, 'evidence', 'provenance'], 'guessed'],
    ['content provenance', cp2, ['outcomes', 0, 'evidence', 'content', 'provenance'], 'guessed'],
    ['content encoding', cp2, ['outcomes', 0, 'evidence', 'content', 'encoding'], 'utf16'],
    ['trashed type', cp2, ['outcomes', 0, 'evidence', 'trashed'], 0],
    ['folder type', cp2, ['outcomes', 0, 'evidence', 'file', 'folder'], 'no'],
    ['failure code', (): Checkpoint => withOutcome(cp2(), rejected()), ['outcomes', 0, 'failure', 'code'], 'boom'],
    ['body version', cp3Pending, ['report', 'body', 'v'], 2],
    ['body kind', cp3Pending, ['report', 'body', 'kind'], 'run-checkpoint'],
    ['filed kind', cp3Pending, ['report', 'body', 'report', 'filed', 0, 'kind'], 'video'],
    ['outcomes type', cp0, ['outcomes'], {}],
    ['report type', cp0, ['report'], null],
  ] as [string, () => Checkpoint, Path, unknown][])('refuses unsupported %s', async (_label, make, path, next) => {
    const value = make(); set(value, path, next);
    await refuse(bytes(value), run01, 'shape');
  });

  it.each([
    ['run ID with a space', cp0, ['runId'], 'run one'],
    ['empty attempt ID', cp0, ['attemptId'], ''],
    ['long attempt ID', cp0, ['attemptId'], 'a'.repeat(129)],
    ['dispatch ID with a slash', cp1, ['outcomes', 0, 'dispatchId'], 'dispatch/one'],
    ['upper-case manifest hash', cp0, ['manifestHash'], MANIFEST_01.toUpperCase()],
    ['short previous', cp1, ['previous'], CHECKPOINT_0.slice(1)],
    ['short operation ID', cp0, ['outcomes', 0, 'operationId'], OPERATION_01.slice(1)],
    ['duplicate retained piles', cp0, ['retainedPileIds'], ['pile-receipt', 'pile-receipt']],
    ['invalid retained pile', cp0, ['retainedPileIds'], ['pile receipt']],
    ['empty root', cp0, ['scope', 'rootId'], ''],
    ['duplicate parents', cp2, ['outcomes', 0, 'evidence', 'file', 'parents'], ['areas-home', 'areas-home']],
    ['no parents', cp2, ['outcomes', 0, 'evidence', 'file', 'parents'], []],
    ['control in file ID', cp2, ['outcomes', 0, 'evidence', 'file', 'fileId'], 'receipt\u0001file'],
    ['path as name', cp2, ['outcomes', 0, 'evidence', 'file', 'name'], 'Areas/Receipt.txt'],
    ['empty name', cp2, ['outcomes', 0, 'evidence', 'file', 'name'], ''],
    ['month 13', cp2, ['outcomes', 0, 'evidence', 'file', 'modifiedTime'], '2026-13-05T10:00:00.010Z'],
    ['February 30', cp2, ['outcomes', 0, 'evidence', 'file', 'modifiedTime'], '2026-02-30T10:00:00Z'],
    ['words as time', cp2, ['outcomes', 0, 'evidence', 'content', 'observedModifiedTime'], 'yesterday'],
    ['upper-case content hash', cp2, ['outcomes', 0, 'evidence', 'content', 'sha256'], 'A'.repeat(64)],
    ['empty failure message', (): Checkpoint => withOutcome(cp2(), rejected()), ['outcomes', 0, 'failure', 'message'], ''],
    ['empty refusal message', (): Checkpoint => withOutcome(cp1(), refused()), ['outcomes', 0, 'failure', 'message'], ''],
    ['duplicate question IDs', cp3Pending, ['report', 'body', 'report', 'questions'], [
      { id: 'q', text: 'One?', yes: 'Yes', no: 'No', askedAt: 1 }, { id: 'q', text: 'Two?', yes: 'Yes', no: 'No', askedAt: 2 }]],
  ] as [string, () => Checkpoint, Path, unknown][])('refuses %s', async (_label, make, path, next) => {
    const value = make(); set(value, path, next);
    await refuse(bytes(value), run01, 'shape');
  });

  it('accepts RFC 3339 offsets and leap-day times', async () => {
    const value = cp2();
    set(value, ['outcomes', 0, 'evidence', 'file', 'modifiedTime'], '2028-02-29T23:59:59+02:00');
    await accept(value, run01);
  });

  it('binds a checkpoint to the independently expected scope, run and manifest', async () => {
    await refuse(bytes(cp0()), { ...run01, rootId: 'other-root' }, 'scope');
    await refuse(bytes(cp0()), { ...run01, runId: 'run-two' }, 'binding');
    await refuse(bytes(cp0()), { ...run01, manifestHash: OTHER }, 'binding');
  });

  it.each([
    ['empty root', { ...run01, rootId: '' }],
    ['invalid run ID', { ...run01, runId: 'run one' }],
    ['invalid capture ID', { ...run01, captureId: 'capture' }],
    ['invalid manifest hash', { ...run01, manifestHash: 'manifest' }],
    ['invalid operation ID', { ...run01, operationIds: ['operation'] }],
    ['duplicate operation IDs', { ...run04, operationIds: [OPERATION_01, OPERATION_01] }],
  ])('refuses an invalid caller expectation: %s', async (_label, expected) => {
    await refuse(bytes(cp0()), expected, 'expected');
  });

  it.each([
    ['missing last outcome', (value: Checkpoint): void => { value.outcomes.pop(); }],
    ['extra outcome', (value: Checkpoint): void => { value.outcomes.push(outcome(value)); }],
    ['swapped order', (value: Checkpoint): void => { value.outcomes = [outcome(value, 1), outcome(value, 0), ...value.outcomes.slice(2)]; }],
    ['unknown operation', (value: Checkpoint): void => { outcome(value, 5).operationId = OTHER; }],
  ])('requires exactly one outcome per fixed operation in ordinal order: %s', async (_label, change) => {
    const value = outcomeChain()[0] ?? cp0();
    change(value);
    await refuse(bytes(value), run04, 'outcomes');
    await refuse(bytes(outcomeChain()[0]), { ...run04, operationIds: operations04.slice(0, 14) }, 'outcomes');
  });

  it('ties a null previous to revision zero only', async () => {
    const zero = cp0(); zero.previous = CHECKPOINT_2;
    await refuse(bytes(zero), run01, 'revision');
    const later = cp1(); later.previous = null;
    await refuse(bytes(later), run01, 'revision');
  });

  it.each([
    ['a possible effect', (value: Checkpoint): void => { value.outcomes[2] = { operationId: op04(2), state: 'possible-effect', dispatchId: 'dispatch-03' }; }],
    ['an undispatched operation', (value: Checkpoint): void => { value.outcomes[2] = { operationId: op04(2), state: 'not-dispatched' }; }],
    ['a before-effect refusal', (value: Checkpoint): void => { value.outcomes[2] = refused(op04(2)); }],
    ['a pending report', (value: Checkpoint): void => { value.report = { state: 'pending', reportHash: REPORT_04, body: report04() }; }],
    ['no report', (value: Checkpoint): void => { value.report = { state: 'not-ready' }; }],
  ])('refuses done with %s', async (_label, change) => {
    const value = done04(); change(value);
    await refuse(bytes(value), run04, 'phase');
  });

  it('refuses failed while an effect may have happened or a report is pending', async () => {
    const maybe = cp1(); maybe.phase = 'failed';
    await refuse(bytes(maybe), run01, 'phase');
    const saving = cp3Pending(); saving.phase = 'failed';
    await refuse(bytes(saving), run01, 'phase');
    const quiet = withOutcome(cp1(), refused()); quiet.phase = 'failed';
    await accept(quiet, run01);
    expect((await verifyCheckpointChain([cp0(), await after(cp0(), quiet)])).ok).toBe(true);
  });

  it('refuses failed once any effect is applied, before or after its report exists', async () => {
    // First pending-checkpoint failure: fixture 02's applied head must stay recoverable, not fail.
    const firstPending = cp2(); firstPending.phase = 'failed';
    await refuse(bytes(firstPending), run01, 'phase');
    expect(await verifyCheckpointChain([cp0(), cp1(), firstPending])).toEqual({ ok: false, reason: 'phase', at: 2 });
    const published = published04(); published.phase = 'failed';
    await refuse(bytes(published), run04, 'phase');
    expect(await verifyCheckpointChain([...outcomeChain(), pending04(), published])).toEqual({ ok: false, reason: 'phase', at: 32 });
  });

  it('refuses done inside a chain before every outcome resolves', async () => {
    const early = cp1(); early.phase = 'done';
    expect(await verifyCheckpointChain([cp0(), early])).toEqual({ ok: false, reason: 'phase', at: 1 });
  });

  it.each([
    ['report hash', (state: Pending): void => { state.reportHash = OTHER; }],
    ['run', (state: Pending): void => { state.body.runId = 'run-two'; }],
    ['capture', (state: Pending): void => { state.body.captureId = OTHER; }],
    ['manifest', (state: Pending): void => { state.body.manifestHash = OTHER; }],
    ['scope', (state: Pending): void => { state.body.scope.rootId = 'other-root'; }],
    ['wording', (state: Pending): void => { const row = state.body.report.filed[0]; if (row) row.title = 'Bill'; }],
  ])('binds a pending report body to its digest and this run: %s', async (_label, change) => {
    const value = cp3Pending();
    if (value.report.state !== 'pending') throw new Error('Synthetic pending checkpoint');
    change(value.report);
    await refuse(bytes(value), run01, 'report');
  });

  it('refuses report records outside the expected scope, run, capture or manifest', async () => {
    await refuseReport(bytes(report02()), { ...run01, rootId: 'other-root' }, 'scope');
    await refuseReport(bytes(report02()), { ...run01, runId: 'run-two' }, 'binding');
    await refuseReport(bytes(report02()), { ...run01, captureId: OTHER }, 'binding');
    await refuseReport(bytes(report02()), { ...run01, manifestHash: OTHER }, 'binding');
    await refuseReport(bytes(report02()), { ...run01, captureId: 'capture' }, 'expected');
    const extra = report02(); Object.assign(extra, { unapproved: true });
    await refuseReport(bytes(extra), run01, 'shape');
    const kind = report02(); set(kind, ['kind'], 'run-checkpoint');
    await refuseReport(bytes(kind), run01, 'shape');
    const missing = report02(); drop(missing, ['report', 'questions']);
    await refuseReport(bytes(missing), run01, 'shape');
    const nullCount = report02(); set(nullCount, ['report', 'yourChanges'], null);
    await refuseReport(bytes(nullCount), run01, 'shape');
    await refuseReport(utf8('{"v":1,"v":1}'), run01, 'duplicate-key');
  });

  it('refuses a chain that does not start at revision zero or skips a revision', async () => {
    expect(await verifyCheckpointChain([])).toEqual({ ok: false, reason: 'empty', at: 0 });
    expect(await verifyCheckpointChain([cp1(), cp2()])).toEqual({ ok: false, reason: 'start', at: 0 });
    expect(await verifyCheckpointChain([cp0(), cp2()])).toEqual({ ok: false, reason: 'revision', at: 1 });
    const stale = cp1(); stale.previous = CHECKPOINT_2;
    expect(await verifyCheckpointChain([cp0(), stale])).toEqual({ ok: false, reason: 'previous', at: 1 });
  });

  it.each([
    ['scope', (value: Checkpoint): void => { value.scope.rootId = 'other-root'; }],
    ['run', (value: Checkpoint): void => { value.runId = 'run-two'; }],
    ['manifest', (value: Checkpoint): void => { value.manifestHash = OTHER; }],
    ['operation', (value: Checkpoint): void => { outcome(value).operationId = OTHER; }],
  ])('refuses a chain whose %s changes', async (_label, change) => {
    const next = cp1(); change(next);
    expect(await verifyCheckpointChain([cp0(), next])).toEqual({ ok: false, reason: 'binding', at: 1 });
  });

  it.each([
    ['not-dispatched stays', [waiting()]],
    ['not-dispatched to possible-effect', [possible()]],
    ['not-dispatched to before-effect-refused', [refused()]],
    ['possible-effect stays', [possible(), possible()]],
    ['possible-effect to applied', [possible(), applied02()]],
    ['possible-effect to rejected', [possible(), rejected()]],
    ['before-effect-refused retried', [refused(), possible()]],
    ['before-effect-refused stays', [refused(), refused()]],
    ['before-effect-refused with new failure details', [refused(), { ...refused(), failure: { code: 'auth', message: 'Sign in again to continue.' } }]],
    ['before-effect-refused to rejected after a changed source', [refused(), rejected()]],
    ['applied stays', [possible(), applied02(), applied02()]],
    ['rejected stays', [possible(), rejected(), rejected()]],
  ] as [string, Outcome[]][])('allows %s', async (_label, states) => {
    const chain = [cp0()];
    for (const state of states) {
      const last = chain[chain.length - 1] ?? cp0();
      chain.push(await after(last, withOutcome(cp1(), state)));
    }
    const result = await verifyCheckpointChain(chain);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['not-dispatched to applied', [applied02()]],
    ['not-dispatched to rejected', [rejected()]],
    ['possible-effect back to not-dispatched', [possible(), waiting()]],
    ['possible-effect to a new dispatch', [possible(), possible('dispatch-two')]],
    ['possible-effect to before-effect-refused', [possible(), refused()]],
    ['before-effect-refused to applied without dispatch', [refused(), applied02()]],
    ['before-effect-refused back to not-dispatched', [refused(), waiting()]],
    ['applied to possible-effect', [possible(), applied02(), possible()]],
    ['applied to rejected', [possible(), applied02(), rejected()]],
    ['applied with changed evidence', [possible(), applied02(), ((): Outcome => {
      const item = applied02();
      if (item.state === 'applied') item.evidence.file.name = 'Other.txt';
      return item;
    })()]],
    ['rejected to applied', [possible(), rejected(), applied02()]],
    ['rejected with a changed failure', [possible(), rejected(), { ...rejected(), failure: { code: 'unknown', message: 'Something went wrong.' } }]],
  ] as [string, Outcome[]][])('refuses %s', async (_label, states) => {
    const chain = [cp0()];
    for (const state of states) {
      const last = chain[chain.length - 1] ?? cp0();
      chain.push(await after(last, withOutcome(cp1(), state)));
    }
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'transition', at: chain.length - 1 });
  });

  it('refuses a regression inside the literal fixture chain', async () => {
    const chain = [...outcomeChain(), pending04()];
    const last = chain[chain.length - 1];
    if (!last) throw new Error('Fixture chain must not be empty');
    last.outcomes[7] = { operationId: op04(7), state: 'possible-effect', dispatchId: 'dispatch-08' };
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'transition', at: 31 });
  });

  it('propagates unexpected platform hash errors and leaves source bytes intact', async () => {
    const failure = new Error('platform digest failed');
    const source = bytes(cp0());
    const before = source.slice();
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(failure);
    try {
      await expect(parseRunCheckpoint(source, run01)).rejects.toBe(failure);
      await expect(parseRunReport(bytes(report02()), run01)).rejects.toBe(failure);
      await expect(verifyCheckpointChain([cp0(), cp1()])).rejects.toBe(failure);
    } finally { spy.mockRestore(); }
    expect(source).toEqual(before);
  });
});

function outcomeChain(): Checkpoint[] {
  return chain04().map((item) => item.record);
}

// TL-P2-06 item 5: a chain only moves forward. Successors are linked with the
// integrated canonical hasher; expected heads are computed independently.
function phased(base: Checkpoint, phase: Checkpoint['phase']): Checkpoint {
  const value = clone(base); value.phase = phase; return value;
}
/** Another attempt resumes the same run from its head: new attempt, greater epoch. */
function resumed(base: Checkpoint): Checkpoint {
  const value = clone(base); value.attemptId = 'attempt-two'; value.epoch = base.epoch + 1; return value;
}
function reported(base: Checkpoint, report: Checkpoint['report']): Checkpoint {
  const value = clone(base); value.report = clone(report); return value;
}
async function linked(first: Checkpoint, ...rest: Checkpoint[]): Promise<Checkpoint[]> {
  const chain = [first];
  for (const next of rest) chain.push(await after(chain[chain.length - 1] ?? first, next));
  return chain;
}
async function headOf(chain: readonly Checkpoint[]): Promise<string> {
  const digest = await hashRecordJson(chain[chain.length - 1]);
  if (!digest.ok) throw new Error('Synthetic head must be canonical');
  return digest.value;
}
async function extend(chain: readonly Checkpoint[], next: Checkpoint): Promise<Checkpoint[]> {
  const last = chain[chain.length - 1];
  if (!last) throw new Error('A chain to extend is required');
  return [...chain, await after(last, next)];
}
const throughPending04 = (): Checkpoint[] => [...outcomeChain(), pending04()];
const throughPublished04 = (): Checkpoint[] => [...throughPending04(), published04()];
const throughDone04 = (): Checkpoint[] => [...throughPublished04(), done04()];
const notReady: Checkpoint['report'] = { state: 'not-ready' };
async function rewordedPending(): Promise<Checkpoint['report']> {
  const body = report04();
  const row = body.report.filed[0];
  if (!row) throw new Error('Fixture 04 report must file a row');
  row.title = 'Another title';
  const digest = await hashRecordJson(body);
  if (!digest.ok) throw new Error('Synthetic body must be canonical');
  return { state: 'pending', reportHash: digest.value, body };
}

describe('run checkpoint chains only move forward', () => {
  it('still verifies the fixture 02 and 04 chains at their literal heads', async () => {
    expect(await verifyCheckpointChain([cp0(), cp1(), cp2()])).toEqual({ ok: true, head: CHECKPOINT_2 });
    expect(await verifyCheckpointChain(throughPublished04())).toEqual({ ok: true, head: PUBLISHED_04 });
    const done = throughDone04();
    expect(await verifyCheckpointChain(done)).toEqual({ ok: true, head: await headOf(done) });
  });

  it('allows the same phase to repeat and a phase to be skipped forward', async () => {
    const repeated = await linked(cp0(), phased(cp0(), 'queued'), phased(cp0(), 'reading'), phased(cp0(), 'reading'),
      phased(cp0(), 'writing'), phased(cp0(), 'writing'), phased(cp0(), 'saving'), phased(cp0(), 'saving'));
    expect(await verifyCheckpointChain(repeated)).toEqual({ ok: true, head: await headOf(repeated) });
    const skipped = await linked(cp0(), phased(cp0(), 'writing'));
    expect(await verifyCheckpointChain(skipped)).toEqual({ ok: true, head: await headOf(skipped) });
  });

  it.each(['queued', 'reading', 'writing', 'saving'] as const)('allows failed after %s when no effect may remain', async (phase) => {
    const quiet = await linked(cp0(), phased(cp0(), phase), phased(cp0(), 'failed'));
    expect(await verifyCheckpointChain(quiet)).toEqual({ ok: true, head: await headOf(quiet) });
    const refusal = await linked(cp0(), withOutcome(phased(cp0(), phase), refused()), withOutcome(phased(cp0(), 'failed'), refused()));
    expect(await verifyCheckpointChain(refusal)).toEqual({ ok: true, head: await headOf(refusal) });
  });

  it('still refuses failed after reading, writing or saving while an effect may remain', async () => {
    for (const phase of ['reading', 'writing', 'saving'] as const) {
      const chain = await linked(cp0(), withOutcome(phased(cp0(), phase), possible()), withOutcome(phased(cp0(), 'failed'), possible()));
      expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'phase', at: 2 });
    }
  });

  it('lets a recovery continue from the head with the same phase and report', async () => {
    const lost = [cp0(), cp1(), cp2(), await after(cp2(), resumed(cp2()))];
    expect(await verifyCheckpointChain(lost)).toEqual({ ok: true, head: await headOf(lost) });
    let chain = await extend(throughPending04(), resumed(pending04()));
    chain = await extend(chain, resumed(published04()));
    chain = await extend(chain, resumed(published04()));
    chain = await extend(chain, resumed(done04()));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: true, head: await headOf(chain) });
  });

  it.each([
    ['reading back to queued', ['reading', 'queued']],
    ['writing back to reading', ['writing', 'reading']],
    ['saving back to writing', ['saving', 'writing']],
    ['saving back to queued', ['saving', 'queued']],
    ['writing repeated then back to queued', ['writing', 'writing', 'queued']],
  ] as [string, Checkpoint['phase'][]][])('refuses a phase going back: %s', async (_label, phases) => {
    const chain = await linked(cp0(), ...phases.map((phase) => phased(cp0(), phase)));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'phase', at: chain.length - 1 });
  });

  it('refuses a recovery that resets the phase of the head', async () => {
    const lost = [cp0(), cp1(), cp2(), await after(cp2(), phased(resumed(cp2()), 'queued'))];
    expect(await verifyCheckpointChain(lost)).toEqual({ ok: false, reason: 'phase', at: 3 });
    const pending = await extend(throughPending04(), phased(resumed(pending04()), 'reading'));
    expect(await verifyCheckpointChain(pending)).toEqual({ ok: false, reason: 'phase', at: 32 });
  });

  it('refuses a recovery that resets the revision of the head', async () => {
    const reset = resumed(cp2()); reset.revision = 0; reset.previous = null;
    expect(await verifyCheckpointChain([cp0(), cp1(), cp2(), reset])).toEqual({ ok: false, reason: 'revision', at: 3 });
  });

  it.each(['queued', 'reading', 'writing', 'saving', 'failed'] as const)('refuses any record after failed: %s', async (phase) => {
    const chain = await linked(cp0(), phased(cp0(), 'failed'), phased(cp0(), phase));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'phase', at: 2 });
  });

  it('refuses retrying a refused operation after the run failed', async () => {
    const chain = await linked(cp0(), withOutcome(phased(cp0(), 'failed'), refused()), withOutcome(phased(resumed(cp0()), 'saving'), possible()));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'phase', at: 2 });
  });

  it.each(['saving', 'done'] as const)('refuses any record after done: %s', async (phase) => {
    const chain = await extend(throughDone04(), phased(done04(), phase));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'phase', at: 34 });
  });

  it('refuses a report that skips pending', async () => {
    const chain = await extend(outcomeChain(), published04());
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'report', at: 31 });
    const lost = await extend([cp0(), cp1(), cp2()], reported(cp2(), { state: 'published', reportHash: REPORT_02 }));
    expect(await verifyCheckpointChain(lost)).toEqual({ ok: false, reason: 'report', at: 3 });
  });

  it.each([
    ['pending back to not-ready', (): Checkpoint => reported(pending04(), notReady)],
    ['pending back to not-ready in a recovery', (): Checkpoint => reported(resumed(pending04()), notReady)],
    ['pending under another hash', (): Checkpoint => reported(pending04(), { state: 'pending', reportHash: OTHER, body: report04() })],
    ['pending published under another hash', (): Checkpoint => reported(pending04(), { state: 'published', reportHash: OTHER })],
  ])('refuses a report change after pending: %s', async (_label, make) => {
    const chain = await extend(throughPending04(), make());
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'report', at: 32 });
  });

  it('refuses a pending report replaced by other wording under its own matching hash', async () => {
    const chain = await extend(throughPending04(), reported(pending04(), await rewordedPending()));
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'report', at: 32 });
  });

  it.each([
    ['published back to pending', (): Checkpoint => pending04()],
    ['published back to not-ready', (): Checkpoint => reported(published04(), notReady)],
    ['published back to not-ready in a recovery', (): Checkpoint => reported(resumed(published04()), notReady)],
    ['published under another hash', (): Checkpoint => reported(published04(), { state: 'published', reportHash: OTHER })],
  ])('refuses a report change after published: %s', async (_label, make) => {
    const chain = await extend(throughPublished04(), make());
    expect(await verifyCheckpointChain(chain)).toEqual({ ok: false, reason: 'report', at: 33 });
  });
});
