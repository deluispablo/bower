import http from 'node:http';
import fs from 'node:fs';
const log='/private/tmp/bower-oauth-csp-probe-events.jsonl';
const event=(name,req)=>fs.appendFileSync(log,JSON.stringify({name,method:req.method,url:req.url})+'\n');
const target=http.createServer((req,res)=>{event('target',req);res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<h1>Synthetic redirect arrived</h1>');});
const source=http.createServer((req,res)=>{
 event('source',req);
 if(req.url==='/start'){res.writeHead(303,{Location:'http://127.0.0.1:8789/result','Cache-Control':'no-store'});res.end();return;}
 const allowed=req.url==='/allowed';
 res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'"+(allowed?' http://127.0.0.1:8789':'')});
 res.end('<h1>Local OAuth redirect policy probe</h1><p>'+(allowed?'Allowed control':'Original self-only policy')+'</p><form method="post" action="/start"><button>Continue synthetic redirect</button></form>');
});
source.listen(8788,'127.0.0.1');target.listen(8789,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{source.close();target.close();});
