import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGuard, newState, FIELDS, BASE, B, A, publicEvent, privatePathAllowed } from './guard.mjs';
import { loadReviewed } from './reviewed.mjs';
import { privateLocation } from './private-store.mjs';
import { runCase } from './case.mjs';
import { fixture } from './synthetic.mjs';
const paths = { client: '/private/synthetic/client.json', session: '/private/synthetic/session.json', manifest: '/private/synthetic/manifest.json', config: '/private/synthetic/packet.json' };
const reviewed = await loadReviewed(paths, () => {});
const { DriveHttp } = reviewed;
const create = (f) => f.guard.operation('A', 'root_create', () => new DriveHttp({ token: f.guard.token, fetch: (url, init) => f.guard.fetch('A', url, init) }).createFolder('root', f.config.rootName, { r1Probe: f.config.marker }));

test('literal two-client last-precheck barrier exposes lost update then stops and Bins fixtures', async () => {
  const f = fixture(); const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.verdict, 'observed-refuted'); assert.deepEqual(result.cleanup, { completed: true, residual: [] });
  assert.equal(result.attempts, 23); assert.equal(f.dispatched.length, 23);
  const external = f.dispatched.findIndex((r) => r.request.body === B);
  const app = f.dispatched.findIndex((r) => r.request.body === A);
  const independentB = f.dispatched.findIndex((r, i) => i > external && r.url.endsWith('?alt=media'));
  assert.ok(external < independentB && independentB < app);
  assert.ok(f.events.findIndex((e) => e.event === 'barrier_waiting') < f.events.findIndex((e) => e.event === 'barrier_release'));
  assert.equal(f.body(), A); assert.equal(f.files.get('root').trashed, true); assert.equal(f.files.get('file').trashed, true);
  assert.deepEqual(JSON.parse(f.dispatched[0].request.body).parents, ['root']);
  assert.equal(f.saved.at(-1).resources.root.parent, 'OPAQUE_PARENT_A');
  assert.ok(f.dispatched.every((r) => !r.url.includes('/files/root') && !r.url.includes('/files/OPAQUE_PARENT_A')));
  assert.ok(f.dispatched[0].savedBefore.intents.root_create);
  assert.equal(f.dispatched[1].savedBefore.resources.root.id, 'ROOT_A');
  assert.equal(f.dispatched[2].savedBefore.resources.root.parent, 'OPAQUE_PARENT_A');
  assert.equal(f.dispatched[3].savedBefore.resources.file.id, 'FILE_A');
  const publicBytes = JSON.stringify({ events: f.events, result });
  assert.doesNotMatch(publicBytes, /ROOT_A|FILE_A|OPAQUE_PARENT_A|LOCAL_TOKEN|SECRET_RESPONSE_MARKER|SYNTHETIC_VALIDATOR|SYNTHETIC_MARKER|Synthetic R1 root/);
  assert.doesNotMatch(JSON.stringify(f.saved), /LOCAL_TOKEN|SECRET_RESPONSE_MARKER/);
  assert.ok(f.saved.at(-1).records.some((r) => r.metadata?.modifiedTime));
});

test('a genuine injected upstream stale refusal with B retained supports only this literal case', async () => {
  const f = fixture({ respond: (_url, init, c) => init.body === A ? c.response({ error: 'LOCAL_STALE_REFUSAL' }, 412) : null });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.verdict, 'observed-supported-one-case'); assert.equal(result.cleanup.completed, true); assert.equal(f.body(), B);
});

test('expiry after already issued B observation forbids A release and all further dispatch', async () => {
  let f; let media = 0;
  f = fixture({ before: (url) => { if (url.endsWith('?alt=media') && ++media === 3) f.advance(600001); } });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.verdict, 'inconclusive'); assert.equal(result.cleanup.completed, false);
  assert.ok(f.dispatched.every((r) => r.request.body !== A)); assert.equal(f.dispatched.length, 13);
});

test('normal dispatch stops at minute eight but valid cleanup can use its reserve', async () => {
  let f; let media = 0;
  f = fixture({ before: (url) => { if (url.endsWith('?alt=media') && ++media === 3) f.advance(480001); } });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.ok(f.dispatched.every((r) => r.request.body !== A)); assert.equal(result.cleanup.completed, true);
});

