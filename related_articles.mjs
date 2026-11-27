import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {htmlFiles} from './search_graph.mjs';

export function articleCatalog(dir) {
  const unique=new Map();
  for(const file of htmlFiles(dir)){
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    const article=document.querySelector('article'),canonical=document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if(!article?.querySelector('.articleBody')||!canonical||/noindex/.test(document.querySelector('meta[name="robots"]')?.content||''))continue;
    const u=new URL(canonical,'https://leeandnote.com');
    if(u.origin!=='https://leeandnote.com'||!u.pathname.startsWith('/blog/'))continue;
    const url=u.pathname.replace(/\/?$/,'/'),group=url.split('/')[2];
    unique.set(url,{file,url,group,title:article.querySelector('h1')?.textContent.trim()||document.title,
      stocks:[...article.querySelectorAll('td.stock small')].map(n=>n.textContent.match(/^[0-9A-Z]{6}/)?.[0]).filter(Boolean),
      date:url.match(/\d{4}-\d{2}-\d{2}/)?.[0]||'',
      description:document.querySelector('meta[name="description"]')?.getAttribute('content')||'',
      published:[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(n=>{try{const j=JSON.parse(n.textContent);return Array.isArray(j)?j:j['@graph']||[j];}catch{return [];}}).find(n=>n['@type']==='Article')?.datePublished?.slice(0,10)||'',
    });
  }
  return [...unique.values()];
}
export function selectRelated(current,catalog) {
  const candidates=catalog.filter(p=>p.url!==current.url);
  const score=p=>p.stocks.some(s=>current.stocks.includes(s))?100:p.group===current.group?20:p.group==='issues'?10:0;
  const sorted=candidates.sort((a,b)=>score(b)-score(a)||b.date.localeCompare(a.date)||a.url.localeCompare(b.url));
  const chosen=sorted.slice(0,3);
  if(current.group!=='issues'&&!chosen.some(p=>p.group==='issues')){
    const guide=sorted.find(p=>p.group==='issues');if(guide)chosen.splice(Math.min(chosen.length,2),1,guide);
  }
  return chosen.length>=2?chosen:[];
}
export function attachRelated(document,catalog) {
  const article=document.querySelector('article');
  if(!article?.querySelector('.articleBody')||document.querySelector('#rn-related'))return;
  const canonical=document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if(!canonical)return;
  const url=new URL(canonical,'https://leeandnote.com').pathname.replace(/\/?$/,'/');
  const current=catalog.find(p=>p.url===url)||{url,group:url.split('/')[2],stocks:[],date:''};
  const candidates=selectRelated(current,catalog);
  if(candidates.length){
    const section=document.createElement('section');section.id='rn-related';section.className='rn-related';
    const h=document.createElement('h2');h.textContent='함께 보면 좋은 글';section.append(h);
    const ul=document.createElement('ul');
    for(const p of candidates){const li=document.createElement('li'),a=document.createElement('a');a.href=p.url;a.textContent=p.title;li.append(a);ul.append(li);}
    section.append(ul);article.append(section);
  }
  const chronology=catalog.filter(p=>p.group===current.group&&p.date).sort((a,b)=>a.date.localeCompare(b.date));
  const i=chronology.findIndex(p=>p.url===current.url);
  if(i>=0&&(chronology[i-1]||chronology[i+1])){
    const nav=document.createElement('nav');nav.className='rn-adjacent';nav.setAttribute('aria-label','이전 글과 다음 글');
    for(const [label,p] of [['이전 글',chronology[i-1]],['다음 글',chronology[i+1]]])if(p){const a=document.createElement('a');a.href=p.url;const small=document.createElement('small');small.textContent=label;const span=document.createElement('span');span.textContent=p.title;a.append(small,span);nav.append(a);}
    article.append(nav);
  }
}
export function connectRelatedArticles(dir){
  const catalog=articleCatalog(dir);
  for(const file of htmlFiles(dir)){
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    if(!document.querySelector('article .articleBody'))continue;
    attachRelated(document,catalog);
    fs.writeFileSync(file,document.toString());
  }
  return catalog.length;
}
