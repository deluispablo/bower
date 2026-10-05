import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.R1_TARGET??new URL('.',import.meta.url).pathname;
const {privatePathAllowed}=await import(`${base}/guard.mjs`);
test('new ETag public packet refuses private state before loading modules',()=>{
 assert.equal(privatePathAllowed('/private/tmp/bower-r1-etag-v2-probe/private/session.json'),false);
});
