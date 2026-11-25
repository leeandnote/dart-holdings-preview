import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseHTML, DOMParser } from 'linkedom';
import { htmlFiles } from './search_graph.mjs';
import { terms, termUrl } from './term_pages.mjs';
import { isRetiredUrl } from './retire_disclosurepedia.mjs';

const origin='https://leeandnote.com';
const xmlEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const canonicalKey=s=>decodeURI(new URL(s,origin).href);
export function contentHash(html){
  const {document}=parseHTML(html);
  const main=(document.querySelector('main')||document.body).cloneNode(true);
  main.querySelectorAll('script,style,#editorial-byline,.postDate').forEach(e=>e.remove());
  // Refreshing the news fetch clock is not a substantive content update.
  main.querySelectorAll('.companyNews > p').forEach(e=>{if(e.textContent.trim().startsWith('뉴스 확인:'))e.remove();});
  const schemas=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent));
  const omitDates=(key,value)=>['dateModified','datePublished'].includes(key)?undefined:value;
  const content=[document.title,document.querySelector('meta[name="description"]')?.content,main.innerHTML.replace(/\s+/g,' ').trim(),JSON.stringify(schemas,omitDates)];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
export function historyEntry(hash,previous,now){
  if(previous?.hash===hash)return previous;
  // Initial observation is not evidence of when legacy content was last edited.
  return {hash,modifiedAt:previous?now:null};
}
export async function buildSearchSitemaps(dist,{remote=true,previous,now=new Date().toISOString()}={}){
  if(previous===undefined){
    previous={};
    if(remote){
      const r=await fetch(origin+'/data/search-history.json',{signal:AbortSignal.timeout(20000)});
      if(r.ok){const body=await r.json();if(body.version!==1||!body.entries)throw new Error('Invalid search history');previous=body.entries;}
      else if(r.status!==404)throw new Error(`Search history unavailable: ${r.status}`);
    }
  }
  const source=new DOMParser().parseFromString(fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8'),'text/xml');
  const allowed=new Set([...source.querySelectorAll('url > loc')].map(e=>canonicalKey(e.textContent)));
  for(const t of terms)allowed.add(canonicalKey(origin+termUrl(t)));
  const entries={},groups={pages:[],blog:[],terms:[]},changed=[];
  for(const file of htmlFiles(dist)){
    const html=fs.readFileSync(file,'utf8'),{document}=parseHTML(html);
    const raw=document.querySelector('link[rel="canonical"]')?.href;
    if(!raw||new URL(raw,origin).origin!==origin)continue;
    const url=canonicalKey(raw);
    if(isRetiredUrl(url))continue;
    const publicContent=/^\/(?:blog|stock-terms)\//.test(new URL(url).pathname);
    if((!allowed.has(url)&&!publicContent)||entries[url]||/noindex/i.test(document.querySelector('meta[name="robots"]')?.content||''))continue;
    const entry=historyEntry(contentHash(html),previous[url],now);entries[url]=entry;
    if(previous[url]?.hash!==entry.hash)changed.push(new URL(url).href);
    const pathname=new URL(url).pathname;
    const group=pathname.startsWith('/blog/')?'blog':pathname.startsWith('/stock-terms')?'terms':'pages';
    groups[group].push({url:new URL(url).href,...entry});
  }
  for(const list of Object.values(groups))list.sort((a,b)=>a.url.localeCompare(b.url));
  for(const [group,list] of Object.entries(groups))fs.writeFileSync(path.join(dist,`sitemap-${group}.xml`),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list.map(e=>`<url><loc>${xmlEscape(e.url)}</loc>${e.modifiedAt?`<lastmod>${e.modifiedAt}</lastmod>`:''}</url>`).join('\n')}</urlset>`);
  fs.writeFileSync(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(groups).map(g=>`<sitemap><loc>${origin}/sitemap-${g}.xml</loc></sitemap>`).join('\n')}</sitemapindex>`);
  const removed=Object.keys(previous).filter(url=>isRetiredUrl(url)&&!entries[url]).map(url=>new URL(url).href);
  fs.writeFileSync(path.join(dist,'data/search-history.json'),JSON.stringify({version:1,entries}));
  fs.writeFileSync(path.join(dist,'data/search-changes.json'),JSON.stringify({version:1,generatedAt:now,urls:[...new Set([...changed,...removed])],removed}));
  return {pages:Object.keys(entries).length,changed:changed.length,removed:removed.length};
}
