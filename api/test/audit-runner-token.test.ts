import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { MANIFEST } from './drive-v3.js';
import { dispatchOf, pretendGitHubForFile } from './github-support.js';

const env = testEnv as unknown as Env;
const API = 'https://api.example.com';
const HOUR = 3600_000;
const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));
const gh = pretendGitHubForFile(env);

describe('audit-runner-token', () => {
  it('AC1 audit-runner-token-worker-fresh: fresh=1 mints a new token, so a revoked grant answers gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sub = `runner-sub-${crypto.randomUUID()}`;
    const p = person(sub);
    const { generation } = await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY)) });
    await p.pointFolder(generation, null, 'FOLDER_ID');
    // The cached token still has most of its hour, but Drive refused it: Google access was revoked.
    await p.cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + HOUR });
    const admitted = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: Date.now(), dailyLimit: 100, manifest: MANIFEST });
    if (!admitted.admitted) throw new Error('not admitted');
    const { ticket } = await dispatchOf(gh, admitted.run.id);
    const google: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      google.push(String(input));
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    };
    const r = await createApp({ fetchImpl }).request(`${API}/runner/runs/${admitted.run.id}/token?fresh=1`, { headers: { authorization: `Bearer ${ticket}` } }, env);
    expect(google).toHaveLength(1);
    expect(r.status).toBe(410);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('gone');
  });
});
