import {createServer} from 'node:http';
const expected='http://localhost:8789';
const server=createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');
  res.setHeader('referrer-policy','no-referrer');
  const path=req.url?.split('?')[0];
  if(req.method==='GET' && ['/blocked','/allowed'].includes(path)){
    if(path==='/allowed')res.setHeader('referrer-policy','same-origin');
    res.setHeader('set-cookie','synthetic_binding=fixture; HttpOnly; SameSite=Lax; Path=/');
    res.setHeader('content-security-policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(`<h1>Origin fixture ${path.slice(1)}</h1><form method="post" action="/check"><input type="hidden" name="csrf" value="fixture"><button>Submit synthetic form</button></form>`);
    return;
  }
  if(req.method==='POST'&&path==='/check'){
    let body='';for await(const c of req){body+=c;if(body.length>1000){res.writeHead(400);res.end('Refused');return;}}
    const originMatches=req.headers.origin===expected;
    const originKind=req.headers.origin===undefined?'absent':req.headers.origin==='null'?'null':originMatches?'expected':'other';
    const bindingCookiePresent=/(?:^|; )synthetic_binding=fixture(?:;|$)/.test(req.headers.cookie??'');
    const csrfMatches=new URLSearchParams(body).get('csrf')==='fixture';
    const accepted=originMatches&&bindingCookiePresent&&csrfMatches&&req.headers.host==='localhost:8789';
    console.log(JSON.stringify({event:'synthetic_post',originKind,originMatches,bindingCookiePresent,csrfMatches,accepted,status:accepted?200:400}));
    res.writeHead(accepted?200:400,{'content-type':'text/html; charset=utf-8'});
    res.end(`<h1>${accepted?'Synthetic origin accepted':'Synthetic origin refused'}</h1>`);return;
  }
  res.writeHead(404);res.end('Not found');
});
server.listen(8789,'127.0.0.1',()=>console.log('Synthetic origin fixture listening'));
const stop=()=>server.close();process.once('SIGINT',stop);process.once('SIGTERM',stop);
const timer=setTimeout(stop,300000);server.once('close',()=>clearTimeout(timer));
