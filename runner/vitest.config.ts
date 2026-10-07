import { defineConfig } from 'vitest/config';

// The runner's unit tests run in Node, never against real Drive or the network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/unit.json' },
  },
});
