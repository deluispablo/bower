// Local experiment scaffold only. No production Worker/session implementation.
import { createServer } from 'node:http';
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REDIRECT = 'http://127.0.0.1:53682/oauth/callback';
export const SCOPES = Object.freeze({
  'full-drive': ['openid', 'https://www.googleapis.com/auth/drive'],
  'file-comparison': ['openid', 'https://www.googleapis.com/auth/drive.file'],
});
const TOKEN = 'https://oauth2.googleapis.com/token';
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const SCAFFOLD_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOTS = ['/Users/deluisp/Projects/bower', '/Users/deluisp/Projects/bower-app'];
const fail = (message) => { throw new Error(message); };
export const challenge = (verifier) => createHash('sha256').update(verifier, 'ascii').digest('base64url');
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function validateConfig(c, requireAuthorization = false, now = Date.now()) {
  if (!c || !SCOPES[c.scopeSet] || !/^[A-Z][A-Z0-9_-]{0,20}$/.test(c.identityAlias)) fail('Invalid alias or scope selection.');
  if (c.redirectUri !== REDIRECT) fail('Use the exact registered loopback callback.');
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(c.projectId) || c.projectId.includes('OWNER')) fail('Existing project ID must be supplied explicitly.');
  for (const key of ['clientFile', 'sessionFile']) {
    const p = c[key];
    if (typeof p !== 'string' || resolve(p) !== p || /ABSOLUTE|PRIVATE\/PATH/.test(p)) fail('Supply explicit absolute private file paths.');
    if (REPO_ROOTS.some((r) => p === r || p.startsWith(`${r}/`))) fail('Credentials must stay outside both repositories.');
    if (p === SCAFFOLD_ROOT || p.startsWith(`${SCAFFOLD_ROOT}/`) || p.startsWith('/private/tmp/bower-google-probe-setup/')) fail('Credentials must stay outside the scaffold and evidence.');
  }
  if (c.clientFile === c.sessionFile) fail('Client and session files must be distinct.');
  const a = c.remoteAuthorization;
  if (requireAuthorization && (a?.approved !== true || typeof a.reference !== 'string' || !a.reference.trim() || typeof a.expiresAt !== 'string' || !Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt) <= now)) fail('A current explicit remote execution authorization is required.');
  return c;
}

