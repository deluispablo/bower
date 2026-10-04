import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import type { Sources } from '../sources';
import { describeVaultContract } from './vault-contract';

const notYet = (): never => {
  throw new Error('Not built yet');
};

describeVaultContract(
  'fake Drive',
  async () => {
    localStorage.clear();
    const drive = new FakeDrive();
    const rootId = await seedFakeDrive(drive, 'default', Date.now());
    if (!rootId) throw new Error('no folder');
    const vault = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set() });
    // Session and runs arrive with the Worker (Task 10); nothing here touches them yet.
    const sources = { vault } as unknown as Sources;
    return { sources, dispose: () => vault.dispose(), tidyUp: async () => notYet() };
  },
  { skip: ['inbox', 'bower', 'tidy'] },
);
