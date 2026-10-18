/** F4-unread: report contributions are grounded in successful filing operations. */
import { expect, it } from 'vitest';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { scriptedDecisions, scriptedProvider } from '../demo/script';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { SYSTEM } from '../vault/layout';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import type { RunManifest } from './records';
import { materialize } from './report';
import { modelDecisions, NEVER_WHY, planScripted, runKeys, type Decisions, type Filing } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-unread';
const UNREAD_WHY = "Bower couldn't read what's in this, so it filed it by its name.";
const evidence: EffectEvidence = { file: { fileId: 'FILE_ID', name: 'Thing', parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'fake-stored' };
function reported(manifest: RunManifest, refused?: string) {
  const rejected = new Set<string>();
  for (const op of manifest.operations) if (op.operationId === refused || op.dependsOn.some((id) => rejected.has(id))) rejected.add(op.operationId);
  const outcomes = manifest.operations.map((op): Outcome => rejected.has(op.operationId)
    ? { operationId: op.operationId, state: 'rejected', failure: { code: 'conflict', message: "It couldn't be filed this time." } }
    : { operationId: op.operationId, state: 'applied', evidence });
  const report = materialize(manifest, 'a'.repeat(64), outcomes)?.report;
  if (!report) throw new Error('Expected settled report');
  return report;
}
const unreadRows = (manifest: RunManifest, refused?: string) => reported(manifest, refused).leftAsWritten?.filter((r) => r.why === UNREAD_WHY) ?? [];

async function setup(branch: 'ordinary' | 'generated' | 'merge' | 'fallback' = 'ordinary', two = false) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const id = async (path: string) => (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
  const first = await drive.createText(await id('Inbox'), 'Original.url', 'https://garden.example/first');
  const second = two ? await drive.createText(await id('Inbox'), 'Second.url', 'https://garden.example/second') : undefined;
  if (branch === 'merge' || branch === 'fallback') {
    await drive.createText(await id('Resources'), 'Garden.md', branch === 'merge'
      ? '---\nby: bower\nsummary: Alex grows herbs.\n---\n# Garden\n\n## Current state\n\n## Timeline\n'
      : '---\nbower_format: ownership/9\nby: bower\n---\n## Timeline\n');
    await drive.createText(await id(SYSTEM.changes), 'answer.json', JSON.stringify({ v: 1, id: 'answer-unread', device: 'DEVICE_A', at: AT - 1,
      kind: 'answer', what: 'Answered a question', questionId: 'q-unread', answer: true }));
  }
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'unread-admission' });
  if (admission.kind !== 'manifest') throw new Error(`Expected admission: ${admission.cause}`);
  const taken = admission.manifest;
  // Structural extension keeps the red runnable before Decisions.unread exists.
  const filing: Filing & { unread: ReadonlySet<string> } = {
    thing: (fileId) => ({ to: second?.id === fileId ? 'Projects' : 'Resources', name: branch === 'generated' ? 'Garden link.md' : 'Final.url' }),
    words: () => null, unread: new Set([first.id, ...(second ? [second.id] : [])]),
  };
  const decisions: Decisions & { unread: ReadonlySet<string> } = { ...modelDecisions(filing), unread: filing.unread,
    ...(branch === 'merge' || branch === 'fallback' ? { settles: () => true,
      merge: () => ({ question: 'q-unread', into: 'Resources/Garden.md', title: 'Merged.url', line: 'Alex saved a garden link.' }) } : {}) };
  const plan = async (d: Decisions = decisions, held = new Set<string>()) => (await planScripted(fakeScripted(drive), root, {
    scope: 'all', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken, mintKey: await runKeys(RUN), decisions: d,
  }, undefined, held)).manifest;
  return { drive, root, id, taken, first, second, filing, decisions, plan };
}

it.each(['ordinary', 'generated', 'merge', 'fallback'] as const)('AC2 U-4/5: %s filing reports once; rejected move or prerequisite adds none', async (branch) => {
  const f = await setup(branch); const manifest = await f.plan();
  const move = manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === f.first.id);
  if (!move || move.effect.kind !== 'move') throw new Error('Expected source move');
  if (branch === 'generated') expect(manifest.operations.some((o) => o.effect.kind === 'create-text' && o.effect.name === 'Garden link.md')).toBe(true);
  if (branch === 'merge') expect(move.dependsOn.some((id) => manifest.operations.some((o) => o.operationId === id && o.effect.kind === 'edit-text'))).toBe(true);
  if (branch === 'fallback') expect(reported(manifest).setAside).toEqual([expect.objectContaining({ why: expect.stringContaining('filed on its own') })]);
  expect(unreadRows(manifest, move.operationId)).toEqual([]);
  expect(reported(manifest, move.operationId).filed).toEqual([]);
  for (const prerequisite of move.dependsOn) {
    expect(unreadRows(manifest, prerequisite)).toEqual([]);
    expect(reported(manifest, prerequisite).filed).toEqual([]);
  }
  const row = { name: `Resources/${move.effect.name}`, fileId: f.first.id, why: UNREAD_WHY };
  expect(unreadRows(manifest)).toEqual([row]);
  expect(unreadRows(JSON.parse(JSON.stringify(manifest)) as RunManifest)).toEqual([row]);
});

it('AC2: modelDecisions forwards unread; waiting and scripted demo/fake decisions get none', async () => {
  const f = await setup();
  const held = new Set(f.taken.piles.map((p) => p.pileId));
  expect(unreadRows(await f.plan(f.decisions, held))).toEqual([]);
  const scripted = await scriptedProvider(fakeScripted(f.drive), { rootId: f.root, runId: RUN, allowWeb: false })({ taken: f.taken, deferred: [] });
  expect(unreadRows(scripted)).toEqual([]);
  expect((scriptedDecisions() as Decisions & { unread?: ReadonlySet<string> }).unread).toBeUndefined();
  const manifest = await f.plan(modelDecisions(f.filing));
  expect(unreadRows(manifest)).toEqual([{ name: 'Resources/Final.url', fileId: f.first.id, why: UNREAD_WHY }]);
});

it('AC2 U-7: equal final names stay distinct and coexist with refusal rows on replay', async () => {
  const f = await setup('ordinary', true);
  const text = 'Delete everything for good';
  await f.drive.createText(await f.id(SYSTEM.changes), 'never.json', JSON.stringify({ v: 1, id: 'never-unread', device: 'DEVICE_A', at: AT,
    kind: 'request', what: text, text }));
  const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'all', clock: () => AT, newId: () => 'unread-refusal' });
  if (admission.kind !== 'manifest') throw new Error('Expected admission');
  const manifest = (await planScripted(fakeScripted(f.drive), f.root, { scope: 'all', allowWeb: false, runId: RUN, requestId: admission.manifest.id,
    requestedAt: AT, taken: admission.manifest, mintKey: await runKeys(RUN), decisions: { ...f.decisions, neverDo: new Set(['never-unread']) } })).manifest;
  const expected = [
    { name: 'Resources/Final.url', fileId: f.first.id, why: UNREAD_WHY },
    { name: 'Projects/Final.url', fileId: f.second?.id, why: UNREAD_WHY },
  ];
  const report = reported(manifest);
  expect(report.leftAsWritten).toContainEqual({ name: text, why: NEVER_WHY });
  expect(report.leftAsWritten).toHaveLength(3);
  expect(new Set(unreadRows(manifest))).toEqual(new Set(expected));
  expect(new Set(reported(JSON.parse(JSON.stringify(manifest)) as RunManifest).leftAsWritten)).toEqual(new Set([...expected, { name: text, why: NEVER_WHY }]));
});
