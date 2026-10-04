import { vi } from 'vitest';
import { DemoWorld } from '../demo/world';
import { describeVaultContract } from './vault-contract';

describeVaultContract('demo', async () => {
  const world = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
  const sources = world.sources();
  return {
    sources,
    dispose: () => world.dispose(),
    tidyUp: async (during) => {
      vi.useFakeTimers();
      try {
        await sources.runs.start('all');
        await during?.();
        await vi.advanceTimersByTimeAsync(60_000);
        return await sources.runs.current();
      } finally {
        vi.useRealTimers();
      }
    },
  };
});
