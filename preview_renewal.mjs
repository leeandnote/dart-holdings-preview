import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {applyRenewalLayout} from './renewal_layout.mjs';

const root=path.resolve('site');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json'};
export const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)&&fs.existsSync(file+'.html'))file+='.html';
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  const ext=path.extname(file);
  const data=ext==='.html'&&url.searchParams.get('before')!=='1'?applyRenewalLayout(fs.readFileSync(file,'utf8')):fs.readFileSync(file);
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}).end(data);
});
server.listen(Number(process.env.PORT||4178),'127.0.0.1',()=>console.log(`Renewal preview: http://127.0.0.1:${server.address().port}`));
