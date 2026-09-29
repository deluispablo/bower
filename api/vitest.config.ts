import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Fixture values only — never real secrets. `[vars]` in wrangler.toml
// supplies the vars; the secrets below exist only for these workerd tests,
// so `/health` (and anything else in `SELF.fetch`) sees a fully valid Env.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: 'test-google-client-id',
          GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
          SESSION_SECRET: 'test-session-secret',
          // base64 of 32 zero bytes — a fixture, not a real key.
          TOKEN_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          GITHUB_TOKEN: 'test-github-token',
          ADMIN_KEY: 'test-admin-key',
          VAPID_PUBLIC_KEY: 'test-vapid-public-key',
          VAPID_PRIVATE_KEY: 'test-vapid-private-key',
        },
      },
    }),
  ],
});
