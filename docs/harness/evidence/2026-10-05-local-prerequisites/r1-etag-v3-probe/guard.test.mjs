import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGuard, privatePathAllowed, publicEvent } from './guard.mjs';
const config = { approved: true, reference: 'LOCAL_SYNTHETIC', expiresAt: 600000, rootName: 'Synthetic R1 root', marker: 'SYNTHETIC_MARKER', limits: { requests: 60, milliseconds: 600000, bytes: 65536 } };
const state = { v: 1, started: 0, attempts: 0, bytes: 0, resources: {}, intents: {}, records: [] };
test('neutral injected transport is locally runnable', async () => {
  const value = { id: 'FILE_A', name: 'fixture.md', mimeType: 'text/markdown', parents: ['ROOT_A'], appProperties: { r1Probe: config.marker }, modifiedTime: '1970-01-01T00:00:01.000Z', createdTime: '1970-01-01T00:00:01.000Z' };
  const known = structuredClone(state); known.resources = { root: { id: 'ROOT_A', parent: 'OPAQUE_PARENT_A', name: config.rootName }, file: { id: 'FILE_A', parent: 'ROOT_A', name: 'fixture.md' } };
  const guard = makeGuard({ config, state: known, now: () => 0, persist: async () => {}, forward: async () => new Response(JSON.stringify(value)) });
  const fields = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
  assert.equal((await guard.operation('B', 'B_initial', async () => (await guard.fetch('B', `https://www.googleapis.com/drive/v3/files/FILE_A?fields=${fields}`, { headers: { authorization: 'Bearer LOCAL_TOKEN' } })).json())).id, 'FILE_A');
});
test('unknown provider resource refuses before forwarding', async () => {
  let forwarded = 0;
  const guard = makeGuard({ config, state: structuredClone(state), now: () => 0, persist: async () => {}, forward: async () => { forwarded++; return new Response('LOCAL'); } });
  await assert.rejects(guard.fetch('O', 'https://www.googleapis.com/drive/v3/files/UNRELATED?alt=media'));
  assert.equal(forwarded, 0);
});
test('credential query and external route refuse before forwarding', async () => {
  const guard = makeGuard({ config, state: structuredClone(state), now: () => 0, persist: async () => {}, forward: async () => new Response('LOCAL') });
  await assert.rejects(guard.fetch('O', 'https://example.com/?access_token=SECRET_MARKER'));
});
test('new public packet is excluded from all private locations', () => {
  assert.equal(privatePathAllowed('/private/tmp/bower-r1-content-probe/private.json'), false);
});
test('public envelope excludes arbitrary credential metadata and stack strings', () => {
  assert.deepEqual(publicEvent({ event: 'request', actor: 'O', operation: 'metadata', status: 200, token: 'SECRET_MARKER', id: 'RAW_ID', stack: 'RAW_STACK' }), { event: 'request', actor: 'O', operation: 'metadata', status: 200 });
});
