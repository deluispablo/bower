/** The report says each new folder a tidy-up made, once per new branch (qa-live-claude-F9-folder FF-1..FF-7). */
import { describe, expect, it } from 'vitest';
import type { EffectEvidence, Outcome } from '../contracts/run-checkpoint';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { landedSummary } from '@/features/tidy/run-words';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { materialize } from './report';
import { modelDecisions, planScripted, runKeys, type Placement } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-folder-words';
const WORDS = 'Alex takes a pottery class on Tuesdays.';
const evidence: EffectEvidence = { file: { fileId: 'FILE_ID', name: 'Thing', parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'fake-stored' };

type Setup = { things?: Placement[]; words?: Placement; exists?: string[]; areas?: [string, string][]; refuseFirstThing?: boolean };

/** Link things (one pile each) and a pile of words, filed as `setup` says, then settled; the report's rows and card. */
async function filed({ things = [], words, exists = [], areas = [], refuseFirstThing = false }: Setup) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const ensure = async (path: string): Promise<void> => {
    let parent = root;
    let at = '';
    for (const part of path.split('/')) {
      at = at ? `${at}/${part}` : part;
      const all = await drive.listAll(root);
      const found = all.find((f) => f.folder && drive.pathOf(f.id, root) === at);
      parent = found?.id ?? (await drive.createFolder(parent, part)).id;
    }
  };
  for (const path of exists) await ensure(path);
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A' });
  for (const [i] of things.entries()) await vault.addPile({ text: '', items: [{ name: `Link ${i}`, kind: 'link', origin: 'A link you pasted', url: `https://bowerbirds.example/${i}` }] });
  if (words) await vault.addPile({ text: WORDS, items: [] });
  await vault.settled();
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-folder' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const taken = admission.manifest;
  let n = 0;
  const plan = await planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken,
    mintKey: await runKeys(RUN), decisions: modelDecisions({
      thing: () => { const t = things[n]; n += 1; return t ? { ...t, name: `${n}-${t.name}` } : null; },
      words: () => words ?? null,
      areas: new Map(areas) }) });
  const members = new Set(plan.manifest.capture.members.map((m) => m.file.fileId));
  const first = refuseFirstThing ? plan.manifest.operations.find((o) => o.effect.kind === 'move' && members.has(o.effect.before.fileId))?.operationId : undefined;
  const rejected = new Set<string>();
  for (const op of plan.manifest.operations) if (op.operationId === first || op.dependsOn.some((id) => rejected.has(id))) rejected.add(op.operationId);
  const outcomes = plan.manifest.operations.map((op): Outcome => (rejected.has(op.operationId)
    ? { operationId: op.operationId, state: 'rejected', failure: { code: 'conflict', message: "It couldn't be filed this time." } }
    : { operationId: op.operationId, state: 'applied', evidence }));
  const report = materialize(plan.manifest, 'a'.repeat(64), outcomes)?.report;
  if (!report) throw new Error('no report');
  const card = landedSummary({ id: RUN, scope: 'all', phase: 'done', requestedAt: AT, phaseAt: AT, finishedAt: AT, seen: false, report });
  return { rows: report.filed, card };
}

const pdf = (to: string): Placement => ({ to, name: 'Link.url' });
const POTTERY = 'New folder Pottery class in Resources';
const GARDEN = 'New folder Garden in Projects';

describe('each new folder a tidy-up made is said once per new branch', () => {
  it('FF-1 F9F words-row: a words pile filed into a new folder says the folder', async () => {
    const { rows } = await filed({ words: { to: 'Resources/Pottery class', name: 'Pottery class.md' } });
    expect(rows.map((r) => ({ name: r.name, area: r.area }))).toEqual([{ name: 'Your note', area: POTTERY }]);
  });

  it('FF-2 F9F outermost-only: two things into a new branch both say the branch root, never its deeper folder', async () => {
    const { rows } = await filed({ things: [pdf('Projects/Garden/Seeds'), pdf('Projects/Garden/Seeds')], exists: ['Projects'] });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.area)).toEqual([GARDEN, GARDEN]);
    expect(rows.some((r) => r.area?.includes('Seeds'))).toBe(false);
  });

  it('FF-3 F9F thing-and-words-once: a thing and words into one new folder both carry it; the card says it once', async () => {
    const { rows, card } = await filed({ things: [pdf('Resources/Pottery class')], words: { to: 'Resources/Pottery class', name: 'Pottery class.md' } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.area)).toEqual([POTTERY, POTTERY]);
    expect(card.split(POTTERY)).toHaveLength(2);
  });

  it('FF-4 F9F subfolder-of-existing: a new folder in an existing Area says its parent', async () => {
    const { rows } = await filed({ things: [pdf('Areas/Money/Statements')], exists: ['Areas/Money'] });
    expect(rows.map((r) => r.area)).toEqual(['New folder Statements in Money']);
  });

  it('FF-5 F9F month-folder: a new month folder is said as a month, never as its name', async () => {
    const { rows } = await filed({ things: [pdf('Areas/Money/Receipts/2026-11')], exists: ['Areas/Money/Receipts'] });
    expect(rows.map((r) => r.area)).toEqual(['New folder November 2026 receipts']);
  });

  it('FF-6 F9F first-rejected: the first filing refused, the one that landed still says the new folder', async () => {
    const { rows } = await filed({ things: [pdf('Projects/Garden/Seeds'), pdf('Projects/Garden/Seeds')], exists: ['Projects'], refuseFirstThing: true });
    expect(rows.map((r) => r.area)).toEqual([GARDEN]);
  });

  it('FF-6 F9F first-rejected-area: as above into a new Area with a responsibility, the surviving row says the new area', async () => {
    const { rows } = await filed({ things: [pdf('Areas/Finance'), pdf('Areas/Finance')], areas: [['Areas/Finance', 'pay and tax records']], refuseFirstThing: true });
    expect(rows.map((r) => r.area)).toEqual(['New area Finance, for pay and tax records']);
  });

  it('FF-7 F9F area-and-existing (guard): a new Area with a responsibility keeps its sentence; an existing folder has no area', async () => {
    const { rows } = await filed({ things: [pdf('Areas/Finance'), pdf('Resources')], areas: [['Areas/Finance', 'pay and tax records']] });
    expect(rows.filter((r) => r.to === 'Areas/Finance').map((r) => r.area)).toEqual(['New area Finance, for pay and tax records']);
    const resources = rows.filter((r) => r.to === 'Resources');
    expect(resources).toHaveLength(1);
    expect('area' in (resources[0] ?? {})).toBe(false);
  });
});
