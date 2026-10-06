import { describe, expect, it } from 'vitest';

import { OPTIONAL_SECRETS, REQUIRED_SECRETS } from '../src/env.js';

describe('configuration', () => {
  it('requires only the secrets this stage uses (TL-P3-06)', () => {
    expect([...REQUIRED_SECRETS]).toEqual(['GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'TOKEN_ENC_KEY']);
    expect(OPTIONAL_SECRETS).toContain('SESSION_SECRET_PREVIOUS');
    // The OAuth client id is a plain var, never a secret.
    expect(REQUIRED_SECRETS as readonly string[]).not.toContain('GOOGLE_CLIENT_ID');
  });
});
