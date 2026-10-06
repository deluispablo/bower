import { FakeDrive } from '../drive/fake-drive';
import { FakeWorker } from '../fake/fake-worker';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import { makeLiveSources } from '../live';
import { describeVaultContract } from './vault-contract';

describeVaultContract('fake Drive', async () => {
  localStorage.clear();
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, 'default', Date.now());
  const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant' }), scenario: 'default', rootId });
  const live = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles() });
  return {
    sources: live,
    dispose: () => live.dispose(),
    settle: () => live.vault.settled(),
    tidyUp: async (during) => {
      await live.runs.start('all');
      await during?.();
      await live.vault.settled();
      for (let i = 0; i < 500; i++) {
        const r = await live.runs.current();
        if (r && (r.phase === 'done' || r.phase === 'failed')) return r;
        await new Promise((res) => setTimeout(res, 2));
      }
      throw new Error('the tidy-up never ended');
    },
  };
});
