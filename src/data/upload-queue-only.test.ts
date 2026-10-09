import { describe, expect, it } from 'vitest';
import { FakeDrive } from './drive/fake-drive';
import { DriveHttp } from './drive/drive-http';
import { seedFakeDrive } from './fake/seed';
import { DriveVault } from './vault/drive-vault';

async function vaultOnFreshDrive(): Promise<{ drive: FakeDrive; root: string; vault: DriveVault }> {
  const drive = new FakeDrive();
  const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  return { drive, root, vault: new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true }) };
}

describe('every upload goes through the queue', () => {
  it('every upload goes through the queue: a vault given no queue still reserves an id and opens a session', async () => {
    const { drive, root, vault } = await vaultOnFreshDrive();
    const direct: string[] = [];
    const real = drive.upload.bind(drive);
    drive.upload = async (parent, name, body, onProgress, props) => {
      direct.push(name);
      return real(parent, name, body, onProgress, props);
    };
    await vault.addPile({ text: 'Receipts', items: [{ name: 'scan.pdf', kind: 'pdf', origin: 'From this computer', body: new Blob(['%PDF scan']) }] });
    await vault.settled();
    // Today: the direct path sends it (1 direct call, 0 ids reserved, 0 sessions opened).
    expect(direct).toEqual([]);
    expect(drive.resumableCalls.filter((c) => c.op === 'generateIds')).toHaveLength(1);
    const opened = drive.resumableCalls.filter((c) => c.op === 'open');
    expect(opened).toHaveLength(1);
    const made = (await drive.listAll(root)).filter((f) => f.appProperties?.asAdded === 'scan.pdf');
    expect(made.map((f) => f.id)).toEqual(opened.map((c) => ('id' in c ? c.id : '')));
  });

  it('every upload goes through the queue: DriveHttp has one upload loop, the queue\'s', () => {
    expect('upload' in DriveHttp.prototype).toBe(false);
  });
});
