import { defineConfig } from 'vitest/config';
import { workerBudget } from '../testing/workers';

// The runner's unit tests run in Node, never against real Drive or the network.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['../testing/timer-gate-setup.ts'],
    include: ['test/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/unit.json' },
    maxWorkers: workerBudget().vitest,
  },
});
