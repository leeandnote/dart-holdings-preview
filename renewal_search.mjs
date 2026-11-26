import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {articleCatalog} from './related_articles.mjs';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function disclosureRecords(dir) {
  const folder=path.join(dir,'data/blog-disclosures'), unique=new Map();
  if(!fs.existsSync(folder))return [];
  for(const file of fs.readdirSync(folder).filter(f=>/^\d{8}\.json$/.test(f)).sort()){
    const date=file.slice(0,8), rows=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));
    if(!Array.isArray(rows))continue;
    for(const r of rows){
      if(!/^\d{14}$/.test(r.receiptNo)||r.receiptNo.slice(0,8)!==date||r.date!==date)continue;
      let url;try{url=new URL(r.url);}catch{continue;}
      if(url.protocol!=='https:'||url.hostname!=='dart.fss.or.kr')continue;
      unique.set(`${r.receiptNo}:${r.code}:${r.reporter}`,{...r,url:url.href});
    }
  }
  return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.receiptNo.localeCompare(a.receiptNo));
}
export function makeSearchIndex(dir){
  const articles=articleCatalog(dir).map(p=>{
    const {document}=parseHTML(fs.readFileSync(p.file,'utf8'));
    return {kind:'article',title:p.title,url:p.url,date:p.date,description:document.querySelector('meta[name="description"]')?.content||'',keywords:p.stocks.join(' ')};
  });
  const rows=disclosureRecords(dir).map(r=>({kind:'disclosure',title:r.name,url:r.url,date:`${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6)}`,description:`${r.category} · ${r.reporter} · ${r.reason||''}`,keywords:r.code,category:r.category}));
  return [...articles,...rows];
}
export function buildUnifiedSearch(dir,signals=[]){
  const index=[...makeSearchIndex(dir),...signals.map(r=>({kind:'disclosure',title:r.name,url:r.url,date:`${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6)}`,description:r.reason,keywords:r.code,category:r.category}))], target=path.join(dir,'search');fs.mkdirSync(target,{recursive:true});
  fs.mkdirSync(path.join(dir,'data'),{recursive:true});
  fs.writeFileSync(path.join(dir,'data/search-index.json'),JSON.stringify(index));
  fs.writeFileSync(path.join(target,'index.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>통합검색 | 리앤노트</title><meta name="robots" content="noindex,follow"><meta name="description" content="종목, 보고자, 보고 사유와 공시 해설을 함께 검색합니다."><link rel="canonical" href="https://leeandnote.com/search/"><link rel="stylesheet" href="/renewal-discovery.css"></head><body><main class="rn-discovery"><header class="rn-discovery-heading"><p>SEARCH</p><h1>통합검색</h1></header><form class="rn-unified-form" action="/search/" role="search"><label for="search-query">종목 · 코드 · 보고자 · 공시 해설</label><div><input id="search-query" name="q" type="search" maxlength="120" required><button aria-label="검색"><img src="/assets/icons/search.svg" width="24" height="24" alt=""></button></div></form><div class="rn-search-tabs" role="group" aria-label="검색 범위"><button type="button" data-kind="all" aria-pressed="true">전체</button><button type="button" data-kind="disclosure" aria-pressed="false">공시</button><button type="button" data-kind="article" aria-pressed="false">인사이트</button></div><p id="search-status" role="status" aria-live="polite">검색어를 입력해 주세요.</p><ul id="search-results" class="rn-result-list"></ul><button id="search-more" type="button" hidden>더 보기</button><noscript>검색에는 JavaScript가 필요합니다. <a href="/blog/">인사이트 목록</a> 또는 <a href="/5percent">공시 데이터</a>에서 확인할 수 있습니다.</noscript></main><script type="module" src="/unified-search.mjs"></script></body></html>`);
  return {articles:index.filter(r=>r.kind==='article').length,disclosures:index.filter(r=>r.kind==='disclosure').length};
}
