import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, startFlow, exchange, tokenProvider, validateConfig, REDIRECT, SCOPES } from './oauth-local.mjs';
import { readOnlyFetch, loadAdapters } from './adapter.mjs';

const clientId = 'SELF_CHECK_CLIENT.apps.googleusercontent.com';
const base = { projectId: 'synthetic-project', identityAlias: 'A', scopeSet: 'full-drive', redirectUri: REDIRECT, clientFile: '/private/local-only/client.json', sessionFile: '/private/local-only/session-A.json', remoteAuthorization: { approved: true, reference: 'LOCAL_SELF_CHECK', expiresAt: '2099-01-01T00:00:00Z' } };
const configAt = (expires) => ({ ...base, remoteAuthorization: { ...base.remoteAuthorization, expiresAt: new Date(expires).toISOString() } });
const manifest = { allowedIds: { ROOT_A: 'SYNTHETIC_ROOT_A', TEXT_A: 'SYNTHETIC_FILE_A' }, limits: { requests: 4, minutes: 1, responseBytes: 1024 } };
const validSession = { clientId, projectId: base.projectId, identityAlias: 'A', scopeSet: 'full-drive', accessToken: 'ACCESS_MARKER', refreshToken: 'REFRESH_MARKER', expiresAt: Date.now() + 3_600_000, subject: 'SYNTHETIC_VERIFIED_SUBJECT_A', grantedScopes: [...SCOPES['full-drive']] };

async function withServer(c, now, run) {
  let exchanged = 0, saved = 0;
  const server = await serve(c, { now, port: 0, duration: 5000, loadClientFn: async () => ({ client_id: clientId }), checkSessionFn: async () => {}, exchangeFn: async () => { exchanged++; return validSession; }, saveFn: async () => { saved++; }, onEvent: () => {} });
  try {
    const origin = `http://localhost:${server.address().port}`;
    const landing = await fetch(origin);
    const cookie = landing.headers.get('set-cookie').split(';')[0];
    const csrf = /name="csrf" value="([^"]+)"/.exec(await landing.text())[1];
    const start = () => fetch(`${origin}/start`, { method: 'POST', headers: { origin, cookie }, body: `csrf=${csrf}`, redirect: 'manual' });
    const callback = (state) => fetch(`${origin}/auth/callback?state=${state}&code=CODE_MARKER`, { headers: { cookie }, redirect: 'manual' });
    await run({ origin, start, callback, counts: () => ({ exchanged, saved }) });
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function withSession(session, run) {
  const dir = await mkdtemp(join(tmpdir(), 'bower-local-session-test-'));
  const config = { ...base, clientFile: join(dir, 'client.json'), sessionFile: join(dir, 'session.json') };
  await writeFile(config.clientFile, JSON.stringify({ web: { project_id: base.projectId, client_id: clientId, client_secret: 'SYNTHETIC_SECRET_MARKER', redirect_uris: [REDIRECT] } }), { mode: 0o600 });
  await writeFile(config.sessionFile, JSON.stringify(session), { mode: 0o600 });
  try { await run(config); } finally { await rm(dir, { recursive: true }); }
}

