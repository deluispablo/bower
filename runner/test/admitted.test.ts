import { describe, expect, it } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { RunnerDrive } from '../src/drive';
import { takeAdmitted } from '../src/spine/admitted';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';

async function admittedFolder() {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  const bower = (await drive.createFolder(root, '.bower')).id;
  await drive.createFolder(bower, 'changes');
  const papers = await drive.createFolder(inbox, 'Papers', { pile: 'p-papers' });
  const scan = await drive.createText(papers.id, 'scan.pdf', '%PDF scan');
  await drive.createText(papers.id, 'Pile note.md', 'Papers from Alex');
  const receipt = await drive.createText(inbox, 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => 1, newId: () => 'admission-1' });
  if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
  const wire = driveV3(drive);
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  return { drive, wire, manifest: admission.manifest, adapter: new RunnerDrive({ token, attempt: 1, fetch: wire.fetch }), scan, receipt };
}

describe('the runner takes what was admitted', () => {
  it('an item changed since admission waits for the next run', async () => {
    const { drive, manifest, adapter, scan, receipt } = await admittedFolder();
    expect(manifest.piles.map((p) => p.pileId)).toEqual(['p-papers', 'p-receipt']);
    // Changed elsewhere after the Worker admitted the run.
    drive.touch(scan.id);

    const out = await takeAdmitted(manifest, adapter);

    // Its pile waits whole for the next run, never a failure; the rest is taken as admitted.
    expect(out.deferred).toEqual(expect.arrayContaining([{ fileId: scan.id, pileId: 'p-papers', why: 'changed' }]));
    expect(out.deferred.every((d) => d.pileId === 'p-papers')).toBe(true);
    expect(out.taken.piles.map((p) => p.pileId)).toEqual(['p-receipt']);
    expect(out.taken.piles[0]?.items.map((i) => i.fileId)).toEqual([receipt.id]);
    expect(out.taken).toMatchObject({ id: manifest.id, rootId: manifest.rootId, scope: 'all' });
  });

  it('an item gone or moved since admission waits too', async () => {
    const { drive, manifest, adapter, scan, receipt } = await admittedFolder();
    await drive.trash(receipt.id);
    await drive.update(scan.id, { name: 'renamed.pdf' });
    const out = await takeAdmitted(manifest, adapter);
    expect(out.taken.piles).toEqual([]);
    expect(out.deferred).toEqual(expect.arrayContaining([
      { fileId: receipt.id, pileId: 'p-receipt', why: 'gone' },
      { fileId: scan.id, pileId: 'p-papers', why: 'changed' },
    ]));
  });
});
