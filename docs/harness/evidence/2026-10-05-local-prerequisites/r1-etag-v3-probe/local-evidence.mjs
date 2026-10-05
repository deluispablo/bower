// Local-only evidence renderer: no private paths, global fetch or provider calls.
import { writeFile } from 'node:fs/promises';
import { loadReviewed } from './reviewed.mjs';
import { fixture } from './synthetic.mjs';
import { runCase } from './case.mjs';
const loaded=await loadReviewed({ client:'/private/synthetic/client.json',session:'/private/synthetic/session.json',config:'/private/synthetic/config.json',manifest:'/private/synthetic/manifest.json' },()=>{});
await writeFile(new URL('./loaded-source-hashes.json',import.meta.url),JSON.stringify(loaded.hashes,null,2)+'\n');
const cases=[];
for(const [enforceIfMatch,failures] of [[true,0],[false,0],[true,2],[true,3]]){
 let n=0; const f=fixture({enforceIfMatch,respond:(url,_i,c)=>new URL(url).pathname.startsWith('/drive/v2/') && ++n<=failures*2 && n%2===0?c.response(c.validator({version:'1'})):null});const result=await runCase({DriveHttp:loaded.DriveHttp,guard:f.guard});
 cases.push({injectedTransport:enforceIfMatch?'synthetic-enforced-if-match':'synthetic-ignored-if-match',failures,result,baseAcquisition:f.state.baseAcquisition,events:f.events,bodyEqualsExpected: f.body()===(failures===3?'user: base\ncompiled: base\n':enforceIfMatch?'user: external\ncompiled: base\n':'user: base\ncompiled: app\n'),fileBinned:f.files.get('file').trashed===true,rootBinned:f.files.get('root').trashed===true,forwards:f.dispatched.length});
}
await writeFile(new URL('./local-cases.json',import.meta.url),JSON.stringify({providerExecution:'NOT RUN',cases},null,2)+'\n');
