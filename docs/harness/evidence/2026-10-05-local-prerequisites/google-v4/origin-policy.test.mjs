import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { serve, validateConfig, REDIRECT } from './oauth-local.mjs';

const config = { projectId: 'synthetic-project', identityAlias: 'A', scopeSet: 'full-drive', redirectUri: REDIRECT, clientFile: '/private/local-only/client.json', sessionFile: '/private/local-only/session-A.json', remoteAuthorization: { approved: true, reference: 'LOCAL_SELF_CHECK', expiresAt: '2099-01-01T00:00:00Z' } };
const policy = "default-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'";
function local(server, path, { method = 'GET', origin, cookie, body, host } = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { host: host ?? `localhost:${port}`, ...(origin === undefined ? {} : { origin }), ...(cookie ? { cookie } : {}) };
    const req = request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = ''; res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.end(body);
  });
}
async function fixture(run, extra = {}) {
  let exchanged = 0, saved = 0;
  const server = await serve(config, { port: 0, loadClientFn: async () => ({ client_id: 'SELF_CHECK_CLIENT.apps.googleusercontent.com' }), checkSessionFn: async () => {}, exchangeFn: async () => { exchanged++; return { accessToken: 'ACCESS_MARKER', refreshToken: 'REFRESH_MARKER' }; }, saveFn: async () => { saved++; }, onEvent: () => {}, duration: 5000, ...extra });
  try { await run(server, () => ({ exchanged, saved })); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
const privacy = (response) => {
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-security-policy'], policy);
  assert.doesNotMatch(response.text, /CODE_MARKER|ACCESS_MARKER|REFRESH_MARKER|SELF_CHECK_CLIENT|at serve|Error:/);
};
async function landing(server) {
  const response = await local(server, '/');
  assert.equal(response.status, 200);
  const cookie = response.headers['set-cookie'][0].split(';')[0];
  const csrf = /name="csrf" value="([^"]+)"/.exec(response.text)[1];
  return { response, cookie, csrf, origin: `http://localhost:${server.address().port}` };
}

test('only a valid plain landing sets same-origin for native POST Origin', async () => {
  await fixture(async (server) => {
    const { response } = await landing(server);
    assert.equal(response.headers['referrer-policy'], 'same-origin');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['content-security-policy'], policy);
    assert.match(response.headers['set-cookie'][0], /HttpOnly; SameSite=Lax; Path=\//);
  });
});
test('moved packet rejects both client and session paths in former v3 public evidence', () => {
  for (const key of ['clientFile', 'sessionFile']) {
    for (const path of ['/private/tmp/bower-google-probe-setup-v3', '/private/tmp/bower-google-probe-setup-v3/private-record.json']) {
      assert.throws(() => validateConfig({ ...config, [key]: path }, true));
    }
  }
});
test('invalid host query method and route retain default no-referrer', async () => {
  await fixture(async (server, calls) => {
    for (const [path, options, status] of [
      ['/?unexpected=CODE_MARKER', {}, 404], ['/', { method: 'HEAD' }, 404],
      ['/', { method: 'POST' }, 404], ['/missing?code=CODE_MARKER', {}, 404],
      ['/complete?code=CODE_MARKER', {}, 404], ['/start?unexpected=1', { method: 'POST' }, 404],
      ['/', { host: `127.0.0.1:${server.address().port}` }, 400],
    ]) {
      const response = await local(server, path, options);
      assert.equal(response.status, status); privacy(response);
    }
    assert.deepEqual(calls(), { exchanged: 0, saved: 0 });
  });
});
test('landing exception never admits null missing or other Origin and wrong cookie or CSRF', async () => {
  await fixture(async (server, calls) => {
    const { origin, cookie, csrf } = await landing(server);
    for (const headers of [{ origin: 'null', cookie }, { cookie }, { origin: 'http://example.com', cookie }, { origin, cookie: 'bower_probe_browser=OTHER' }, { origin, cookie, body: 'csrf=OTHER' }]) {
      const response = await local(server, '/start', { method: 'POST', body: `csrf=${csrf}`, ...headers });
      assert.equal(response.status, 400); privacy(response);
      assert.equal(response.headers.location, undefined);
      assert.deepEqual(calls(), { exchanged: 0, saved: 0 });
    }
    const accepted = await local(server, '/start', { method: 'POST', origin, cookie, body: `csrf=${csrf}` });
    assert.equal(accepted.status, 303); privacy(accepted);
    assert.equal(new URL(accepted.headers.location).origin, 'https://accounts.google.com');
    assert.deepEqual(calls(), { exchanged: 0, saved: 0 });
  });
});
test('start callback completion replay and refusals all keep callback query private', async () => {
  await fixture(async (server, calls) => {
    const { origin, cookie, csrf } = await landing(server);
    const started = await local(server, '/start', { method: 'POST', origin, cookie, body: `csrf=${csrf}` });
    assert.equal(started.status, 303); privacy(started);
    const authorization = new URL(started.headers.location);
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('redirect_uri'), REDIRECT);
    const state = authorization.searchParams.get('state');
    for (const query of ['state=wrong&code=CODE_MARKER', `state=${state}&state=${state}&code=CODE_MARKER`]) {
      const refused = await local(server, `/auth/callback?${query}`, { cookie });
      assert.equal(refused.status, 400); privacy(refused);
      assert.deepEqual(calls(), { exchanged: 0, saved: 0 });
    }
    const accepted = await local(server, `/auth/callback?state=${state}&code=CODE_MARKER`, { cookie });
    assert.equal(accepted.status, 303); privacy(accepted);
    assert.equal(accepted.headers.location, '/complete');
    assert.match(accepted.headers['set-cookie'][0], /Max-Age=0/);
    assert.deepEqual(calls(), { exchanged: 1, saved: 1 });
    const complete = await local(server, '/complete');
    assert.equal(complete.status, 200); privacy(complete);
    const replay = await local(server, `/auth/callback?state=${state}&code=CODE_MARKER`, { cookie });
    assert.equal(replay.status, 400); privacy(replay);
    const repeated = await local(server, '/start', { method: 'POST', origin, cookie, body: `csrf=${csrf}` });
    assert.equal(repeated.status, 400); privacy(repeated);
    assert.deepEqual(calls(), { exchanged: 1, saved: 1 });
  });
});
test('expired landing refuses before the policy exception with no exchange', async () => {
  let clock = Date.now();
  await fixture(async (server, calls) => {
    clock += 5001;
    const refused = await local(server, '/');
    assert.equal(refused.status, 400); privacy(refused);
    assert.equal(refused.headers['set-cookie'], undefined);
    assert.deepEqual(calls(), { exchanged: 0, saved: 0 });
  }, { now: () => clock });
});
