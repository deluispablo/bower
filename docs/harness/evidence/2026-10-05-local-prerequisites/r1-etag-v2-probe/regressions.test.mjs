import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.R1_TARGET ?? new URL('.', import.meta.url).pathname;
const { makeGuard, newState, BASE, A, B, FIELDS } = await import(`${base}/guard.mjs`);
const { runCase } = await import(`${base}/case.mjs`);
const { fixture } = await import(`${base}/synthetic.mjs`);
const { loadReviewed } = await import(`${base}/reviewed.mjs`);
const { DriveHttp } = await loadReviewed({ client:'/private/synthetic/client.json',session:'/private/synthetic/session.json',config:'/private/synthetic/config.json',manifest:'/private/synthetic/manifest.json' }, () => {});

for (const key of ['root', 'file']) for (const reply of ['unreadable201','missingId201','completed500']) test(`unresolved created ${key} survives ${reply} and cleanup-only without blind replay`, async () => {
  const f = fixture({ respond: (url, init, c) => {
    if (init.method !== 'POST' || (key === 'root' ? !url.includes('/drive/v3/files?') : !url.includes('/upload/drive/v3/files?'))) return null;
    c.files.set(key, c.wire(key));
    if (reply === 'unreadable201') return new Response('UNREADABLE_SYNTHETIC_CREATE_REPLY', { status: 201 });
    if (reply === 'missingId201') { const value = c.wire(key); delete value.id; return c.response(value, 201); }
    return c.response({ error:'SYNTHETIC_SERVER_FAILURE_AFTER_POSSIBLE_CREATE' }, 500);
  } });
  const initial = await runCase({ DriveHttp, guard:f.guard });
  assert.equal(initial.cleanup.completed, false);
  assert.ok(initial.cleanup.residual.includes(key === 'root' ? 'R1_ROOT_UNKNOWN' : 'R1_FILE_UNKNOWN'));
  assert.equal(f.dispatched.filter((r) => r.method === 'POST' && (key === 'root' ? r.url.includes('/drive/v3/files?') : r.url.includes('/upload/drive/v3/files?'))).length, 1);
  assert.ok(f.dispatched.every((r) => r.method !== 'PATCH'));
  const before = f.dispatched.length;
  const recovery = await runCase({ DriveHttp, guard:f.guard, cleanupOnly:true });
  assert.equal(recovery.cleanup.completed, false);
  assert.ok(recovery.cleanup.residual.includes(key === 'root' ? 'R1_ROOT_UNKNOWN' : 'R1_FILE_UNKNOWN'));
  assert.ok(f.dispatched.slice(before).every((r) => r.method !== 'POST' && r.method !== 'PATCH' && !r.url.includes('/files/root') && !r.url.includes('/files/OPAQUE_PARENT_A')));
  assert.equal(f.state.intents[key === 'root' ? 'root_create' : 'file_create'].status, reply === 'completed500' ? 500 : 201);
});

for (const status of [401,403,500]) test(`actual A conditional PUT ${status} with final B is inconclusive despite local retry refusal`, async () => {
  const f = fixture({ respond: (_url, init, c) => init.body === A ? c.response({ error:'SYNTHETIC_UNRELATED_FAILURE' }, status) : null });
  const result = await runCase({ DriveHttp, guard:f.guard });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.hashes.observedB, result.hashes.external); assert.equal(result.hashes.final, result.hashes.external);
  assert.equal(f.dispatched.filter((r) => r.request.body === A).length, 1);
  assert.ok(f.state.records.some((r) => r.actor === 'A' && r.operation === 'conditional_A' && r.status === status && r.complete));
  assert.doesNotMatch(JSON.stringify(result), /LOCAL_TOKEN|ROOT_A|FILE_A|UNRELATED_FAILURE/);
});

for (const wall of [0,-10000]) test(`monotonic elapsed beyond hard600s refuses dispatch with wall ${wall}`, async () => {
  let time=0, elapsed=0, forwarded=0; const f=fixture();
  const guard=makeGuard({ config:f.config,state:newState(0),now:()=>time,monotonic:()=>elapsed,persist:async()=>{},forward:async()=>{forwarded++;return new Response(JSON.stringify(f.wire('root')));} });
  const client=new DriveHttp({token:guard.token,fetch:(url,init)=>guard.fetch('A',url,init)});
  await guard.operation('A','root_create',()=>client.createFolder('root',f.config.rootName,{r1Probe:f.config.marker}));
  elapsed=600001; time=wall; await guard.cleanupMode();
  await assert.rejects(guard.operation('O','root_verify',()=>guard.fetch('O',`https://www.googleapis.com/drive/v3/files/ROOT_A?fields=${FIELDS}`,{headers:{authorization:'Bearer LOCAL_TOKEN'}})));
  assert.equal(forwarded,1);
});

test('new v2 private path is excluded before importing reviewed modules', async () => {
  let imported=0;
  await assert.rejects(loadReviewed({ client:'/private/synthetic/client.json',session:'/private/tmp/bower-r1-content-probe-v2/session.json' },()=>{},async()=>{imported++;throw new Error('LOCAL_IMPORT_SENTINEL');}));
  assert.equal(imported,0);
});

test('completed child failure with empty known-root inventory still cannot authorize root Bin', async () => {
  const f=fixture({respond:(url,init,c)=>init.method==='POST'&&url.includes('/upload/')?c.response({error:'SYNTHETIC_FAILURE_UNKNOWN_EFFECT'},500):null});
  const result=await runCase({DriveHttp,guard:f.guard});
  assert.deepEqual(result.cleanup,{completed:false,residual:['R1_ROOT','R1_FILE_UNKNOWN']});
  assert.ok(f.dispatched.every((r)=>r.method!=='PATCH'));
  assert.equal(f.files.get('root').trashed,false);
});

test('restarted CLI clock cannot renew an old manifest budget or mutate its identities', async () => {
  const f=fixture(); await runCase({DriveHttp,guard:f.guard});
  const state=structuredClone(f.state), before=JSON.stringify(state); let forwarded=0;
  assert.throws(()=>makeGuard({config:f.config,state,resumed:true,now:()=>0,monotonic:()=>0,persist:async()=>{},forward:async()=>{forwarded++;return new Response();}}));
  assert.equal(forwarded,0); assert.equal(JSON.stringify(state),before);
  assert.throws(()=>makeGuard({config:f.config,state,now:()=>0,monotonic:()=>0,persist:async()=>{},forward:async()=>new Response()}));
  assert.equal(JSON.stringify(state),before);
});

test('request timing uses monotonic elapsed and wall rollback refuses the next dispatch', async () => {
  const f=fixture(); let wall=0,mono=0,forwarded=0;
  const guard=makeGuard({config:f.config,state:newState(0),now:()=>wall,monotonic:()=>mono,persist:async()=>{},forward:async()=>{forwarded++;mono=17;wall=-50;return new Response(JSON.stringify(f.wire('root')));}});
  const client=new DriveHttp({token:guard.token,fetch:(url,init)=>guard.fetch('A',url,init)});
  await guard.operation('A','root_create',()=>client.createFolder('root',f.config.rootName,{r1Probe:f.config.marker}));
  assert.equal(guard.state.records[0].milliseconds,17); assert.equal(guard.state.clock.elapsed,17);
  await assert.rejects(guard.operation('O','root_verify',()=>guard.fetch('O',`https://www.googleapis.com/drive/v3/files/ROOT_A?fields=${FIELDS}`,{headers:{authorization:'Bearer LOCAL_TOKEN'}})));
  assert.equal(forwarded,1);
});
