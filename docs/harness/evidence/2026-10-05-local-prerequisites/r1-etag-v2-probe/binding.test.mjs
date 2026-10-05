import test from 'node:test';
import assert from 'node:assert/strict';
import {parseValidator,readStable,validateBinding,contentHash} from './binding.mjs';
const BASE='user: base\ncompiled: base\n';
const context={fileId:'FILE_A',folderId:'ROOT_A',account:'A',scopeSet:'full-drive',strategy:'drive-v2-etag-if-match'};
const tag={id:'FILE_A',etag:'"GEN_A"',version:'9007199254740993'};
test('loaded stable-read stub executes metadata bytes metadata against literal backend',async()=>{
 const calls=[];const token=await readStable({readMetadata:async()=>{calls.push('metadata');return {...tag};},readBytes:async()=>{calls.push('bytes');return Buffer.from(BASE);},expected:BASE,context});
 assert.deepEqual(calls,['metadata','bytes','metadata']);assert.equal(token.contentHash,contentHash(BASE));assert.equal(token.etag,'"GEN_A"');
});
for(const metadata of [{...tag,id:'OTHER_A'},{...tag,etag:'W/"GEN_A"'},{...tag,etag:null},{...tag,etag:'GEN_A'},{...tag,version:9007199254740992},{...tag,version:'1.5'}])test(`validator refuses wrong identity weak missing or unsafe version ${JSON.stringify(metadata)}`,()=>assert.throws(()=>parseValidator(metadata,'FILE_A')));
for(const variant of ['changedTag','ABA','changedBytes'])test(`stable acquisition refuses ${variant} rather than rebinding stale bytes`,async()=>{
 let n=0;await assert.rejects(readStable({readMetadata:async()=>++n===1?{...tag}:variant==='changedTag'?{...tag,etag:'"GEN_B"'}:variant==='ABA'?{...tag,version:'9007199254740994'}:{...tag},readBytes:async()=>Buffer.from(variant==='changedBytes'?'user: changed\ncompiled: base\n':BASE),expected:BASE,context}));
});
for(const change of [{account:'B'},{fileId:'OTHER_A'},{folderId:'OTHER_ROOT'},{contentHash:contentHash('different')},{etag:'W/"GEN_A"'}])test(`read binding refuses unrelated context or bytes ${JSON.stringify(change)}`,()=>{
 const token={...context,etag:tag.etag,version:tag.version,contentHash:contentHash(BASE),...change};assert.throws(()=>validateBinding(token,context,BASE));
});