test('approval withdrawn while A waits refuses unchanged release and cleanup', async () => {
  let f; let media = 0;
  f = fixture({ before: (url) => { if (url.endsWith('?alt=media') && ++media === 3) f.config.approved = false; } });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.cleanup.completed, false); assert.ok(f.dispatched.every((r) => r.request.body !== A));
});

test('unknown root-create effect preserves intent and cannot retry or discover provider root', async () => {
  const f = fixture({ before: (url, init, c) => { if (init.method === 'POST' && url.includes('/drive/v3/files?')) { c.files.set('root', c.wire('root')); throw new TypeError('PRIVATE_PROVIDER_DETAIL'); } } });
  await assert.rejects(create(f));
  await assert.rejects(create(f));
  assert.equal(f.dispatched.length, 1); assert.equal(f.saved.at(-1).intents.root_create.status, 'unknown');
  const result = await runCase({ DriveHttp, guard: f.guard, cleanupOnly: true });
  assert.deepEqual(result.cleanup, { completed: false, residual: ['R1_ROOT_UNKNOWN'] }); assert.equal(f.dispatched.length, 1);
});

test('unknown child-create recovery inventories only known root and retains unexpected child', async () => {
  const f = fixture({ before: (url, init, c) => { if (init.method === 'POST' && url.includes('/upload/')) { c.files.set('file', c.wire('file')); throw new TypeError('UNKNOWN_CHILD_EFFECT'); } } });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.cleanup.completed, false); assert.ok(result.cleanup.residual.includes('R1_FILE_UNKNOWN'));
  assert.equal(f.files.get('root').trashed, false); assert.ok(f.dispatched.every((r) => !(r.method === 'PATCH')));
  const before = f.dispatched.length;
  await runCase({ DriveHttp, guard: f.guard, cleanupOnly: true });
  assert.equal(f.dispatched.slice(before).filter((r) => r.method === 'POST').length, 0);
});

test('durable creation intent must settle before the first forward', async () => {
  let yes; let paused = false; const wait = new Promise((r) => { yes = r; });
  const f = fixture({ persist: async (state) => { if (state.intents.root_create && !state.attempts && !paused) { paused = true; await wait; } } });
  const pending = create(f); await new Promise((r) => setTimeout(r, 0));
  assert.equal(paused, true); assert.equal(f.dispatched.length, 0); yes(); await pending;
  assert.equal(f.dispatched.length, 1);
});

for (const parents of [['OPAQUE_PARENT_B'], [], ['OPAQUE_PARENT_A', 'OPAQUE_PARENT_B'], ['']]) test(`changed returned root parent refuses mutation and Bin (${JSON.stringify(parents)})`, async () => {
  const f = fixture({ respond: (url, init, c) => init.method === undefined && url.includes('/files/ROOT_A?') ? c.response(c.wire('root', { parents })) : null });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.cleanup.completed, false); assert.ok(f.dispatched.every((r) => r.method !== 'PATCH'));
  assert.equal(f.state.resources.root.parent, 'OPAQUE_PARENT_A');
});

