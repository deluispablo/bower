import test from 'node:test';
import assert from 'node:assert/strict';
import { serve, REDIRECT } from './oauth-local.mjs';
const config = { projectId: 'synthetic-project', identityAlias: 'A', scopeSet: 'full-drive', redirectUri: REDIRECT, clientFile: '/private/local-only/client.json', sessionFile: '/private/local-only/session-A.json', remoteAuthorization: { approved: true, reference: 'LOCAL_SELF_CHECK', expiresAt: '2099-01-01T00:00:00Z' } };
test('callback document allows only self and fixed Google authorization form destination', async () => {
  const server = await serve(config, { port: 0, loadClientFn: async () => ({ client_id: 'SELF_CHECK_CLIENT.apps.googleusercontent.com' }), checkSessionFn: async () => {}, onEvent: () => {}, duration: 5000 });
  try {
    const origin = `http://localhost:${server.address().port}`;
    const landing = await fetch(origin);
    const policy = landing.headers.get('content-security-policy');
    assert.equal(policy, "default-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'");
    const cookie = landing.headers.get('set-cookie').split(';')[0];
    const csrf = /name="csrf" value="([^"]+)"/.exec(await landing.text())[1];
    const started = await fetch(`${origin}/start`, { method: 'POST', headers: { origin, cookie }, body: `csrf=${csrf}`, redirect: 'manual' });
    assert.equal(started.status, 303);
    assert.equal(new URL(started.headers.get('location')).origin, 'https://accounts.google.com');
    assert.equal(new URL(started.headers.get('location')).pathname, '/o/oauth2/v2/auth');
    assert.equal(started.headers.get('content-security-policy'), policy);
    assert.equal(started.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(started.headers.get('cache-control'), 'no-store');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
