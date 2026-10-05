import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { validateConfig, startFlow, REDIRECT, serve } from './oauth-local.mjs';
const EXISTING_CALLBACK = 'http://localhost:8788/auth/callback';
const config = { projectId: 'synthetic-project', identityAlias: 'A', scopeSet: 'full-drive', redirectUri: EXISTING_CALLBACK, clientFile: '/private/local-only/client.json', sessionFile: '/private/local-only/session-A.json', remoteAuthorization: { approved: true, reference: 'LOCAL_SELF_CHECK', expiresAt: '2099-01-01T00:00:00Z' } };
const clientId = 'SELF_CHECK_CLIENT.apps.googleusercontent.com';
function localRequest(server, path, { method = 'GET', host, origin, cookie, body } = {}) {
  return new Promise((yes, no) => {
    const port = server.address().port;
    const headers = { host: host ?? `localhost:${port}`, ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) };
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = ''; res.on('data', (chunk) => { text += chunk; }); res.on('end', () => yes({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', no); req.end(body);
  });
}

test('reused existing callback is the only accepted redirect and exact authorization target', () => {
  assert.doesNotThrow(() => validateConfig(config, true));
  assert.equal(REDIRECT, EXISTING_CALLBACK);
  assert.equal(validateConfig(config, true), config);
  const { url } = startFlow(config, clientId, 'LOCAL_BROWSER');
  assert.equal(new URL(url).searchParams.get('redirect_uri'), EXISTING_CALLBACK);
  for (const redirectUri of ['http://127.0.0.1:53682/oauth/callback', 'http://127.0.0.1:8788/auth/callback', 'http://localhost:8788/auth/callback/', 'http://localhost:8788/oauth/callback', 'http://localhost:8789/auth/callback', 'http://localhost.example:8788/auth/callback']) assert.throws(() => validateConfig({ ...config, redirectUri }, true));
});
test('fixed localhost host origin and callback path retain browser binding and strict refusal', async () => {
  let exchanged = 0, saved = 0;
  const server = await serve(config, { port: 0, loadClientFn: async () => ({ client_id: clientId }), checkSessionFn: async () => {}, exchangeFn: async () => { exchanged++; return {}; }, saveFn: async () => { saved++; }, onEvent: () => {}, duration: 5000 });
  try {
    const port = server.address().port, origin = `http://localhost:${port}`;
    assert.equal(server.address().address, '127.0.0.1');
    for (const host of [`127.0.0.1:${port}`, `localhost.example:${port}`, `localhost:${port + 1}`, 'localhost', `LOCALHOST:${port}`]) assert.equal((await localRequest(server, '/', { host })).status, 400);
    const landing = await localRequest(server, '/'); assert.equal(landing.status, 200);
    const cookie = landing.headers['set-cookie'][0].split(';')[0];
    assert.match(landing.headers['set-cookie'][0], /HttpOnly; SameSite=Lax; Path=\//);
    const csrf = /name="csrf" value="([^"]+)"/.exec(landing.text)[1];
    for (const badOrigin of [`http://127.0.0.1:${port}`, `https://localhost:${port}`, `${origin}.example`, `http://localhost:${port + 1}`, 'null']) {
      assert.equal((await localRequest(server, '/start', { method: 'POST', origin: badOrigin, cookie, body: `csrf=${csrf}` })).status, 400);
      assert.equal(exchanged, 0);
    }
    assert.equal((await localRequest(server, '/start', { method: 'POST', cookie, body: `csrf=${csrf}` })).status, 400);
    assert.equal((await localRequest(server, '/start', { method: 'POST', origin, cookie: 'bower_probe_browser=OTHER', body: `csrf=${csrf}` })).status, 400);
    assert.equal((await localRequest(server, '/start', { method: 'POST', origin, cookie, body: 'csrf=OTHER' })).status, 400);
    const started = await localRequest(server, '/start', { method: 'POST', origin, cookie, body: `csrf=${csrf}` });
    assert.equal(started.status, 303);
    assert.equal(new URL(started.headers.location).searchParams.get('redirect_uri'), EXISTING_CALLBACK);
    const state = new URL(started.headers.location).searchParams.get('state');
    for (const path of ['/oauth/callback', '/auth/callback/', '/auth/callback/extra']) assert.equal((await localRequest(server, `${path}?state=${state}&code=CODE_MARKER`, { cookie })).status, 404);
    assert.equal(exchanged, 0);
    assert.equal((await localRequest(server, `/auth/callback?state=${state}&code=CODE_MARKER`, { cookie: 'bower_probe_browser=OTHER' })).status, 400);
    assert.equal(exchanged, 0);
    const accepted = await localRequest(server, `/auth/callback?state=${state}&code=CODE_MARKER`, { cookie });
    assert.equal(accepted.status, 303); assert.equal(accepted.headers.location, '/complete');
    assert.equal(exchanged, 1); assert.equal(saved, 1);
    assert.equal((await localRequest(server, `/auth/callback?state=${state}&code=CODE_MARKER`, { cookie })).status, 400);
    assert.equal(exchanged, 1);
  } finally { await new Promise((yes) => server.close(yes)); }
});
test('private client and session paths exclude previous and current public packet directories', () => {
  for (const prefix of ['/private/tmp/bower-google-probe-setup', '/private/tmp/bower-google-probe-setup-v2', '/private/tmp/bower-google-probe-setup-v3', '/private/tmp/bower-google-probe-setup-v4']) {
    for (const key of ['clientFile', 'sessionFile']) assert.throws(() => validateConfig({ ...config, [key]: `${prefix}/private-record.json` }, true));
  }
});