test('malformed multipart payload refuses before a second provider request', async () => {
  const f = fixture(); await create(f);
  const blob = new Blob(['wrong literal multipart']);
  await assert.rejects(f.guard.operation('A', 'file_create', () => f.guard.fetch('A', `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers: { authorization: 'Bearer LOCAL_TOKEN', 'content-type': 'multipart/related; boundary=literal' }, body: blob })));
  assert.equal(f.dispatched.length, 1);
});

test('unexpected live child refuses root Bin and reports separate residual cleanup', async () => {
  const f = fixture({ respond: (url, init, c) => init.method === undefined && url.includes('pageSize=1000') ? c.response({ files: [{ id: 'UNEXPECTED_SYNTHETIC_CHILD' }] }) : null });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(result.verdict, 'observed-refuted'); assert.deepEqual(result.cleanup, { completed: false, residual: ['R1_ROOT'] });
  assert.equal(f.files.get('file').trashed, true); assert.equal(f.files.get('root').trashed, false);
});

test('raw positive trashed flag is required instead of get not-found', async () => {
  let bin = false;
  const f = fixture({ respond: (url, init, c) => { if (init.method === 'PATCH' && init.body === '{"trashed":true}' && url.includes('FILE_A')) bin = true; else if (bin && url.includes('FILE_A')) return c.response(c.wire('file', { trashed: false })); return null; } });
  const result = await runCase({ DriveHttp, guard: f.guard }); assert.equal(result.cleanup.completed, false); assert.ok(result.cleanup.residual.includes('R1_FILE'));
});

test('unknown write effect cannot cause adapter PATCH retry or automatic cleanup Bin', async () => {
  const f = fixture({ before: (_url, init) => { if (init.body === B) throw new TypeError('UNKNOWN_WRITE'); } });
  const result = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(f.dispatched.filter((r) => r.request.body === B).length, 1);
  assert.ok(f.dispatched.every((r) => r.request.body !== A && r.request.body !== '{"trashed":true}'));
  assert.equal(result.cleanup.completed, false);
});

test('read retries and refresh are counted with request and byte cleanup reserve', async () => {
  const f = fixture(); f.state.attempts = 50; await assert.rejects(create(f)); assert.equal(f.dispatched.length, 0);
  const g = fixture(); g.state.bytes = 57344; await assert.rejects(create(g)); assert.equal(g.dispatched.length, 0);
  const h = fixture(); h.config.limits.requests = 100; await assert.rejects(create(h)); assert.equal(h.dispatched.length, 0);
});

test('current authorization is checked even when token is cached', async () => {
  const f = fixture(); assert.equal(await f.guard.token(false), 'LOCAL_TOKEN'); f.config.approved = false; await assert.rejects(f.guard.token(false));
});

test('fixed refresh endpoint counts aggregate attempts and refuses third refresh', async () => {
  const f = fixture({ respond: (url) => url === 'https://oauth2.googleapis.com/token' ? new Response('{"access_token":"SECRET_REFRESH_MARKER"}') : null });
  const init = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'SYNTHETIC_CLIENT', client_secret: 'SYNTHETIC_SECRET', grant_type: 'refresh_token', refresh_token: 'SYNTHETIC_REFRESH' }) };
  await f.guard.refresh('https://oauth2.googleapis.com/token', init); await f.guard.refresh('https://oauth2.googleapis.com/token', init);
  await assert.rejects(f.guard.refresh('https://oauth2.googleapis.com/token', init));
  assert.equal(f.state.attempts, 2); assert.doesNotMatch(JSON.stringify(f.saved), /SECRET_REFRESH_MARKER|SYNTHETIC_SECRET|SYNTHETIC_REFRESH/);
});

test('own new packet private declarations refuse before reviewed module access', async () => {
  let imported = 0;
  await assert.rejects(loadReviewed({ ...paths, session: '/private/tmp/bower-r1-content-probe/session.json' }, () => {}, async () => { imported++; }));
  assert.equal(imported, 0);
});

test('private parent700 and file600 non-symlink ownership controls use literal filesystem fixtures', async () => {
  const io = (dirMode, fileMode, symlink = false) => ({ realpath: async (path) => path, access: async () => { const e = new Error(); e.code = 'ENOENT'; throw e; }, lstat: async (path) => ({ uid: process.getuid(), mode: path.endsWith('.json') ? fileMode : dirMode, isDirectory: () => !path.endsWith('.json'), isFile: () => path.endsWith('.json'), isSymbolicLink: () => symlink }) });
  await privateLocation('/private/synthetic/file.json', true, io(0o700, 0o600));
  await assert.rejects(privateLocation('/private/synthetic/file.json', true, io(0o755, 0o600)));
  await assert.rejects(privateLocation('/private/synthetic/file.json', true, io(0o700, 0o644)));
  await assert.rejects(privateLocation('/private/synthetic/file.json', true, io(0o700, 0o600, true)));
});

test('duplicate parameters headers If-Match redirects and provider-root GET are refused', async () => {
  const f = fixture(); await create(f);
  for (const url of [`https://www.googleapis.com/drive/v3/files/ROOT_A?fields=${FIELDS}&fields=${FIELDS}`, `https://www.googleapis.com/drive/v3/files/root?fields=${FIELDS}`, `https://www.googleapis.com/drive/v3/files/OPAQUE_PARENT_A?fields=${FIELDS}`]) await assert.rejects(f.guard.operation('O', 'root_verify', () => f.guard.fetch('O', url, { headers: { authorization: 'Bearer LOCAL_TOKEN' } })));
  await assert.rejects(f.guard.operation('O', 'root_verify', () => f.guard.fetch('O', `https://www.googleapis.com/drive/v3/files/ROOT_A?fields=${FIELDS}`, { headers: { authorization: 'Bearer LOCAL_TOKEN', 'if-match': 'INVENTED' } })));
  assert.equal(f.dispatched.length, 1);
  const g = fixture({ respond: () => Response.redirect('https://example.com/', 302) }); await assert.rejects(create(g)); assert.equal(g.dispatched.length, 1);
});


test('cleanup-only recovery continues after file Bin was durably confirmed', async () => {
  let interrupt = true;
  const f = fixture({ before: (url) => { if (interrupt && url.includes('pageSize=1000')) throw new TypeError('LOCAL_CLEANUP_INTERRUPTION'); } });
  const first = await runCase({ DriveHttp, guard: f.guard });
  assert.equal(first.cleanup.completed, false); assert.equal(f.state.fileBinned, true);
  interrupt = false; const before = f.dispatched.length;
  const recovery = await runCase({ DriveHttp, guard: f.guard, cleanupOnly: true });
  assert.deepEqual(recovery.cleanup, { completed: true, residual: [] });
  assert.equal(f.dispatched.slice(before).filter((r) => r.method === 'POST' || r.request.body === A || r.request.body === B || (r.method === 'PATCH' && r.url.includes('FILE_A'))).length, 0);
});

test('actual immutable adapter GET retry is separately counted and expiry rechecked after wait', async () => {
  let reads = 0;
  const positive = fixture({ respond: (url, init, c) => !init.method && url.includes('/files/ROOT_A?') && ++reads === 1 ? c.response({ error: 'LOCAL_RATE_LIMIT' }, 429) : null });
  await create(positive);
  await positive.guard.operation('O', 'root_verify', () => new DriveHttp({ token: positive.guard.token, fetch: (url, init) => positive.guard.fetch('O', url, init) }).get('ROOT_A'));
  assert.equal(positive.state.attempts, 3); assert.equal(positive.dispatched.length, 3);
  let expired;
  expired = fixture({ respond: (url, init, c) => { if (!init.method && url.includes('/files/ROOT_A?')) { expired.advance(600001); return c.response({ error: 'LOCAL_RATE_LIMIT' }, 429); } return null; } });
  await create(expired);
  await assert.rejects(expired.guard.operation('O', 'root_verify', () => new DriveHttp({ token: expired.guard.token, fetch: (url, init) => expired.guard.fetch('O', url, init) }).get('ROOT_A')));
  assert.equal(expired.dispatched.length, 2); assert.equal(expired.state.attempts, 2);
});


test('private files cannot be placed inside the prepared product worktree or SecondBrain', () => {
  assert.equal(privatePathAllowed('/private/tmp/bower-p2-journal-ack/private/session.json'), false);
  assert.equal(privatePathAllowed('/Users/deluisp/SecondBrain/private/session.json'), false);
});

test('private locations refuse any additional repository ancestor before file access', async () => {
  const io = { realpath: async (p) => p, access: async (p) => { if (p.endsWith('/.git')) return; const e=new Error(); e.code='ENOENT'; throw e; }, lstat: async (p) => ({ uid: process.getuid(), mode: p.endsWith('.json') ? 0o600 : 0o700, isDirectory: () => !p.endsWith('.json'), isFile: () => p.endsWith('.json'), isSymbolicLink: () => false }) };
  await assert.rejects(privateLocation('/private/synthetic/session.json', true, io));
});
