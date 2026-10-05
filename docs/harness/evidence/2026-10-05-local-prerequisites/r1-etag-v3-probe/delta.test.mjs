import test from 'node:test';
import assert from 'node:assert/strict';
const directory=process.env.R1_BASELINE ?? new URL('.',import.meta.url).pathname;
const {fixture}=await import(`${directory}/synthetic.mjs`);
const {runCase}=await import(`${directory}/case.mjs`);
const {conditionalClient}=await import(`${directory}/conditional.mjs`);
const {BASE,CONTROL,B,privatePathAllowed}=await import(`${directory}/guard.mjs`);
const {loadReviewed}=await import(`${directory}/reviewed.mjs`);
const {DriveHttp}=await loadReviewed({client:'/private/synthetic/client.json',session:'/private/synthetic/session.json'},()=>{});
const run=f=>runCase({DriveHttp,guard:f.guard});
const bases=f=>f.state.records.filter(r=>r.operation==='base_read');
async function bootstrap(f){
 const clients=Object.fromEntries(['A','O'].map(a=>[a,new DriveHttp({token:f.guard.token,fetch:(url,init)=>f.guard.fetch(a,url,init)})]));
 const op=(a,n,fn)=>f.guard.operation(a,n,()=>fn(clients[a]));
 await op('A','root_create',c=>c.createFolder('root',f.state.rootName,{r1Probe:f.state.marker}));
 await op('O','root_verify',c=>c.get(f.state.resources.root.id));
 await op('A','file_create',c=>c.createText(f.state.resources.root.id,'fixture.md',BASE,{r1Probe:f.state.marker}));
 await op('O','file_verify',async c=>{await c.get(f.state.resources.file.id);await c.readText(f.state.resources.file.id);});
 return conditionalClient(f.guard,'A',DriveHttp);
}
test('loaded matching baseline has actual CONTROL and stale412 effects',async()=>{const f=fixture({enforceIfMatch:true});const r=await run(f);assert.equal(r.verdict,'observed-supported-one-case');assert.equal(f.body(),B);});
for(const failures of [1,2])test(`BASE reacquires a whole triplet after ${failures} complete version refusals`,async()=>{
 let n=0;const f=fixture({enforceIfMatch:true,respond:(url,_init,c)=>{if(new URL(url).pathname.startsWith('/drive/v2/')){n++;if(n<=failures*2 && n%2===0)return c.response(c.validator({version:'1'}));}return null;}});
 const result=await run(f);assert.equal(result.verdict,'observed-supported-one-case');assert.equal(bases(f).length,3*(failures+1));assert.equal(f.dispatched.filter(r=>r.method==='PUT').length,2);assert.equal(f.dispatched.length,30+3*failures);assert.equal(f.body(),B);
});
test('third complete BASE refusal stops with nine reads and no fourth or mutation',async()=>{
 let n=0;const f=fixture({respond:(url,_init,c)=>new URL(url).pathname.startsWith('/drive/v2/') && ++n%2===0?c.response(c.validator({version:'1'})):null});
 const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(bases(f).length,9);assert.equal(f.dispatched.filter(r=>r.method==='PUT'||r.request.body===B).length,0);assert.equal(r.cleanup.completed,true);
});
test('each completed BASE200 is persisted and emitted before a local validator refusal',async()=>{
 let n=0;const f=fixture({respond:(url,_init,c)=>new URL(url).pathname.startsWith('/drive/v2/') && ++n%2===0?c.response(c.validator({version:'1'})):null});
 await run(f);const records=bases(f),events=f.events.filter(e=>e.event==='request'&&e.operation==='base_read');assert.equal(events.length,records.length);assert.ok(records.every(r=>r.status===200));assert.ok(f.saved.some(s=>s.records.filter(r=>r.operation==='base_read').length===records.length));
});
test('guard refuses successful BASE acquisition replay before any new forwarding',async()=>{
 const f=fixture();const client=await bootstrap(f);await client.read('base_read',BASE);const before=f.dispatched.length;await assert.rejects(client.read('base_read',BASE));assert.equal(f.dispatched.length,before);
});
test('whole BASE triplet response budget is reserved before its first dispatch',async()=>{
 const f=fixture();const client=await bootstrap(f);f.state.bytes=55000;const before=f.dispatched.length;await assert.rejects(client.read('base_read',BASE));assert.equal(f.dispatched.length,before);
});
test('new v3 public packet excludes private locations before importing reviewed modules',async()=>{
 const path='/private/tmp/bower-r1-etag-v3-probe/private/session.json';assert.equal(privatePathAllowed(path),false);let imports=0;await assert.rejects(loadReviewed({session:path},()=>{},async()=>{imports++;throw Error('SYNTHETIC_IMPORT');}));assert.equal(imports,0);
});

