import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, CONTROL, B, A, hash, V2_FIELDS, newState, makeGuard } from './guard.mjs';
import { parseValidator } from './binding.mjs';
import { runCase } from './case.mjs';
import { fixture } from './synthetic.mjs';
import { loadReviewed } from './reviewed.mjs';
const { DriveHttp } = await loadReviewed({ client:'/private/synthetic/client.json', session:'/private/synthetic/session.json', config:'/private/synthetic/config.json', manifest:'/private/synthetic/manifest.json' }, () => {});
const run = (f) => runCase({ DriveHttp, guard:f.guard });
const puts = (f) => f.dispatched.filter((r) => r.method === 'PUT');
const tags = (f) => f.dispatched.filter((r) => new URL(r.url).pathname.startsWith('/drive/v2/'));

test('matching Markdown PUT changes bytes and stale exact-tag PUT412 preserves independently read B', async () => {
 const f=fixture({enforceIfMatch:true}); const result=await run(f);
 assert.equal(result.verdict,'observed-supported-one-case'); assert.deepEqual(result.cleanup,{completed:true,residual:[]});
 assert.equal(result.hashes.observedControl,hash(CONTROL)); assert.equal(result.hashes.observedB,hash(B)); assert.equal(result.hashes.final,hash(B)); assert.equal(f.body(),B);
 assert.equal(f.state.records.find((r)=>r.operation==='control_write').status,200); assert.equal(f.state.records.find((r)=>r.operation==='conditional_A').status,412);
 assert.equal(f.dispatched.length,30); assert.equal(puts(f).length,2); assert.equal(tags(f).length,6);
 assert.deepEqual(puts(f).map((r)=>[new Headers(r.request.headers).get('content-type'),new Headers(r.request.headers).get('if-match'),r.request.body]),[['text/markdown','"SYNTHETIC_VERSION_0"',CONTROL],['text/markdown','"SYNTHETIC_VERSION_1"',A]]);
 assert.equal(f.state.bindings.control.contentHash,hash(CONTROL)); assert.equal(f.state.bindings.external.contentHash,hash(B));
 assert.ok(f.dispatched.every((r)=>r.method!=='DELETE' && !r.url.includes('If-Match=')));
 assert.doesNotMatch(JSON.stringify({events:f.events,result}),/FILE_A|ROOT_A|SYNTHETIC_VERSION|LOCAL_TOKEN|text\/markdown/);
});

test('ignored If-Match actually overwrites B with A and refutes instead of inferring safety',async()=>{
 const f=fixture();const result=await run(f);assert.equal(result.verdict,'observed-refuted');assert.equal(f.body(),A);assert.equal(result.hashes.final,hash(A));assert.equal(result.cleanup.completed,true);assert.equal(puts(f).length,2);
});

for(const kind of ['missing','weak','wrongId','unsafeVersion'])test(`unusable provider ${kind} validator stops before conditional control or B`,async()=>{
 const f=fixture({respond:(url,init,c)=>new URL(url).pathname.startsWith('/drive/v2/')?c.response(kind==='missing'?{id:'FILE_A',version:'0'}:kind==='weak'?c.validator({etag:'W/"WEAK"'}):kind==='wrongId'?c.validator({id:'FOREIGN_A'}):c.validator({version:9007199254740992})):null});
 const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(puts(f).length,0);assert.equal(f.dispatched.filter(r=>r.request.body===B).length,0);assert.equal(f.state.stop,'validator');
});

for(const change of ['tag','versionABA','bytes'])test(`stable BASE acquisition refuses ${change} and never acquires fresh tag for old bytes`,async()=>{
 let n=0;const f=fixture({respond:(url,init,c)=>{
  if(new URL(url).pathname.startsWith('/drive/v2/')&&++n===2)return c.response(change==='tag'?c.validator({etag:'"CHANGED"'}):change==='versionABA'?c.validator({version:'1'}):c.validator());
  if(change==='bytes'&&url.endsWith('?alt=media')&&n===1)return new Response(CONTROL);return null;
 }});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(puts(f).length,0);assert.equal(f.dispatched.filter(r=>r.request.body===B).length,0);assert.equal(n,2);
});

