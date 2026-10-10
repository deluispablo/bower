import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from './drive-vault';
import { sha256 } from './hashes';

beforeEach(() => vi.setSystemTime(new Date('2026-10-10T12:00:00Z')));
afterEach(() => vi.useRealTimers());

describe('telling a file you already have', () => {
  it('sha256 of a known blob', async () => {
    expect(await sha256(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('duplicates finds a match from hashes.json', async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    const leaseId = (await drive.listAll(root)).find((f) => f.name === 'Lease draft.pdf')?.id ?? '';
    const same = new Blob([await drive.readText(leaseId)]);
    const out = await vault.duplicates([
      { name: 'renamed copy.pdf', body: same },
      { name: 'new.pdf', body: new Blob(['something else']) },
      { name: 'no body.pdf' },
    ]);
    expect(out).toEqual(['Projects/Flat hunt/Lease draft.pdf', null, null]);
  });
});
