import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRunCheckpoint, parseRunReport, verifyCheckpointChain, type Checkpoint, type ReportRecord, type RunExpectation } from './run-checkpoint';
import { parseRunManifestV2, type ManifestV2 } from './run-manifest';
import { hashRecordJson } from './record-json';
import { RUNNER_WRITES } from '../vault/layout';

const fixture = JSON.parse(readFileSync('testing/fixtures/run-recovery-contract/04-report-publication-retry.json', 'utf8')) as {
  input: { reportRecord: ReportRecord; pendingCheckpoint: Checkpoint; manifest: ManifestV2 };
};
const old = () => structuredClone(fixture.input.reportRecord);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const expected: RunExpectation = { rootId: 'fake-root', runId: fixture.input.reportRecord.runId,
  captureId: fixture.input.reportRecord.captureId, manifestHash: fixture.input.reportRecord.manifestHash,
  operationIds: fixture.input.manifest.operations.map((o) => o.operationId) };
const rows = [
  { name: 'Garden plot', why: "Bower didn't add the line: this note has no Timeline.", fileId: 'garden-note' },
  { name: 'Request', why: "Bower didn't update any note: this request names more than three. Ask for three at most at a time." },
];

describe('C05 person notes additive stored report contract', () => {
  it('C05 person notes: old reports remain readable and leftAsWritten survives report validation', async () => {
    const prior = old();
    expect(await parseRunReport(bytes(prior), expected)).toMatchObject({ ok: true, value: prior });
    const current = old();
    Object.assign(current.report, { leftAsWritten: rows });
    expect(await parseRunReport(bytes(current), expected)).toMatchObject({ ok: true, value: current });
    expect(current.report.updated).toEqual(prior.report.updated);
  });

  it('C05 person notes: leftAsWritten survives a pending checkpoint with older checkpoints still readable', async () => {
    const prior = structuredClone(fixture.input.pendingCheckpoint);
    expect(await parseRunCheckpoint(bytes(prior), expected)).toMatchObject({ ok: true });
    const current = structuredClone(prior);
    const body = old(); Object.assign(body.report, { leftAsWritten: rows });
    const hash = await hashRecordJson(body);
    expect(hash.ok).toBe(true);
    if (!hash.ok) return;
    current.report = { state: 'pending', body, reportHash: hash.value };
    expect(await parseRunCheckpoint(bytes(current), expected)).toMatchObject({ ok: true, value: current });
  });

  it('C05 person notes: leftAsWritten survives the manifest report plan without becoming an update', async () => {
    const prior = structuredClone(fixture.input.manifest);
    expect(await parseRunManifestV2(bytes(prior), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
    const current = structuredClone(prior);
    const plan = current.reportPlan[0];
    expect(plan).toBeDefined();
    if (!plan) return;
    Object.assign(plan.value, { leftAsWritten: rows });
    expect(await parseRunManifestV2(bytes(current), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
    expect(plan.value.updated).toEqual(prior.reportPlan[0]?.value.updated);
  });
});

it('C05 person notes: fix 1 finding 9: completion guards require applied bindings without inherited evidence', async () => {
  const prior = structuredClone(fixture.input.manifest);
  expect(await parseRunManifestV2(bytes(prior), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
  const lost = JSON.parse(readFileSync(
    'testing/fixtures/run-recovery-contract/02-lost-reply.json', 'utf8')) as {
    input: { checkpoint1: Checkpoint }; expected: { checkpoint2: Checkpoint };
  };
  // Fixture 02 supplies literal possible-effect -> applied evidence; hashes are recomputed after each change.
  const start = JSON.parse(readFileSync(
    'testing/fixtures/run-recovery-contract/01-admission-reopen.json', 'utf8')) as {
    input: { checkpoint0: Checkpoint };
  };
  const chain = [start.input.checkpoint0, lost.input.checkpoint1, lost.expected.checkpoint2];
  const binding = { operationId: chain[0]?.outcomes[0]?.operationId ?? '', requestId: 'change-1', targetFileId: 'garden-note' };
  const completion = { requestId: binding.requestId, targetFileId: binding.targetFileId };
  const run: RunExpectation = { ...expected, runId: chain[0]?.runId ?? '', manifestHash: chain[0]?.manifestHash ?? '',
    operationIds: [binding.operationId] };
  async function validated(completed: boolean): Promise<Checkpoint[]> {
    const records = structuredClone(chain);
    for (const [i, cp] of records.entries()) {
      cp.appendBindings = [binding]; cp.completedAppends = i === 2 && completed ? [completion] : [];
      if (i > 0) {
        const previous = await hashRecordJson(records[i - 1]);
        expect(previous.ok).toBe(true);
        if (previous.ok) cp.previous = previous.value;
      }
      expect(await parseRunCheckpoint(bytes(cp), run)).toMatchObject({ ok: true });
    }
    return records;
  }
  expect(await verifyCheckpointChain(await validated(true))).toMatchObject({ ok: true });
  expect.soft(await verifyCheckpointChain(await validated(false))).toMatchObject({ ok: false, reason: 'transition', at: 2 });
  const invented = structuredClone(prior);
  invented.completedAppends = [{ requestId: 'never-admitted', targetFileId: 'never-targeted' }];
  expect(await parseRunManifestV2(bytes(invented), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: false });
  invented.completedAppends = [completion];
  invented.appendEvidence = [await validated(true)];
  const parsed = await parseRunManifestV2(bytes(invented), 'fake-root', RUNNER_WRITES);
  // A reader may reject the obsolete fields or ignore them, but cannot inherit their authority.
  if (parsed.ok) {
    expect(parsed.value.completedAppends ?? []).toEqual([]);
    expect(parsed.value).not.toHaveProperty('appendEvidence');
  } else expect(parsed).toMatchObject({ ok: false });
});


it('C05 person notes: round 3 4: a forged inherited move checkpoint cannot complete an append', async () => {
  const prior = structuredClone(fixture.input.manifest);
  expect(await parseRunManifestV2(bytes(prior), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
  const start = JSON.parse(readFileSync(
    'testing/fixtures/run-recovery-contract/01-admission-reopen.json', 'utf8')) as {
    input: { manifest: ManifestV2; checkpoint0: Checkpoint };
  };
  const lost = JSON.parse(readFileSync(
    'testing/fixtures/run-recovery-contract/02-lost-reply.json', 'utf8')) as {
    input: { checkpoint1: Checkpoint }; expected: { checkpoint2: Checkpoint };
  };
  const chain = [start.input.checkpoint0, lost.input.checkpoint1, lost.expected.checkpoint2];
  const move = start.input.manifest.operations[0];
  expect(move?.effect.kind).toBe('move');
  expect(start.input.manifest.capture.journal).toEqual([]);
  const run: RunExpectation = { rootId: 'fake-root', runId: chain[0]?.runId ?? '',
    manifestHash: chain[0]?.manifestHash ?? '', captureId: start.input.manifest.captureId,
    operationIds: start.input.manifest.operations.map((o) => o.operationId) };
  for (const cp of chain) expect(await parseRunCheckpoint(bytes(cp), run)).toMatchObject({ ok: true });
  expect(await verifyCheckpointChain(chain)).toMatchObject({ ok: true });
  // This is a move's real stored chain, with an invented request/target and freshly recomputed hashes.
  const completion = { requestId: 'never-admitted', targetFileId: 'never-targeted' };
  for (const [i, cp] of chain.entries()) {
    cp.appendBindings = [{ operationId: move?.operationId ?? '', ...completion }];
    cp.completedAppends = i === 2 ? [completion] : [];
    if (i > 0) {
      const previous = await hashRecordJson(chain[i - 1]);
      expect(previous.ok).toBe(true);
      if (previous.ok) cp.previous = previous.value;
    }
    expect(await parseRunCheckpoint(bytes(cp), run)).toMatchObject({ ok: true });
  }
  expect(await verifyCheckpointChain(chain)).toMatchObject({ ok: true });
  const forged = { ...prior, completedAppends: [completion], appendEvidence: [chain] };
  const parsed = await parseRunManifestV2(bytes(forged), 'fake-root', RUNNER_WRITES);
  if (parsed.ok) {
    expect(parsed.value.completedAppends ?? []).not.toContainEqual(completion);
    expect(parsed.value).not.toHaveProperty('appendEvidence');
  } else expect(parsed).toMatchObject({ ok: false });
});