test('authorization guard refuses nonboolean flags and blank references', () => {
  for (const approved of ['false', 'true', 1, {}, []]) assert.throws(() => validateConfig({ ...base, remoteAuthorization: { ...base.remoteAuthorization, approved } }, true));
  for (const reference of [' ', '\n', 123, {}]) assert.throws(() => validateConfig({ ...base, remoteAuthorization: { ...base.remoteAuthorization, reference } }, true));
});
test('new flow refuses expired authorization and caps callback lifetime', () => {
  const now = Date.now(), c = configAt(now + 1000);
  const { flow } = startFlow(c, clientId, 'LOCAL_BROWSER', now);
  assert.equal(flow.expires, now + 1000);
  assert.throws(() => startFlow(c, clientId, 'LOCAL_BROWSER', now + 1000));
});
test('expiry after server startup refuses later authorization redirect', async () => {
  let now = Date.now(); const expires = now + 60_000;
  await withServer(configAt(expires), () => now, async ({ start, counts }) => {
    now = expires;
    const res = await start();
    assert.equal(res.status, 400); assert.equal(res.headers.get('location'), null);
    assert.deepEqual(counts(), { exchanged: 0, saved: 0 });
  });
});
test('expiry after start refuses callback before exchange dispatch', async () => {
  let now = Date.now(); const expires = now + 60_000;
  await withServer(configAt(expires), () => now, async ({ start, callback, counts }) => {
    const started = await start(); assert.equal(started.status, 303);
    const state = new URL(started.headers.get('location')).searchParams.get('state');
    now = expires;
    assert.equal((await callback(state)).status, 400);
    assert.deepEqual(counts(), { exchanged: 0, saved: 0 });
  });
});
test('expiry before token exchange prevents credential dispatch', async () => {
  let now = Date.now(); const expires = now + 60_000, c = configAt(expires);
  const { flow } = startFlow(c, clientId, 'LOCAL_BROWSER', now); now = expires;
  let calls = 0;
  await assert.rejects(exchange(c, { client_id: clientId, client_secret: 'SYNTHETIC_SECRET_MARKER' }, flow, 'CODE_MARKER', async () => { calls++; return new Response('{}', { status: 400 }); }, () => now));
  assert.equal(calls, 0);
});
test('issued token reply after expiry cannot initiate key retrieval', async () => {
  let now = Date.now(); const expires = now + 60_000, c = configAt(expires);
  const { flow } = startFlow(c, clientId, 'LOCAL_BROWSER', now);
  let calls = 0;
  await assert.rejects(exchange(c, { client_id: clientId, client_secret: 'SYNTHETIC_SECRET_MARKER' }, flow, 'CODE_MARKER', async () => {
    calls++; now = expires;
    return new Response(JSON.stringify({ access_token: 'ACCESS_MARKER', refresh_token: 'REFRESH_MARKER', id_token: 'LOCAL_INVALID_ID_TOKEN', token_type: 'Bearer', expires_in: 3600, scope: SCOPES['full-drive'].join(' ') }));
  }, () => now));
  assert.equal(calls, 1);
});
test('authorization expiry refuses next real adapter retry after one issued response', async () => {
  let now = Date.now(); const expires = now + 60_000, c = configAt(expires);
  let calls = 0;
  const transport = readOnlyFetch(manifest, async () => { calls++; now = expires; return calls === 1 ? new Response(null, { status: 429 }) : new Response(JSON.stringify({ id: 'SYNTHETIC_FILE_A', name: 'Synthetic.md', mimeType: 'text/markdown', parents: ['SYNTHETIC_ROOT_A'] })); }, () => {}, c, () => now);
  const { DriveHttp } = loadAdapters(() => {});
  const api = new DriveHttp({ token: async () => 'ACCESS_MARKER', fetch: transport });
  await assert.rejects(api.get('SYNTHETIC_FILE_A'));
  assert.equal(calls, 1);
});
test('read transport refuses missing authorization and accepts prior issued reply without rollback claim', async () => {
  let calls = 0, now = Date.now(); const expires = now + 60_000;
  const noPacket = readOnlyFetch(manifest, async () => { calls++; return new Response('{}'); });
  await assert.rejects(noPacket('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A')); assert.equal(calls, 0);
  const gate = readOnlyFetch(manifest, async () => { calls++; now = expires; return new Response('issued reply'); }, () => {}, configAt(expires), () => now);
  assert.equal(await (await gate('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A')).text(), 'issued reply');
  await assert.rejects(gate('https://www.googleapis.com/drive/v3/files/SYNTHETIC_FILE_A')); assert.equal(calls, 1);
});
test('malformed saved-session fields refuse token reuse and refresh with zero dispatch', async () => {
  const damaged = [null, {}, { ...validSession, accessToken: '' }, { ...validSession, accessToken: 5 }, { ...validSession, refreshToken: '' }, { ...validSession, expiresAt: '2099' }, { ...validSession, subject: '' }, { ...validSession, subject: ' ' }, { ...validSession, subject: 7 }, { ...validSession, subject: 'x'.repeat(256) }, { ...validSession, grantedScopes: [...validSession.grantedScopes, 'email'] }, { ...validSession, grantedScopes: ['openid'] }, { ...validSession, grantedScopes: null }, { ...validSession, grantedScopes: [...validSession.grantedScopes, 'openid'] }];
  for (const session of damaged) await withSession(session, async (config) => {
    let calls = 0;
    await assert.rejects(async () => { const token = await tokenProvider(config, async () => { calls++; return new Response('{}'); }); await token(false); });
    assert.equal(calls, 0);
    await assert.rejects(async () => { const token = await tokenProvider(config, async () => { calls++; return new Response('{}'); }); await token(true); });
    assert.equal(calls, 0);
  });
});
test('valid saved session reuses cached token and preserves verified subject through scopeless refresh', async () => {
  await withSession(validSession, async (config) => {
    let calls = 0;
    const token = await tokenProvider(config, async () => { calls++; return new Response(JSON.stringify({ access_token: 'REFRESHED_MARKER', token_type: 'Bearer', expires_in: 3600 })); });
    assert.equal(await token(false), 'ACCESS_MARKER'); assert.equal(calls, 0);
    assert.equal(await token(true), 'REFRESHED_MARKER'); assert.equal(calls, 1);
    const { readFile } = await import('node:fs/promises');
    const kept = JSON.parse(await readFile(config.sessionFile, 'utf8'));
    assert.equal(kept.subject, validSession.subject); assert.deepEqual(kept.grantedScopes, validSession.grantedScopes);
  });
});
test('callback server closes eligibility at packet expiry without waiting configured duration', async () => {
  const c = configAt(Date.now() + 150);
  const server = await serve(c, { port: 0, duration: 5000, loadClientFn: async () => ({ client_id: clientId }), checkSessionFn: async () => {}, onEvent: () => {} });
  let timeout;
  try {
    const closed = new Promise((resolve) => server.once('close', () => resolve(true)));
    const deadline = new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 1000); });
    assert.equal(await Promise.race([closed, deadline]), true);
  } finally { clearTimeout(timeout); if (server.listening) await new Promise((resolve) => server.close(resolve)); }
});
test('nonblank meaningful execution reference is required separately from boolean flag', () => {
  for (const reference of [' ', '\n', 123, {}]) assert.throws(() => validateConfig({ ...base, remoteAuthorization: { ...base.remoteAuthorization, reference } }, true));
});
test('token provider created before expiry cannot initiate later refresh', async () => {
  let now = Date.now(); const expires = now + 60_000;
  await withSession(validSession, async (baseConfig) => {
    const c = { ...baseConfig, remoteAuthorization: configAt(expires).remoteAuthorization };
    let calls = 0;
    const token = await tokenProvider(c, async () => { calls++; return new Response('{}'); }, () => now);
    now = expires;
    await assert.rejects(token(true)); assert.equal(calls, 0);
  });
});
test('broader persisted scopes independently refuse cached token and refresh before dispatch', async () => {
  await withSession({ ...validSession, grantedScopes: [...validSession.grantedScopes, 'email'] }, async (config) => {
    let calls = 0;
    const f = async () => { calls++; return new Response('{}'); };
    await assert.rejects(async () => { const token = await tokenProvider(config, f); await token(false); });
    await assert.rejects(async () => { const token = await tokenProvider(config, f); await token(true); });
    assert.equal(calls, 0);
  });
});
test('missing saved subject independently refuses cached token before dispatch', async () => {
  const session = { ...validSession }; delete session.subject;
  await withSession(session, async (config) => {
    let calls = 0;
    await assert.rejects(async () => { const token = await tokenProvider(config, async () => { calls++; return new Response('{}'); }); await token(false); });
    assert.equal(calls, 0);
  });
});
