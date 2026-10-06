import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import wrangler from '../wrangler.jsonc?raw';
import { OPTIONAL_SECRETS, REQUIRED_SECRETS } from '../src/env.js';
import type { Env } from '../src/env.js';

describe('configuration', () => {
  it('requires only the secrets this stage uses (TL-P3-06)', () => {
    expect([...REQUIRED_SECRETS]).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'TOKEN_ENC_KEY']);
    expect(OPTIONAL_SECRETS).toContain('SESSION_SECRET_PREVIOUS');
  });

  it('the Worker config serves the app and the Worker from one origin', () => {
    const { APP_ORIGIN, API_ORIGIN } = testEnv as unknown as Env;
    // The logout origin check and CORS compare these two: they must be the same origin.
    expect(APP_ORIGIN).toBe(API_ORIGIN);
    // The Worker answers its own paths first, /health included.
    const runFirst = /"run_worker_first":\s*\[([^\]]*)\]/.exec(wrangler)?.[1] ?? '';
    expect(runFirst).toContain('"/health"');
    // The client id is a secret now: wrangler refuses a var and a secret of one name.
    expect(wrangler).not.toMatch(/"GOOGLE_CLIENT_ID"\s*:/);
  });
});
