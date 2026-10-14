import { describe, expect, it } from 'vitest';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import type { SeenFile, Target } from '../contracts/run-manifest';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import type { RunManifest } from './records';
import { runDetail } from '@/features/tidy/run-words';
import { itemDispositions, materialize, NOT_FILED, reportContradictions, UNCONFIRMED_GONE } from './report';
import { scriptedProvider } from '../demo/script';
import { grounded } from './grounded';

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
      expect(reportContradictions(admission.manifest, manifest, outcomes, items)).toEqual([]);
    }
    // And a disposition turned the other way is found.
    const outcomes = settle(manifest, new Set());
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    const items = itemDispositions(admission.manifest, manifest, outcomes);
    const [first, ...rest] = items.filter((i) => i.pileId !== null);
    expect(first?.disposition).toBe('filed');
    if (!first || !report) return;
    expect(reportContradictions(admission.manifest, manifest, outcomes, [{ ...first, disposition: 'set-aside' }, ...rest])).not.toEqual([]);
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
    expect(reportContradictions(admission.manifest, manifest, outcomes, items)).toEqual([]);
    const words = runDetail({ id: RUN, scope: 'all', phase: 'done', requestedAt: AT, phaseAt: AT, seen: false, report });
    expect(words).toContain("Bower couldn't confirm 1 thing");
    expect(words).not.toContain('set aside');
  });

  it('a run with confirmed and unconfirmed moves counts each on its own line', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
    if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
    const planned = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });
    // Two filing moves set aside, each by its own contribution: one refused as it is (confirmed), the other's answer
    // lost and its thing then emptied from the Bin before Bower read it back (unconfirmed).
    const asides = planned.reportPlan.filter((c) => c.when === 'rejected' && c.requires.length === 1
      && planned.operations.some((o) => o.operationId === c.requires[0] && o.effect.kind === 'move'));
    const [a, b] = asides;
    if (!a || !b) throw new Error('two filing moves needed');
    const manifest: RunManifest = planned;
    const [gone, kept] = [a.requires[0] ?? '', b.requires[0] ?? ''];
    const outcomes = settle(manifest, new Set([gone, kept])).map((o): Outcome => (o.operationId === gone
      ? { operationId: o.operationId, state: 'rejected', failure: { code: 'unknown', message: UNCONFIRMED_GONE } }
      : o));
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    if (!report) throw new Error('no report');
    expect(report.unconfirmed).toEqual([{ name: a.value.setAside[0]?.name, why: UNCONFIRMED_GONE }]);
    expect(report.setAside).toEqual([{ name: b.value.setAside[0]?.name, why: NOT_FILED }]);
    const words = runDetail({ id: RUN, scope: 'all', phase: 'done', requestedAt: AT, phaseAt: AT, seen: false, report });
    expect(words).toContain("Bower couldn't confirm 1 thing");
    expect(words).toContain('1 thing set aside');
  });

  // Stage 3 carry-over (P4-35d): a set-aside row is tied to its move by op id, never by the name it carries.
  it('two moves with the same name get their own rows by op id', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
    if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
    const planned = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });
    const asides = planned.reportPlan.filter((c) => c.when === 'rejected' && c.requires.length === 1
      && planned.operations.some((o) => o.operationId === c.requires[0] && o.effect.kind === 'move'));
    const [a, b] = asides;
    if (!a || !b) throw new Error('two filing moves needed');
    const [gone, kept] = [a.requires[0] ?? '', b.requires[0] ?? ''];
    // Two things added under one name, each moved by its own operation and set aside by a row naming that operation.
    const SAME = 'Scan.pdf';
    const operations = planned.operations.map((o) => (o.operationId === gone || o.operationId === kept) && o.effect.kind === 'move'
      ? { ...o, effect: { ...o.effect, before: { ...o.effect.before, name: SAME } } }
      : o);
    const named = (c: typeof a): typeof a => ({ ...c, value: { ...c.value, setAside: [{ name: SAME, why: NOT_FILED }] } });
    const manifest = { ...planned, operations, reportPlan: planned.reportPlan.map((c) => (c === a || c === b ? named(c) : c)) } as RunManifest;
    const outcomes = settle(manifest, new Set([gone, kept])).map((o): Outcome => (o.operationId === gone
      ? { operationId: o.operationId, state: 'rejected', failure: { code: 'unknown', message: UNCONFIRMED_GONE } }
      : o));
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    if (!report) throw new Error('no report');
    // Each row by its own move: the first unconfirmed, the other set aside.
    expect(report.unconfirmed).toEqual([{ name: SAME, why: UNCONFIRMED_GONE }]);
    expect(report.setAside.filter((r) => r.name === SAME)).toEqual([{ name: SAME, why: NOT_FILED }]);
  });

  // c3-planner-split part 2 (P4-45 m2): a set-aside row is its one operation's, never paired with one by position.
  it('a set-aside row names its op', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
    if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
    const planned = await scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });
    const asides = planned.reportPlan.filter((c) => c.when === 'rejected' && c.requires.length === 1
      && planned.operations.some((o) => o.operationId === c.requires[0] && o.effect.kind === 'move'));
    const [a, b] = asides;
    if (!a || !b) throw new Error('two filing moves needed');
    // Two moves set aside by one contribution, its rows listed in the other order: no row carries its own operation.
    const swapped = { requires: [...a.requires, ...b.requires], when: 'rejected' as const, value: { ...a.value, setAside: [...b.value.setAside, ...a.value.setAside] } };
    const manifest: RunManifest = { ...planned, reportPlan: [...planned.reportPlan.filter((c) => c !== a && c !== b), swapped] };
    const [gone, kept] = [a.requires[0] ?? '', b.requires[0] ?? ''];
    const outcomes = settle(manifest, new Set([gone, kept])).map((o): Outcome => (o.operationId === gone
      ? { operationId: o.operationId, state: 'rejected', failure: { code: 'unknown', message: UNCONFIRMED_GONE } }
      : o));
    const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
    if (!report) throw new Error('no report');
    // No row is said to be what another row's operation did.
    expect(report.unconfirmed ?? []).toEqual([]);
    // And a plan whose set-aside row does not name its one operation is not grounded.
    expect(grounded(manifest)).toBe(false);
  });
});

