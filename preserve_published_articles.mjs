import fs from 'node:fs';
import path from 'node:path';
import {DOMParser,parseHTML} from 'linkedom';
import {pathToFileURL} from 'node:url';
import {origin} from './note_series.mjs';

export function articlePath(value){
  const url=new URL(value);
  if(url.origin!==origin||url.search||url.hash||!/^\/blog\/(?:5percent|executives|contracts|major-events|issues)\/[a-z0-9-]+\/$/.test(url.pathname))return null;
  return url.pathname;
}
export function validatePublishedHtml(html,url){
  const {document}=parseHTML(html);
  if(!document.querySelector('article .articleBody')||document.querySelector('link[rel="canonical"]')?.href!==url)throw new Error('Published article identity mismatch');
  return html;
}
export async function preservePublishedArticles(root='site'){
  const response=await fetch(origin+'/sitemap-blog.xml',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Published blog sitemap unavailable; refusing incomplete deployment');
  const xml=await response.text(),doc=new DOMParser().parseFromString(xml,'text/xml');
  const urls=[...new Set([...doc.querySelectorAll('url > loc')].map(n=>n.textContent).filter(u=>articlePath(u)))];
  if(!urls.length)throw new Error('Published article inventory empty');
  let restored=0;
  for(const url of urls){
    const file=path.join(root,articlePath(url),'index.html');
    if(fs.existsSync(file))continue;
    const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw new Error(`Cannot preserve published article ${url}`);
    const html=validatePublishedHtml(await res.text(),url);
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);restored++;
  }
  console.log(`PUBLISHED_ARTICLES_PRESERVED=${urls.length}; RESTORED_MISSING=${restored}`);
  return urls.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await preservePublishedArticles();