test('exact large decimal versions remain precise through matching and stale observations',async()=>{
 const f=fixture({versionOffset:'900719925474099300000',enforceIfMatch:true});const result=await run(f);assert.equal(result.verdict,'observed-supported-one-case');assert.equal(f.state.bindings.base.version,'900719925474099300000');assert.equal(f.state.bindings.control.version,'900719925474099300001');assert.equal(f.state.bindings.external.version,'900719925474099300002');
});

test('absent optional version supports only unchanged strong-tag binding',async()=>{
 const f=fixture({enforceIfMatch:true,respond:(url,init,c)=>{if(new URL(url).pathname.startsWith('/drive/v2/')){const w=c.validator();delete w.version;return c.response(w);}return null;}});const result=await run(f);assert.equal(result.verdict,'observed-supported-one-case');assert.equal(f.state.bindings.base.version,null);assert.equal(f.state.bindings.external.version,null);
});

for(const variant of ['unchangedTag','sameVersion','backwardVersion','missingVersion'])test(`confirmed B with ${variant} refuses queued A release`,async()=>{
 const f=fixture({respond:(url,init,c)=>{
  if(new URL(url).pathname.startsWith('/drive/v2/')&&c.validator().version==='2'){
   const w=c.validator(variant==='unchangedTag'?{etag:'"SYNTHETIC_VERSION_1"'}:variant==='sameVersion'?{version:'1'}:variant==='backwardVersion'?{version:'0'}:{});if(variant==='missingVersion')delete w.version;return c.response(w);
  }return null;
 }});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),B);assert.equal(puts(f).length,1);assert.equal(f.state.stop,'validator');
});

for(const status of [401,403,412,500])test(`failed matching control PUT${status} cannot advance to B or support`,async()=>{
 const f=fixture({respond:(_url,init,c)=>init.body===CONTROL?c.response({error:'SYNTHETIC_CONTROL_FAILURE'},status):null});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(puts(f).length,1);assert.equal(f.body(),BASE);assert.equal(f.dispatched.filter(r=>r.request.body===B||r.request.body===A).length,0);assert.equal(f.state.records.filter(r=>r.operation==='control_write').length,1);
});

for(const reply of ['unreadable','missingId','transport'])test(`unknown conditional control ${reply} preserves effect and forbids second PUT and Bin`,async()=>{
 const f=fixture({respond:(_url,init,c)=>{if(init.body!==CONTROL)return null;c.setContent(CONTROL);if(reply==='transport')throw new Error('SYNTHETIC_UNKNOWN_CONTROL');return reply==='unreadable'?new Response('SYNTHETIC_UNREADABLE',{status:200}):c.response({etag:'"NO_ID"',version:'1'});}});
 const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),CONTROL);assert.equal(result.cleanup.completed,false);assert.equal(puts(f).length,1);assert.equal(f.dispatched.filter(r=>r.request.body===A||r.request.body===B||r.request.body==='{"trashed":true}').length,0);assert.equal(f.state.stop,'unknown_effect');assert.equal(f.state.intents.control_write.effect,'unresolved');
});

for(const substitution of ['freshTag','wrongBody','wrongContentType','changedBearer'])test(`queued ${substitution} substitution after confirmed B refuses before A forward`,async()=>{
 let queued;const f=fixture({enforceIfMatch:true,before:(url,init,c)=>{
  if(new URL(url).pathname.startsWith('/drive/v2/')&&c.validator().version==='2'){
   if(substitution==='freshTag')queued.headers['if-match']=c.validator().etag;
   if(substitution==='wrongBody')queued.body=B;
   if(substitution==='wrongContentType')queued.headers['content-type']='application/json';
   if(substitution==='changedBearer')queued.headers.authorization='Bearer CHANGED_SYNTHETIC';
  }
 }});const fetch=f.guard.fetch;f.guard.fetch=(actor,url,init)=>{if(init.body===A)queued=init;return fetch(actor,url,init);};
 const result=await run(f);assert.ok(queued);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),B);assert.equal(puts(f).length,1);assert.ok(f.dispatched.every(r=>r.request.body!==A));
});

