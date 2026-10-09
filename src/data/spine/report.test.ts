import { describe, expect, it } from 'vitest';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import type { RunManifest } from './records';
import { runDetail } from '@/features/tidy/run-words';
import { itemDispositions, materialize, reportContradictions, UNCONFIRMED_GONE } from './report';
import { scriptedProvider } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-report';

const evidence: EffectEvidence = { file: { fileId: 'FILE_ID', name: 'Thing', parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'fake-stored' };

/** Every operation applied, except those refused and what depends on them, which are rejected too. */
function settle(manifest: RunManifest, refused: ReadonlySet<string>): Outcome[] {
  const rejected = new Set<string>();
  for (const op of manifest.operations) if (refused.has(op.operationId) || op.dependsOn.some((id) => rejected.has(id))) rejected.add(op.operationId);
  return manifest.operations.map((op) => (rejected.has(op.operationId)
    ? { operationId: op.operationId, state: 'rejected', failure: { code: 'conflict', message: "It couldn't be filed this time." } }
    : { operationId: op.operationId, state: 'applied', evidence }));
}

describe('dispositions and the report', () => {
  it('the scripted demo run never has dispositions that contradict its report', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
    if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
    const manifest = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });

    // Everything applied, then each operation refused in turn (and what waits for it): the two always agree.
    const cases = [new Set<string>(), ...manifest.operations.map((o) => new Set([o.operationId]))];
    for (const refused of cases) {
      const outcomes = settle(manifest, refused);
      const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
      expect(report).toBeDefined();
      if (!report) return;
      const items = itemDispositions(admission.manifest, manifest, outcomes);
      expect(reportContradictions(admission.manifest, manifest, outcomes, report, items)).toEqual([]);
    }
    // And a disposition turned the other way is found.
    const outcomes = settle(manifest, new Set());
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    const items = itemDispositions(admission.manifest, manifest, outcomes);
    const [first, ...rest] = items.filter((i) => i.pileId !== null);
    expect(first?.disposition).toBe('filed');
    if (!first || !report) return;
    expect(reportContradictions(admission.manifest, manifest, outcomes, report, [{ ...first, disposition: 'set-aside' }, ...rest])).not.toEqual([]);
  });

  it('a run summary counts unconfirmed things on their own line, never as set aside', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
    if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
    const manifest = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });
    // One filing move whose answer was lost, its thing then emptied from the Bin before Bower read it back.
    const members = new Set(manifest.capture.members.map((m) => m.file.fileId));
    const move = manifest.operations.find((o) => o.effect.kind === 'move' && members.has(o.effect.before.fileId));
    if (!move || move.effect.kind !== 'move') throw new Error('no filing move');
    const name = manifest.capture.members.find((m) => m.file.fileId === (move.effect.kind === 'move' ? move.effect.before.fileId : ''))?.file.name;
    const outcomes = settle(manifest, new Set([move.operationId])).map((o): Outcome => (o.operationId === move.operationId
      ? { operationId: o.operationId, state: 'rejected', failure: { code: 'unknown', message: UNCONFIRMED_GONE } }
      : o));
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    if (!report) throw new Error('no report');
    expect(report.setAside).toEqual([]);
    expect(report.unconfirmed).toEqual([{ name, why: UNCONFIRMED_GONE }]);
    const items = itemDispositions(admission.manifest, manifest, outcomes);
    expect(reportContradictions(admission.manifest, manifest, outcomes, report, items)).toEqual([]);
    const words = runDetail({ id: RUN, scope: 'all', phase: 'done', requestedAt: AT, phaseAt: AT, report });
    expect(words).toContain("Bower couldn't confirm 1 thing");
    expect(words).not.toContain('set aside');
  });
});
