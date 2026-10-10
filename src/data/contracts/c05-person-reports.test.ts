import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRunCheckpoint, parseRunReport, type Checkpoint, type ReportRecord, type RunExpectation } from './run-checkpoint';
import { parseRunManifestV2, type ManifestV2 } from './run-manifest';
import { hashRecordJson } from './record-json';
import { RUNNER_WRITES } from '../vault/layout';

const fixture = JSON.parse(readFileSync('docs/harness/evidence/2026-10-05-local-prerequisites/run-recovery-contract/04-report-publication-retry.json', 'utf8')) as {
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