test('cached provider token change while A waits cannot substitute a renewed bearer',async()=>{
 let token='LOCAL_TOKEN';const f=fixture({tokenSource:async()=>token,before:(url,init,c)=>{if(new URL(url).pathname.startsWith('/drive/v2/')&&c.validator().version==='2')token='NEW_LOCAL_TOKEN';}});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(puts(f).length,1);assert.equal(f.body(),B);assert.ok(f.dispatched.every(r=>r.request.body!==A));
});

test('issued unknown A effect stops without final-safe inference or any mutation retry',async()=>{
 const f=fixture({respond:(_url,init,c)=>{if(init.body!==A)return null;c.setContent(A);throw new Error('SYNTHETIC_UNKNOWN_A');}});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),A);assert.equal(result.cleanup.completed,false);assert.equal(puts(f).length,2);assert.equal(f.dispatched.filter(r=>r.request.body==='{"trashed":true}').length,0);assert.equal(f.state.stop,'unknown_effect');
});

test('successful positive reply with unchanged bytes cannot authorize negative case',async()=>{
 const f=fixture({respond:(_url,init,c)=>init.body===CONTROL?c.response(c.validator()):null});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),BASE);assert.equal(puts(f).length,1);assert.equal(f.dispatched.filter(r=>r.request.body===B||r.request.body===A).length,0);
});

test('foreign content after B is retained and cleanup cannot Bin it',async()=>{
 const f=fixture({before:(_url,init,c)=>{if(init.body===B)c.setContent('user: external unknown\ncompiled: unrelated\n');},respond:(_url,init,c)=>init.body===B?c.response(c.files.get('file')):null});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.state.foreignContent,true);assert.equal(result.cleanup.completed,false);assert.equal(puts(f).length,1);assert.ok(f.dispatched.every(r=>r.request.body!=='{"trashed":true}'));
});

test('changed account authority while A waits refuses both release and cleanup',async()=>{
 let f;f=fixture({before:(url,init,c)=>{if(new URL(url).pathname.startsWith('/drive/v2/')&&c.validator().version==='2')f.config.identityAlias='B';}});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(result.cleanup.completed,false);assert.equal(puts(f).length,1);
});

test('fresh path exclusion for ETag packet occurs before module importer',async()=>{
 let imported=0;await assert.rejects(loadReviewed({client:'/private/synthetic/client.json',session:'/private/tmp/bower-r1-etag-v2-probe/private/session.json'},()=>{},async()=>{imported++;throw new Error('LOCAL_IMPORT');}));assert.equal(imported,0);
});

for(const status of [409,401,403,500])test(`one upstream stale A PUT${status} with final B is inconclusive without retry`,async()=>{
 const f=fixture({respond:(_url,init,c)=>init.body===A?c.response({error:'SYNTHETIC_NOT_PRECONDITION'},status):null});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(result.hashes.final,hash(B));assert.equal(f.dispatched.filter(r=>r.request.body===A).length,1);assert.equal(f.state.records.find(r=>r.operation==='conditional_A').status,status);
});

test('a412 reply after actual A overwrite cannot support despite conflict label',async()=>{
 const f=fixture({respond:(_url,init,c)=>{if(init.body!==A)return null;c.setContent(A);return c.response({error:'SYNTHETIC_FALSE_CONFLICT'},412);}});const result=await run(f);assert.equal(result.verdict,'inconclusive');assert.equal(f.body(),A);assert.equal(result.hashes.final,hash(A));assert.equal(puts(f).length,2);
});
