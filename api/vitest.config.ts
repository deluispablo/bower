import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Fixture values only, never real secrets: they exist for the workerd tests.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: 'test-google-client-id',
          GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
          SESSION_SECRET: 'test-session-secret-at-least-32-bytes-long',
          // base64 of 32 zero bytes: a fixture, not a real key.
          TOKEN_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          GITHUB_TOKEN: 'test-github-token',
        },
      },
    }),
  ],
  // A JSON report of the run goes to test-results/unit.json.
  test: {
    // No api test reaches the network (test/no-network.ts; https://vitest.dev/config/#setupfiles).
    setupFiles: ['./test/no-network.ts', './test/no-rate-limit-bindings.ts', '../testing/timer-gate-setup.ts'],
    // A person object that refuses newer storage resets itself on purpose; workerd reports that
    // reset as an unhandled rejection (test/person.test.ts). Only that one is let through.
    onUnhandledError: (error) => !/newer than this build/.test(String((error as Error).message ?? error)),
    reporters: ['default', 'json'], outputFile: { json: 'test-results/unit.json' },
    // Half the cores, so a full run leaves the machine usable (https://vitest.dev/config/#maxworkers).
    maxWorkers: '50%',
  },
});
