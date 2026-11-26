import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {applyRenewalLayout} from './renewal_layout.mjs';
import {parseHTML} from 'linkedom';
import {articleCatalog,attachRelated} from './related_articles.mjs';
import {retireLinks} from './retire_disclosurepedia.mjs';

const root=path.resolve(process.env.PREVIEW_ROOT||'site');
const catalog=articleCatalog(root);
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json'};
export const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(/^\/disclosurepedia(?:\/|$)/.test(url.pathname)){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'}).end(fs.readFileSync(path.join(root,'404.html')));return;}
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)&&fs.existsSync(file+'.html'))file+='.html';
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  const ext=path.extname(file);
  let data=fs.readFileSync(file);
  if(ext==='.html'&&url.searchParams.get('before')!=='1'){
    const {document}=parseHTML(retireLinks(data.toString()));attachRelated(document,catalog);data=applyRenewalLayout(document.toString());
  }
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}).end(data);
});
server.listen(Number(process.env.PORT||4178),'127.0.0.1',()=>console.log(`Renewal preview: http://127.0.0.1:${server.address().port}`));