/** The kept line's reason (report-kept-your-change): the person changed a thing after Bower's change landed. */
const KEPT_YOUR_CHANGE = 'You changed it after Bower did; Bower kept your change.';

/** The demo folder's scripted plan, as the fake run service makes it. */
async function demoPlan(): Promise<RunManifest> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-report' });
  if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
  return scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false })({ taken: admission.manifest, deferred: [] });
}

/**
 * Every operation applied with the evidence its plan leaves: a move or a create under its name in its folder (a folder
 * the run made, by that create's evidence), a Bin in the Bin; anything else the shared evidence. `change` changes what
 * Drive shows for one operation, as the person left it.
 */
function asPlanned(manifest: RunManifest, change: Record<string, (file: SeenFile) => { file: SeenFile; trashed: boolean }> = {}): Outcome[] {
  const made = new Map<string, string>();
  const at = (t: Target): string => ('fileId' in t ? t.fileId : made.get(t.createdBy) ?? '');
  return manifest.operations.map((op): Outcome => {
    const e = op.effect;
    let file = evidence.file;
    let trashed = false;
    if (e.kind === 'move') file = { ...e.before, name: e.name, parents: [at(e.parent)] };
    else if (e.kind === 'create-folder' || e.kind === 'create-text') {
      file = { fileId: `made-${op.ordinal}`, name: e.name, parents: [at(e.parent)], folder: e.kind === 'create-folder', modifiedTime: evidence.file.modifiedTime };
      made.set(op.operationId, file.fileId);
    } else if (e.kind === 'bin') {
      file = e.before;
      trashed = true;
    }
    const now = change[op.operationId]?.(file) ?? { file, trashed };
    return { operationId: op.operationId, state: 'applied', evidence: { ...evidence, ...now } };
  });
}

const reportFor = (manifest: RunManifest, outcomes: readonly Outcome[]) => {
  const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
  if (!report) throw new Error('no report');
  return report;
};

