import http from 'node:http';
const T='https://api.tappy.company';
http.createServer(async(req,res)=>{const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'};
if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}
const chunks=[];for await(const c of req)chunks.push(c);
const h={...req.headers};delete h.host;delete h.origin;delete h.referer;
try{const r=await fetch(T+req.url,{method:req.method,headers:h,body:chunks.length?Buffer.concat(chunks):undefined});
const b=Buffer.from(await r.arrayBuffer());const oh={...cors,'content-type':r.headers.get('content-type')||'application/octet-stream'};
let out=b; if((oh['content-type']||'').includes('json')) out=Buffer.from(b.toString().replaceAll(T,'http://localhost:8788'));
res.writeHead(r.status,oh);res.end(out);console.log(r.status,req.method,req.url.slice(0,80));}catch(e){res.writeHead(502,cors);res.end(String(e))}}).listen(8788,()=>console.log('proxy on 8788'));
