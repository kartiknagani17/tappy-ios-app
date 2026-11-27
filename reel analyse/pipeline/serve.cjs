// Serves files from one folder to the browser (CORS + Private Network Access) for pasting into Gemini.
const http=require('http'),fs=require('fs'),path=require('path');const dir=process.argv[2];
http.createServer((q,r)=>{const h={'access-control-allow-origin':'*','access-control-allow-private-network':'true','access-control-allow-headers':'*'};
if(q.method==='OPTIONS'){r.writeHead(204,h);return r.end();}
const f=path.join(dir,path.basename(decodeURIComponent(q.url.split('?')[0])));
if(!fs.existsSync(f)){r.writeHead(404,h);return r.end();}
r.writeHead(200,{...h,'content-type':f.endsWith('.png')?'image/png':'image/jpeg'});fs.createReadStream(f).pipe(r);}).listen(8799,()=>console.log('serving on 8799'));