describe('a change the person made after a landed op (report-kept-your-change)', () => {
  it('a change the person made after a landed op is reported as kept, named as it is now', async () => {
    const manifest = await demoPlan();
    const filing = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.name === 'Payslip_Aug.pdf');
    const note = manifest.operations.find((o) => o.effect.kind === 'create-text' && o.effect.name === 'Flat 9, Wrenfield Road.md');
    if (!filing || !note) throw new Error('the payslip filing and the flat note are planned');
    const untouched = reportFor(manifest, asPlanned(manifest));
    expect(untouched).not.toHaveProperty('kept');
    const cases: Array<[string, string, (file: SeenFile) => { file: SeenFile; trashed: boolean }, string]> = [
      ['a filed thing renamed', filing.operationId, (file) => ({ file: { ...file, name: 'August pay.pdf' }, trashed: false }), 'August pay.pdf'],
      ['a filed thing moved back to where it was', filing.operationId, (file) => ({ file: { ...file, parents: filing.effect.kind === 'move' ? filing.effect.before.parents : [] }, trashed: false }), 'Payslip August (2).pdf'],
      ['a filed thing put in the Bin', filing.operationId, (file) => ({ file, trashed: true }), 'Payslip August (2).pdf'],
      ['a note Bower made, renamed', note.operationId, (file) => ({ file: { ...file, name: 'Flat 9.md' }, trashed: false }), 'Flat 9.md'],
      ['a note Bower made, moved elsewhere', note.operationId, (file) => ({ file: { ...file, parents: ['FOLDER_ID'] }, trashed: false }), 'Flat 9, Wrenfield Road.md'],
    ];
    for (const [label, id, change, name] of cases) {
      const { kept, ...rest } = reportFor(manifest, asPlanned(manifest, { [id]: change }));
      expect(kept, label).toEqual([{ name, why: KEPT_YOUR_CHANGE }]);
      // Every other row as in a run nobody touched: the filed and created rows say what Bower did.
      expect(rest, label).toEqual(untouched);
    }
    // Two changes: one line each, in the plan's order.
    const both = reportFor(manifest, asPlanned(manifest, {
      [note.operationId]: (file) => ({ file: { ...file, name: 'Flat 9.md' }, trashed: false }),
      [filing.operationId]: (file) => ({ file: { ...file, name: 'August pay.pdf' }, trashed: false }),
    }));
    expect(both.kept).toEqual([{ name: 'August pay.pdf', why: KEPT_YOUR_CHANGE }, { name: 'Flat 9.md', why: KEPT_YOUR_CHANGE }]);
  });

  it('a change the person made after a landed op is reported as kept: a thing already saved taken out of the Bin', async () => {
    const planned = await demoPlan();
    const bin = planned.operations.find((o) => o.effect.kind === 'bin');
    if (bin?.effect.kind !== 'bin') throw new Error('a Bin is planned');
    // The same pile folder's Bin, now reported as already saved (a pile of words whose lines its notes held, as the
    // scripted plan reports it): a reported Bin is judged, even of a folder (R2).
    const saved = { requires: [bin.operationId], when: 'applied' as const, value: { filed: [], created: [], updated: [], setAside: [], questions: [], alreadySaved: [{ name: bin.effect.before.name, as: 'Offer letter.pdf' }] } };
    const manifest: RunManifest = { ...planned, reportPlan: [...planned.reportPlan, saved] };
    expect(reportFor(manifest, asPlanned(manifest))).not.toHaveProperty('kept');
    const restored = reportFor(manifest, asPlanned(manifest, { [bin.operationId]: (file) => ({ file, trashed: false }) }));
    expect(restored.kept).toEqual([{ name: bin.effect.before.name, why: KEPT_YOUR_CHANGE }]);
  });

  it('a run with no later change reports no kept line: what the report does not name, a refused op and a later op', async () => {
    const planned = await demoPlan();
    const filing = planned.operations.find((o) => o.effect.kind === 'move' && o.effect.before.name === 'Payslip_Aug.pdf');
    const unnamed = planned.operations.find((o) => o.effect.kind === 'bin');
    if (filing?.effect.kind !== 'move' || !unnamed) throw new Error('the payslip filing and a Bin are planned');
    // The same pile folder's Bin with no row reporting it (an emptied pile folder), taken out of the Bin: not judged (R2).
    expect(reportFor(planned, asPlanned(planned, { [unnamed.operationId]: (file) => ({ file, trashed: false }) }))).not.toHaveProperty('kept');
    // A refused filing says why on its own row, never as kept.
    const refused = settle(planned, new Set([filing.operationId])).map((o, i) => (o.state === 'applied' ? asPlanned(planned)[i] ?? o : o));
    expect(reportFor(planned, refused)).not.toHaveProperty('kept');
    // A later operation of the run on the same thing (the stamp Drive shows is its own): judged by the later one only.
    const later = { operationId: 'later-bin', ordinal: planned.operations.length, dependsOn: [filing.operationId], effect: { kind: 'bin' as const, before: { ...filing.effect.before, name: filing.effect.name }, capturedChildIds: [] } };
    const manifest = { ...planned, operations: [...planned.operations, later] } as RunManifest;
    const outcomes = asPlanned(manifest, { [filing.operationId]: (file) => ({ file, trashed: true }) });
    expect(reportFor(manifest, outcomes)).not.toHaveProperty('kept');
  });
});
