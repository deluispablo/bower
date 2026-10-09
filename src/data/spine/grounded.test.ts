import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { scriptedProvider } from '../demo/script';
import { grounded } from './grounded';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import type { RunManifest } from './records';

const AT = Date.UTC(2026, 9, 7, 9);

async function planned(): Promise<RunManifest> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-grounded' });
  if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
  return scriptedProvider(fakeScripted(drive), { rootId: root, runId: 'run-grounded', allowWeb: false })({ taken: admission.manifest, deferred: [] });
}

describe('grounding', () => {
  // c3-planner-split part 2 (TL-P4-14 stage 3 contract 5): the planner builds each row from the operation it reports,
  // so grounding checks the plan's structure, never a row's words.
  it('grounded checks structure only', async () => {
    const m = await planned();
    expect(grounded(m)).toBe(true);
    // Other words on its rows (a note's line, a thing's name) are still grounded: the words are the planner's.
    const reworded: RunManifest = {
      ...m,
      reportPlan: m.reportPlan.map((c) => ({
        ...c,
        value: { ...c.value, updated: c.value.updated.map((r) => ({ ...r, what: 'Other words.' })), filed: c.value.filed.map((r) => ({ ...r, name: 'Other.pdf' })) },
      })),
    };
    expect(reworded.reportPlan.some((c) => c.value.updated.length)).toBe(true);
    expect(grounded(reworded)).toBe(true);
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    // A row naming an operation the plan does not have, or none, is not.
    expect(grounded({ ...m, reportPlan: [...m.reportPlan, { requires: ['f'.repeat(64)], when: 'applied', value: empty }] })).toBe(false);
    expect(grounded({ ...m, reportPlan: [...m.reportPlan, { requires: [], when: 'applied', value: empty }] })).toBe(false);
    // An operation the person is told about with no row is not: a note's edit, a filing move.
    const edit = m.operations.find((o) => o.effect.kind === 'edit-text' && o.effect.changes.some((c) => c.kind === 'timeline-append'));
    const members = new Set(m.capture.members.map((x) => x.file.fileId));
    const move = m.operations.find((o) => o.effect.kind === 'move' && members.has(o.effect.before.fileId));
    for (const op of [edit, move]) {
      expect(op).toBeDefined();
      expect(grounded({ ...m, reportPlan: m.reportPlan.filter((c) => !c.requires.includes(op?.operationId ?? '')) }), op?.effect.kind).toBe(false);
    }
  });
});
