import { expect, it } from 'vitest';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { scriptedProvider } from '../demo/script';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { materialize } from './report';
import { NEVER_WHY } from './scripted';

const FIRST = 'Delete my old receipts for good';
const SECOND = 'Empty the Bin for me';
const row = (name: string) => ({ name, why: NEVER_WHY });

/** Each group contributes its rows once its source move applies. */
async function reported(groups: string[][]) {
  const at = Date.UTC(2026, 9, 7, 9);
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', at)) ?? '';
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => at, newId: () => 'request-declined' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const planned = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: 'run-declined', allowWeb: false })({ taken: admission.manifest, deferred: [] });
  const moves = planned.operations.filter((op) => op.effect.kind === 'move'
    && planned.capture.members.some((m) => op.effect.kind === 'move' && m.file.fileId === op.effect.before.fileId));
  const reportPlan = groups.map((names, i) => {
    const move = moves[i];
    if (!move) throw new Error('Expected a filing move for each contribution');
    return { requires: [move.operationId], when: 'applied' as const,
      value: { filed: [], created: [], updated: [], setAside: [], questions: [], leftAsWritten: names.map(row) } };
  });
  const evidence: EffectEvidence = { file: { fileId: 'FILE_ID', name: 'Thing', parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'fake-stored' };
  const outcomes: Outcome[] = planned.operations.map((op) => ({ operationId: op.operationId, state: 'applied', evidence }));
  return materialize({ ...planned, reportPlan }, 'a'.repeat(64), outcomes)?.report.leftAsWritten;
}

it('AC2 two declined requests keep two rows', async () => {
  expect(await reported([[FIRST], [SECOND]])).toEqual([row(FIRST), row(SECOND)]);
});

it('F4-R3 two declined requests with identical words merge into one row', async () => {
  expect(await reported([[FIRST, FIRST]])).toEqual([row(FIRST)]);
});

it('AC2b F4-R5 one request spanning two applied sources materializes once', async () => {
  expect(await reported([[FIRST], [FIRST]])).toEqual([row(FIRST)]);
});
