import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {htmlFiles} from './search_graph.mjs';

export function isRetiredUrl(raw) {
  try {const u=new URL(raw,'https://leeandnote.com');return ['leeandnote.com','www.leeandnote.com'].includes(u.hostname)&&/^\/disclosurepedia(?:\/|$)/.test(u.pathname);} catch{return false;}
}
export function retireLinks(html) {
  const {document}=parseHTML(html);
  for(const a of document.querySelectorAll('a[href]')) {
    if(!isRetiredUrl(a.getAttribute('href')))continue;
    const route=new URL(a.getAttribute('href'),'https://leeandnote.com').pathname;
    if(/^\/disclosurepedia\/?$/.test(route)) {
      if(a.closest('nav')||a.classList.contains('radarRow')||a.closest('.homeQualityLinks')){a.remove();continue;}
      a.setAttribute('href','/5percent');a.textContent='공시 검색';
    } else {
      const name=a.textContent.trim();
      a.setAttribute('href','/5percent?q='+encodeURIComponent(name));
      a.setAttribute('aria-label',`${name} 공시 검색`);
    }
  }
  // Retired navigation items are removed, while remaining schema positions stay sequential.
  const cleanSchema=value=>{
    if(typeof value==='string')return isRetiredUrl(value)?'https://leeandnote.com/5percent':value.replaceAll('공시피디아','공시 검색');
    if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==='object'&&isRetiredUrl(v.url||v.item||''))).map(cleanSchema).map((v,i)=>v&&typeof v==='object'&&'position'in v?{...v,position:i+1}:v);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cleanSchema(v)]));
    return value;
  };
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if(/disclosurepedia|공시피디아/.test(script.textContent))script.textContent=JSON.stringify(cleanSchema(JSON.parse(script.textContent)));
  }
  const walk=node=>{
    if(['SCRIPT','STYLE'].includes(node.nodeName))return;
    if(node.nodeType===3)node.textContent=node.textContent.replaceAll('공시피디아','공시 검색');
    else [...node.childNodes].forEach(walk);
  };walk(document.body);
  return document.toString();
}
export function retireDisclosurepedia(dist) {
  if(fs.existsSync(path.join(dist,'disclosurepedia')))throw new Error('Retired pages must be excluded during copy');
  let count=0;
  for(const file of htmlFiles(dist)) {
    const html=fs.readFileSync(file,'utf8');
    if(!/disclosurepedia|공시피디아/.test(html))continue;
    const output=retireLinks(html);
    if(/disclosurepedia|공시피디아/.test(output))throw new Error(`Unresolved retired reference: ${file}`);
    fs.writeFileSync(file,output);count++;
  }
  const redirects=path.join(dist,'_redirects');
  if(fs.existsSync(redirects))fs.writeFileSync(redirects,fs.readFileSync(redirects,'utf8').split(/\r?\n/).filter(line=>!line.includes('/disclosurepedia')).join('\n'));
  // With a top-level 404.html and no matching files, Pages returns real 404s, not SPA fallbacks.
  if(!fs.existsSync(path.join(dist,'404.html')))throw new Error('Missing explicit 404 page');
  return {pagesCleaned:count,status:404};
}
