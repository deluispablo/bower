import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { request } from 'node:http';
import { challenge, validateConfig, startFlow, acceptCallback, validateIdToken, checkedGrant, safeEvent, serve, REDIRECT, SCOPES } from './oauth-local.mjs';
import { loadAdapters, readOnlyFetch } from './adapter.mjs';

const config = { projectId: 'synthetic-project', identityAlias: 'A', scopeSet: 'full-drive', redirectUri: REDIRECT, clientFile: '/private/local-only/client.json', sessionFile: '/private/local-only/session-A.json', remoteAuthorization: { approved: true, reference: 'DETERMINISTIC_SELF_CHECK_ONLY', expiresAt: '2099-01-01T00:00:00Z' } };
const clientId = 'SELF_CHECK_CLIENT.apps.googleusercontent.com';
const manifest = { allowedIds: { ROOT_A: 'SYNTHETIC_ROOT_A', TEXT_A: 'SYNTHETIC_FILE_A' }, limits: { requests: 2, minutes: 1, responseBytes: 1024 } };

test('configuration refuses missing authorization, extra scope and non-loopback redirect', () => {
  assert.equal(validateConfig(config, true), config);
  for (const bad of [{ ...config, remoteAuthorization: { approved: false } }, { ...config, scopeSet: 'all-scopes' }, { ...config, redirectUri: 'https://example.com/callback' }, { ...config, clientFile: '/Users/deluisp/Projects/bower-app/private.json' }, { ...config, sessionFile: '/private/tmp/bower-google-probe-setup/token.json' }]) assert.throws(() => validateConfig(bad, true));
});
test('PKCE S256 matches the fixed protocol vector and authorization URL omits secrets', () => {
  assert.equal(challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const { flow, url } = startFlow(config, clientId, 'LOCAL_BROWSER');
  const u = new URL(url);
  assert.equal(u.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(u.searchParams.get('code_challenge'), challenge(flow.verifier));
  assert.equal(u.searchParams.get('scope'), SCOPES['full-drive'].join(' '));
  assert.equal(u.searchParams.has('client_secret'), false);
  assert.equal(url.includes(flow.verifier), false);
});
test('callback refuses wrong state/browser, expired state, duplicates and replay', () => {
  const { flow } = startFlow(config, clientId, 'LOCAL_BROWSER', 1000);
  assert.throws(() => acceptCallback(flow, new URLSearchParams({ state: 'wrong', code: 'CODE_MARKER' }), 'LOCAL_BROWSER', 1001));
  assert.throws(() => acceptCallback(flow, new URLSearchParams({ state: flow.state, code: 'CODE_MARKER' }), 'other', 1001));
  assert.throws(() => acceptCallback(flow, new URLSearchParams({ state: flow.state, code: 'CODE_MARKER' }), 'LOCAL_BROWSER', flow.expires));
  assert.throws(() => acceptCallback(flow, new URLSearchParams(`state=${flow.state}&state=${flow.state}&code=x`), 'LOCAL_BROWSER', 1001));
  assert.equal(acceptCallback(flow, new URLSearchParams({ state: flow.state, code: 'CODE_MARKER' }), 'LOCAL_BROWSER', 1001), 'CODE_MARKER');
  assert.throws(() => acceptCallback(flow, new URLSearchParams({ state: flow.state, code: 'CODE_MARKER' }), 'LOCAL_BROWSER', 1001));
});
test('identity signature/audience/issuer/nonce/expiry validate with generated local keys', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'LOCAL_KEY' }] };
  const claims = { iss: 'https://accounts.google.com', aud: clientId, exp: 2000, iat: 500, sub: 'LOCAL_SYNTHETIC_SUBJECT', nonce: 'NONCE_MARKER' };
  const jwt = (c) => {
    const text = [JSON.stringify({ alg: 'RS256', kid: 'LOCAL_KEY' }), JSON.stringify(c)].map((s) => Buffer.from(s).toString('base64url')).join('.');
    return `${text}.${sign('RSA-SHA256', Buffer.from(text), privateKey).toString('base64url')}`;
  };
  assert.equal(validateIdToken(jwt(claims), clientId, claims.nonce, jwks, 1_000_000), claims.sub);
  for (const c of [{ ...claims, aud: 'OTHER_CLIENT' }, { ...claims, iss: 'other' }, { ...claims, nonce: 'other' }, { ...claims, exp: 900 }]) assert.throws(() => validateIdToken(jwt(c), clientId, claims.nonce, jwks, 1_000_000));
  assert.throws(() => validateIdToken(`${jwt(claims)}x`, clientId, claims.nonce, jwks, 1_000_000));
});
test('scope validation refuses partial or inherited broader grants', () => {
  const body = { access_token: 'ACCESS_MARKER', token_type: 'Bearer', expires_in: 3600, scope: SCOPES['full-drive'].join(' ') };
  assert.equal(checkedGrant(body, 'full-drive').accessToken, body.access_token);
  assert.throws(() => checkedGrant({ ...body, scope: 'openid' }, 'full-drive'));
  assert.throws(() => checkedGrant(body, 'file-comparison'));
  assert.throws(() => checkedGrant({ ...body, scope: `${body.scope} email` }, 'full-drive'));
});
test('sanitized event channel rejects arbitrary values rather than printing secret-bearing data', () => {
  assert.deepEqual(JSON.parse(safeEvent('authorization_saved', 'A')), { event: 'authorization_saved', identityAlias: 'A' });
  assert.throws(() => safeEvent('https://example.com/?code=CODE_MARKER', 'A'));
  assert.throws(() => safeEvent('refused', 'ACCESS_MARKER too long'));
});
test('loopback callback flow binds a browser, redirects cleanly and never calls Google', async () => {
  const events = [];
  let exchanged = 0, saved = 0;
  const server = await serve(config, { port: 0, loadClientFn: async () => ({ client_id: clientId }), checkSessionFn: async () => undefined, exchangeFn: async () => { exchanged++; return { accessToken: 'ACCESS_MARKER', refreshToken: 'REFRESH_MARKER' }; }, saveFn: async () => { saved++; }, onEvent: (e) => events.push(e), duration: 5000 });
  try {
    assert.equal(server.address().address, '127.0.0.1');
    const origin = `http://localhost:${server.address().port}`;
    const landing = await fetch(origin);
    const cookie = landing.headers.get('set-cookie').split(';')[0];
    const form = await landing.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(form)[1];
    const evil = await fetch(`${origin}/start`, { method: 'POST', headers: { cookie, origin: 'http://example.com' }, body: `csrf=${csrf}`, redirect: 'manual' });
    assert.equal(evil.status, 400); assert.equal(exchanged, 0);
    const start = await fetch(`${origin}/start`, { method: 'POST', headers: { cookie, origin }, body: `csrf=${csrf}`, redirect: 'manual' });
    assert.equal(start.status, 303);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const refused = await fetch(`${origin}/auth/callback?code=CODE_MARKER&state=wrong`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(refused.status, 400); assert.equal(exchanged, 0);
    const accepted = await fetch(`${origin}/auth/callback?code=CODE_MARKER&state=${state}`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(accepted.status, 303); assert.equal(accepted.headers.get('location'), '/complete');
    assert.equal(exchanged, 1); assert.equal(saved, 1);
    const replay = await fetch(`${origin}/auth/callback?code=CODE_MARKER&state=${state}`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(replay.status, 400); assert.equal(exchanged, 1);
    const repeated = await fetch(`${origin}/start`, { method: 'POST', headers: { cookie, origin }, body: `csrf=${csrf}`, redirect: 'manual' });
    assert.equal(repeated.status, 400); assert.equal(exchanged, 1);
    assert.equal(events.join('').includes('MARKER'), false);
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    assert.equal(accepted.headers.get('referrer-policy'), 'no-referrer');
    // Node fetch normalizes Host; use an actual HTTP request to test the forged header.
    const forged = await new Promise((yes, no) => {
      const req = request(origin, { headers: { host: 'example.com' } }, (res) => { res.resume(); yes(res.statusCode); });
      req.on('error', no); req.end();
    });
    assert.equal(forged, 400);
  } finally { await new Promise((yes) => server.close(yes)); }
});
test('resource guard refuses unrelated IDs, broad queries, writes, URLs and exhaustion', async () => {
  let calls = 0;
  const gate = readOnlyFetch(manifest, async () => { calls++; return new Response('{}'); }, () => {}, config);
  for (const [url, init] of [['https://example.com/x', {}], ['https://www.googleapis.com/drive/v3/files/OTHER', {}], ['https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse', {}], ['https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A', { method: 'PATCH' }], ['https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A?access_token=ACCESS_MARKER', {}]]) await assert.rejects(gate(url, init));
  assert.equal(calls, 0);
  await gate('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A');
  await gate("https://www.googleapis.com/drive/v3/files?q='SYNTHETIC_ROOT_A'%20in%20parents%20and%20trashed%20%3D%20false");
  await assert.rejects(gate('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A'));
  assert.equal(calls, 2);
});
test('response body limit is enforced and secret response headers are absent', async () => {
  const gate = readOnlyFetch(manifest, async () => new Response('x'.repeat(1025)), () => {}, config);
  await assert.rejects(gate('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A'));
  const safe = readOnlyFetch(manifest, async () => new Response('{}', { headers: { location: 'SECRET_SESSION_URI', 'set-cookie': 'COOKIE_MARKER', etag: 'validator' } }), () => {}, config);
  const res = await safe('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A');
  assert.equal(res.headers.get('location'), null); assert.equal(res.headers.get('set-cookie'), null); assert.equal(res.headers.get('etag'), 'validator');
});
test('actual immutable app and legacy adapters load with deterministic synthetic transport', async () => {
  const { DriveHttp, createDriveApi, hashes } = loadAdapters();
  assert.equal(Object.keys(hashes).length, 5);
  const file = { id: 'SYNTHETIC_FILE_A', name: 'Synthetic.md', mimeType: 'text/markdown', parents: ['SYNTHETIC_ROOT_A'], modifiedTime: '2026-10-05T00:00:00Z', createdTime: '2026-10-05T00:00:00Z' };
  let calls = 0;
  const f = async (_url, init) => { assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ACCESS_MARKER'); calls++; return new Response(JSON.stringify(file)); };
  const app = new DriveHttp({ token: async () => 'ACCESS_MARKER', fetch: f });
  assert.equal((await app.get(file.id)).id, file.id);
  const old = createDriveApi('ACCESS_MARKER', f);
  assert.equal((await old.getFile(file.id)).id, file.id);
  assert.equal(calls, 2);
});
test('actual adapter error diagnostics do not expose token or ID-bearing paths', async () => {
  const events = [];
  const { DriveHttp } = loadAdapters((e) => events.push(e));
  const api = new DriveHttp({ token: async () => 'ACCESS_MARKER', fetch: async () => new Response('{}', { status: 403 }) });
  await assert.rejects(api.get('PRIVATE_RESOURCE_MARKER'));
  assert.deepEqual(events, [{ event: 'adapter_diagnostic' }]);
  assert.equal(JSON.stringify(events).includes('MARKER'), false);
});