for(const reason of ['weak','wrongIdentity','invalidVersion','foreignBytes','ownership','transport','non200'])test(`BASE ${reason} refusal never pauses or resets admission`,async()=>{
 let n=0, waits=0;const f=fixture({pause:async()=>{waits++;},respond:(url,_init,c)=>{
  const u=new URL(url);if(u.pathname.startsWith('/drive/v2/')){
   n++;if(n===2){if(reason==='weak')return c.response(c.validator({etag:'W/"WEAK"'}));if(reason==='wrongIdentity')return c.response(c.validator({id:'OTHER_A'}));if(reason==='invalidVersion')return c.response(c.validator({version:'00'}));if(reason==='transport')throw Error('SYNTHETIC_TRANSPORT');if(reason==='non200')return c.response({error:'SYNTHETIC'},500);}
  }
  if(reason==='foreignBytes'&&u.searchParams.get('alt')==='media'&&n===1)return new Response('synthetic foreign bytes');
  if(reason==='ownership'&&u.pathname==='/drive/v3/files/FILE_A'&&u.searchParams.get('fields'))return c.response(c.wire('file',{parents:['OTHER_A']}));
  return null;
 }});const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(waits,0);assert.equal(f.dispatched.filter(x=>x.method==='PUT'||x.request.body===B).length,0);assert.ok(bases(f).length<=3);
});
test('two exact two-second waits discard observations and preserve one matching CONTROL and stale A',async()=>{
 let n=0;const waits=[];const f=fixture({enforceIfMatch:true,pause:async ms=>{waits.push(ms);},respond:(url,_i,c)=>new URL(url).pathname.startsWith('/drive/v2/')&&++n<=4&&n%2===0?c.response(c.validator({version:'1'})):null});
 const r=await run(f);assert.equal(r.verdict,'observed-supported-one-case');assert.deepEqual(waits,[2000,2000]);assert.deepEqual(f.state.baseAcquisition,{attempts:3,waits:2});assert.equal(f.dispatched.length,36);assert.equal(f.dispatched.filter(x=>x.request.body===CONTROL).length,1);assert.equal(f.dispatched.filter(x=>x.request.body===B).length,1);assert.equal(f.state.records.filter(x=>x.operation==='conditional_A').length,1);
});
for(const change of ['expired','approval','identity','bytes','requests'])test(`BASE reentry after wait refuses ${change} before another triplet`,async()=>{
 let n=0,f;f=fixture({pause:async()=>{if(change==='expired')f.advance(600000);if(change==='approval')f.config.approved=false;if(change==='identity')f.config.identityAlias='B';if(change==='bytes')f.state.bytes=55000;if(change==='requests')f.state.attempts=49;},respond:(url,_i,c)=>new URL(url).pathname.startsWith('/drive/v2/')&&++n===2?c.response(c.validator({version:'1'})):null});
 const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(bases(f).length,3);assert.equal(f.dispatched.filter(x=>x.method==='PUT'||x.request.body===B).length,0);assert.equal(f.state.baseAcquisition.attempts,1);
});
test('guard retry API cannot waive unrelated stop or actor identity',async()=>{
 const f=fixture();await bootstrap(f);await f.guard.stop('transport');await assert.rejects(f.guard.retryBaseAcquisition('A'));await assert.rejects(f.guard.retryBaseAcquisition('B'));assert.equal(f.state.stop,'transport');assert.equal(f.state.baseAcquisition.attempts,0);
});
test('other validator acquisitions retain one triplet after CONTROL admission',async()=>{
 let n=0;const f=fixture({respond:(url,_i,c)=>new URL(url).pathname.startsWith('/drive/v2/')&&c.validator().version==='1'&&++n===2?c.response(c.validator({version:'2'})):null});const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(f.state.records.filter(x=>x.operation==='control_read').length,4);assert.equal(f.state.baseAcquisition.attempts,1);assert.equal(f.dispatched.filter(x=>x.method==='PUT').length,1);
});
test('actual malformed positive PUT200 event precedes local rejection without duplicate',async()=>{
 const f=fixture({respond:(_u,i,c)=>{if(i.body!==CONTROL)return null;c.setContent(CONTROL);return new Response('synthetic invalid JSON');}});const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(r.cleanup.completed,false);assert.equal(f.events.filter(e=>e.operation==='control_write'&&e.event==='request'&&e.status===200).length,1);assert.equal(f.state.records.filter(x=>x.operation==='control_write').length,1);assert.equal(f.state.intents.control_write.effect,'unresolved');
});
test('oversized BASE media is refused without retry and reports foreign effects conservatively',async()=>{
 let n=0;const f=fixture({respond:(url)=>{if(new URL(url).pathname.startsWith('/drive/v2/'))n++;if(new URL(url).searchParams.get('alt')==='media'&&n===1)return new Response('x'.repeat(65));return null;}});const r=await run(f);assert.equal(r.verdict,'inconclusive');assert.equal(f.state.stop,'transport');assert.equal(f.state.baseAcquisition.attempts,1);assert.equal(f.dispatched.filter(x=>x.method==='PUT').length,0);
});
test('request with insufficient response reserve is refused before create intent and forward',async()=>{
 const f=fixture();f.state.bytes=56500;const client=new DriveHttp({token:f.guard.token,fetch:(url,i)=>f.guard.fetch('A',url,i)});await assert.rejects(f.guard.operation('A','root_create',()=>client.createFolder('root',f.state.rootName,{r1Probe:f.state.marker})));assert.equal(f.dispatched.length,0);assert.equal(f.state.intents.root_create,undefined);
});
