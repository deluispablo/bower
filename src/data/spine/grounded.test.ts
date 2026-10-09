import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { scriptedProvider } from '../demo/script';
import { grounded } from './grounded';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import type { RunManifest } from './records';

const AT = Date.UTC(2026, 9, 7, 9);

async function planned(words?: string): Promise<RunManifest> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  if (words !== undefined) {
    // A pile of words only: its note is a generated create with a set-aside row of its own.
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A' });
    await vault.addPile({ text: words, items: [] });
    await vault.settled();
  }
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
  // P4-45b: structure includes multiplicity and identity. Each reportable op has exactly the rows it implies.
  it('grounded refuses a missing Timeline-line row', async () => {
    const m = await planned();
    const edit = m.operations.find((o) => o.effect.kind === 'edit-text'
      && m.reportPlan.filter((c) => c.requires.length === 1 && c.requires[0] === o.operationId && c.value.updated.length).length >= 2);
    expect(edit).toBeDefined();
    const one = m.reportPlan.findIndex((c) => c.requires.length === 1 && c.requires[0] === edit?.operationId && c.value.updated.length);
    expect(grounded({ ...m, reportPlan: m.reportPlan.filter((_, i) => i !== one) })).toBe(false);
  });

  // TL-P4-19 addendum 3: an updated row names the edit that wrote it and one line that edit appends, once.
  it('grounded refuses an updated row without its op or its own line', async () => {
    const m = await planned();
    expect(grounded(m)).toBe(true);
    const edit = m.operations.find((o) => o.effect.kind === 'edit-text'
      && m.reportPlan.filter((c) => c.requires.length === 1 && c.requires[0] === o.operationId && c.value.updated.length).length >= 2);
    const other = m.operations.find((o) => o.operationId !== edit?.operationId);
    const rows = m.reportPlan.flatMap((c, i) => (c.requires.length === 1 && c.requires[0] === edit?.operationId && c.value.updated.length ? [i] : []));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const [first = -1, second = -1] = rows;
    const line = m.reportPlan[second]?.value.updated[0]?.line;
    type Row = RunManifest['reportPlan'][number]['value']['updated'][number];
    const tamper = (at: number, change: (r: Row) => Row): RunManifest => ({
      ...m, reportPlan: m.reportPlan.map((c, i) => (i === at ? { ...c, value: { ...c.value, updated: c.value.updated.map(change) } } : c)),
    });
    const without = (r: Row, key: 'op' | 'line'): Row => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)) as Row;
    expect(grounded(tamper(first, (r) => without(r, 'op')))).toBe(false);
    expect(grounded(tamper(first, (r) => ({ ...r, op: other?.operationId ?? '' })))).toBe(false);
    expect(grounded(tamper(first, (r) => without(r, 'line')))).toBe(false);
    expect(grounded(tamper(first, (r) => ({ ...r, ...(line === undefined ? {} : { line }) })))).toBe(false);
    expect(grounded(tamper(first, (r) => ({ ...r, line: 99 })))).toBe(false);
    // A line row says the note as the run leaves it: its op's line count, the edit's bytes and the mark's stamp.
    expect(grounded(tamper(first, (r) => ({ ...r, lines: (r.lines ?? 0) + 1 })))).toBe(false);
    expect(grounded(tamper(first, (r) => ({ ...r, md5: 'f'.repeat(32) })))).toBe(false);
    expect(grounded(tamper(first, (r) => ({ ...r, stamp: 'f'.repeat(32) })))).toBe(false);
  });

  it('grounded refuses a missing generated-note set-aside row', async () => {
    const m = await planned('Bins go out on Tuesday nights');
    expect(grounded(m)).toBe(true);
    const generated = new Set(m.operations.flatMap((o) => (o.effect.kind === 'create-text' && o.effect.purpose === 'generated' ? [o.operationId] : [])));
    const aside = m.reportPlan.findIndex((c) => c.when === 'rejected' && generated.has(c.requires[0] ?? ''));
    expect(aside).toBeGreaterThanOrEqual(0);
    expect(grounded({ ...m, reportPlan: m.reportPlan.filter((_, i) => i !== aside) })).toBe(false);
  });

  it('grounded refuses a duplicated filed row', async () => {
    const m = await planned();
    const filed = m.reportPlan.find((c) => c.when === 'applied' && c.value.filed.length);
    expect(filed).toBeDefined();
    if (filed) expect(grounded({ ...m, reportPlan: [...m.reportPlan, filed] })).toBe(false);
    const aside = m.reportPlan.find((c) => c.when === 'rejected');
    if (aside) expect(grounded({ ...m, reportPlan: [...m.reportPlan, aside] })).toBe(false);
  });

  it('grounded refuses a row whose path disagrees with its op', async () => {
    const m = await planned();
    const other = 'Projects/Elsewhere';
    const swaps: Array<(c: RunManifest['reportPlan'][number]) => RunManifest['reportPlan'][number] | null> = [
      (c) => (c.value.filed.length ? { ...c, value: { ...c.value, filed: c.value.filed.map((r) => ({ ...r, to: other })) } } : null),
      (c) => (c.value.updated.length ? { ...c, value: { ...c.value, updated: c.value.updated.map((r) => ({ ...r, path: `${other}/Note.md` })) } } : null),
      (c) => (c.value.created.length ? { ...c, value: { ...c.value, created: c.value.created.map((r) => ({ ...r, path: `${other}/Note.md` })) } } : null),
      (c) => (c.value.filed.some((r) => r.note) ? { ...c, value: { ...c.value, filed: c.value.filed.map((r) => (r.note ? { ...r, note: `${r.to}/Other.md` } : r)) } } : null),
    ];
    for (const [k, swap] of swaps.entries()) {
      const at = m.reportPlan.findIndex((c) => swap(c) !== null);
      expect(at, `swap ${k}`).toBeGreaterThanOrEqual(0);
      const reportPlan = m.reportPlan.map((c, i) => (i === at ? swap(c) ?? c : c));
      expect(grounded({ ...m, reportPlan }), `swap ${k}`).toBe(false);
    }
  });
});