async function privateLocation(path, existing) {
  const parent = await realpath(dirname(path));
  if (REPO_ROOTS.some((r) => parent === r || parent.startsWith(`${r}/`)) || parent === SCAFFOLD_ROOT || parent.startsWith(`${SCAFFOLD_ROOT}/`) || parent === '/private/tmp/bower-google-probe-setup' || parent.startsWith('/private/tmp/bower-google-probe-setup/')) fail('Private path resolves inside source or evidence.');
  const dir = await lstat(parent);
  if ((dir.mode & 0o077) !== 0 || dir.uid !== process.getuid()) fail('Private directory must be owned by you with mode 700.');
  if (existing) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) fail('Private file must be a regular owner-only file.');
  } else {
    try { await lstat(path); fail('Session file already exists; use a new alias file or explicit local cleanup.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function loadClient(c) {
  await privateLocation(c.clientFile, true);
  const document = JSON.parse(await readFile(c.clientFile, 'utf8'));
  const w = document.web;
  if (!w || w.project_id !== c.projectId || !w.client_id?.endsWith('.apps.googleusercontent.com') || typeof w.client_secret !== 'string' || !w.client_secret || !w.redirect_uris?.includes(REDIRECT)) fail('Web client, project or added redirect does not match.');
  return w;
}

export function startFlow(c, clientId, browser, now = Date.now()) {
  validateConfig(c, true, now);
  const flow = { state: random(), verifier: random(), nonce: random(), browser, expires: Math.min(now + 10 * 60_000, Date.parse(c.remoteAuthorization.expiresAt)), used: false };
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: c.redirectUri, response_type: 'code', scope: SCOPES[c.scopeSet].join(' '), access_type: 'offline', prompt: 'consent select_account', state: flow.state, nonce: flow.nonce, code_challenge: challenge(flow.verifier), code_challenge_method: 'S256', include_granted_scopes: 'false' })) u.searchParams.set(k, v);
  return { flow, url: u.href };
}
export function acceptCallback(flow, params, browser, now = Date.now()) {
  if (!flow || flow.used || now >= flow.expires || !equal(flow.state, params.get('state')) || !equal(flow.browser, browser)) fail('Callback state, browser binding or lifetime is invalid.');
  if (params.getAll('state').length !== 1 || params.getAll('code').length > 1 || params.getAll('error').length > 1) fail('Ambiguous callback.');
  flow.used = true;
  if (params.has('error')) fail('Google authorization did not finish.');
  const code = params.get('code');
  if (!code || code.length > 4096) fail('No usable authorization code.');
  return code;
}
export function validateIdToken(jwt, clientId, nonce, jwks, now = Date.now()) {
  let h, c, parts;
  try { parts = jwt.split('.'); h = JSON.parse(Buffer.from(parts[0], 'base64url')); c = JSON.parse(Buffer.from(parts[1], 'base64url')); }
  catch { fail('Invalid identity token.'); }
  const jwk = jwks.keys?.find((k) => k.kid === h.kid && k.kty === 'RSA');
  if (parts.length !== 3 || h.alg !== 'RS256' || !jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) fail('Identity signature did not validate.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.aud !== clientId || (c.azp && c.azp !== clientId) || !Number.isFinite(c.exp) || c.exp * 1000 <= now || !Number.isFinite(c.iat) || c.iat * 1000 > now + 60_000 || !equal(c.nonce, nonce) || typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) fail('Identity claims did not validate.');
  return c.sub; // Private storage only; never print claims/email/token.
}
export function checkedGrant(body, scopeSet, now = Date.now()) {
  if (!body || typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 0 || body.token_type !== 'Bearer' || typeof body.scope !== 'string') fail('Invalid token reply.');
  const granted = body.scope.trim().split(/\s+/);
  const expected = SCOPES[scopeSet];
  if (!expected || granted.length !== expected.length || new Set(granted).size !== granted.length || !expected.every((s) => granted.includes(s)) || granted.some((s) => !expected.includes(s))) fail('Granted scopes differ from the explicitly requested scopes.');
  return { accessToken: body.access_token, expiresAt: now + body.expires_in * 1000, grantedScopes: granted };
}
async function fetchJson(c, url, init = {}, f = fetch, now = Date.now) {
  // Each newly issued external request requires authority at dispatch, not merely startup.
  // Replies to already issued I/O are not cancelled or rolled back when authority expires.
  validateConfig(c, true, now());
  let response;
  try { response = await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { fail('Google request did not finish.'); }
  if (!response.ok) fail(`Google request returned HTTP ${response.status}.`);
  try { return await response.json(); } catch { fail('Google returned unreadable JSON.'); }
}
export async function exchange(c, client, flow, code, f = fetch, now = Date.now) {
  validateConfig(c, true, now());
  if (!flow || now() >= flow.expires) fail('Callback lifetime expired before exchange.');
  const body = await fetchJson(c, TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, redirect_uri: c.redirectUri, grant_type: 'authorization_code', code, code_verifier: flow.verifier }) }, f, now);
  const grant = checkedGrant(body, c.scopeSet, now());
  if (typeof body.refresh_token !== 'string' || !body.refresh_token || typeof body.id_token !== 'string') fail('Offline grant or identity token is missing; do not silently retry consent.');
  const keys = await fetchJson(c, CERTS, {}, f, now);
  const subject = validateIdToken(body.id_token, client.client_id, flow.nonce, keys, now());
  return { ...grant, refreshToken: body.refresh_token, subject, identityAlias: c.identityAlias, clientId: client.client_id, projectId: c.projectId, scopeSet: c.scopeSet };
}
export async function saveSession(c, session) {
  await privateLocation(c.sessionFile, false);
  await writeFile(c.sessionFile, `${JSON.stringify(session)}\n`, { mode: 0o600, flag: 'wx' });
}
function validateSavedSession(kept, c, client) {
  if (!kept || typeof kept !== 'object' || Array.isArray(kept) || kept.clientId !== client.client_id || kept.projectId !== c.projectId || kept.identityAlias !== c.identityAlias || kept.scopeSet !== c.scopeSet) fail('Session does not belong to this configured client and alias.');
  const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
  const expected = SCOPES[c.scopeSet];
  if (!nonblank(kept.accessToken) || !nonblank(kept.refreshToken) || !Number.isFinite(kept.expiresAt) || kept.expiresAt <= 0 || !nonblank(kept.subject) || kept.subject.length > 255 || !Array.isArray(kept.grantedScopes) || kept.grantedScopes.length !== expected.length || new Set(kept.grantedScopes).size !== kept.grantedScopes.length || !expected.every((scope) => kept.grantedScopes.includes(scope))) fail('Saved session is damaged or its exact grant differs. Repeat only the authorized local setup.');
  return kept;
}
export async function tokenProvider(c, f = fetch, now = Date.now) {
  validateConfig(c, true, now());
  const client = await loadClient(c);
  await privateLocation(c.sessionFile, true);
  let kept = JSON.parse(await readFile(c.sessionFile, 'utf8'));
  validateSavedSession(kept, c, client);
  let pending = null;
  return async (fresh) => {
    validateConfig(c, true, now());
    validateSavedSession(kept, c, client);
    if (!fresh && kept.expiresAt > now() + 60_000) return kept.accessToken;
    if (!pending) {
      pending = (async () => {
        const body = await fetchJson(c, TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, grant_type: 'refresh_token', refresh_token: kept.refreshToken }) }, f, now);
        // Refresh can omit scope; retain only the already validated exact grant then.
        const grant = checkedGrant({ ...body, scope: body.scope ?? kept.grantedScopes.join(' ') }, c.scopeSet, now());
        const next = { ...kept, ...grant, ...(body.refresh_token === undefined ? {} : { refreshToken: body.refresh_token }) };
        // The verified opaque subject is retained; refresh does not substitute identity.
        validateSavedSession(next, c, client);
        kept = next;
        await privateLocation(c.sessionFile, true);
        await writeFile(c.sessionFile, `${JSON.stringify(kept)}\n`, { mode: 0o600 });
        return kept.accessToken;
      })().finally(() => { pending = null; });
    }
    return pending;
  };
}
// Logs never contain a request URL/body/header, callback, provider body or exception stack.
export function safeEvent(event, identityAlias, status = undefined) {
  if (!['listening', 'stopped', 'authorization_saved', 'refused', 'read'].includes(event) || !/^[A-Z][A-Z0-9_-]{0,20}$/.test(identityAlias) || (status !== undefined && (!Number.isInteger(status) || status < 100 || status > 599))) fail('Invalid sanitized event.');
  return JSON.stringify({ event, identityAlias, ...(status === undefined ? {} : { status }) });
}
export async function serve(c, { exchangeFn = exchange, saveFn = saveSession, loadClientFn = loadClient, checkSessionFn = () => privateLocation(c.sessionFile, false), port = 53682, onEvent = console.log, duration = 10 * 60_000, now = Date.now } = {}) {
  validateConfig(c, true, now());
  if (!Number.isFinite(duration) || duration <= 0) fail('Invalid local server lifetime.');
  const eligibleUntil = Math.min(now() + duration, now() + 10 * 60_000, Date.parse(c.remoteAuthorization.expiresAt));
  const requireEligibility = () => {
    validateConfig(c, true, now());
    if (now() >= eligibleUntil) fail('Local server eligibility expired.');
  };
  const client = await loadClientFn(c);
  await checkSessionFn();
  requireEligibility();
  let flow = null;
  const browser = random();
  const cookie = `bower_probe_browser=${browser}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`;
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    const validHost = req.headers.host === `127.0.0.1:${server.address().port}`;
    if (!validHost || req.url.length > 8192) { res.writeHead(400); res.end('Invalid local request.'); return; }
    const u = new URL(req.url, c.redirectUri);
    const boundBrowser = /(?:^|; )bower_probe_browser=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    try {
      requireEligibility();
      if (req.method === 'GET' && u.pathname === '/' && !u.search) {
        res.setHeader('set-cookie', cookie);
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(`<p>Synthetic identity ${c.identityAlias}; scope set ${c.scopeSet}.</p><form method="post" action="/start"><input type="hidden" name="csrf" value="${browser}"><button>Continue to Google</button></form>`);
      } else if (req.method === 'POST' && u.pathname === '/start' && !u.search) {
        if (req.headers.origin !== `http://${req.headers.host}` || !equal(browser, boundBrowser) || flow) fail('Invalid authorization start.');
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 1024) fail('Invalid local form.'); }
        if (!equal(new URLSearchParams(text).get('csrf'), browser)) fail('Invalid local form.');
        requireEligibility();
        const started = startFlow(c, client.client_id, browser, now());
        started.flow.expires = Math.min(started.flow.expires, eligibleUntil);
        flow = started.flow;
        res.writeHead(303, { location: started.url }); res.end();
      } else if (req.method === 'GET' && u.pathname === '/oauth/callback') {
        const code = acceptCallback(flow, u.searchParams, boundBrowser, now());
        requireEligibility();
        const session = await exchangeFn(c, client, flow, code, fetch, now);
        await saveFn(c, session);
        // Keep the consumed flow until shutdown: one consent attempt per local process.
        onEvent(safeEvent('authorization_saved', c.identityAlias));
        res.writeHead(303, { location: '/complete', 'set-cookie': 'bower_probe_browser=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); res.end();
      } else if (req.method === 'GET' && u.pathname === '/complete' && !u.search) res.end('Local grant saved privately. Close this tab and stop the harness.');
      else { res.writeHead(404); res.end('Not found.'); }
    } catch {
      onEvent(safeEvent('refused', c.identityAlias));
      res.writeHead(400); res.end('Local authorization refused; stop and review the setup.');
    }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
  // Stop eligibility at the earlier packet/server expiry, preserving already issued I/O.
  try { requireEligibility(); }
  catch (error) { await new Promise((done) => server.close(done)); throw error; }
  const timer = setTimeout(() => server.close(), Math.max(0, eligibleUntil - now()));
  server.once('close', () => { clearTimeout(timer); flow = null; onEvent(safeEvent('stopped', c.identityAlias)); });
  onEvent(safeEvent('listening', c.identityAlias));
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, approved] = process.argv.slice(2);
    if (!['validate', 'serve'].includes(mode) || !path || (mode === 'serve' && approved !== '--authorized-execution')) fail('Usage: node oauth-local.mjs validate CONFIG | serve CONFIG --authorized-execution');
    const c = validateConfig(JSON.parse(await readFile(path, 'utf8')), mode === 'serve');
    if (mode === 'validate') { await loadClient(c); console.log('Local configuration matches; no OAuth request sent.'); }
    else {
      const server = await serve(c);
      const stop = () => server.close(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    }
  } catch { console.error('Local setup refused. Check explicit configuration and private file permissions; no secret details printed.'); process.exitCode = 1; }
}
