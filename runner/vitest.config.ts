import { defineConfig } from 'vitest/config';

// The runner's unit tests run in Node, never against real Drive or the network.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['../testing/timer-gate-setup.ts'],
    include: ['test/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/unit.json' },
    // Half the cores, so a full run leaves the machine usable (https://vitest.dev/config/#maxworkers).
    maxWorkers: '50%',
  },
});
