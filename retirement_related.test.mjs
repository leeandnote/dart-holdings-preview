import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {retireLinks,isRetiredUrl} from './retire_disclosurepedia.mjs';
import {buildSearchSitemaps} from './search_sitemaps.mjs';
import {selectRelated,attachRelated} from './related_articles.mjs';
import {applyInstitutionGate} from './institution_gate.mjs';
import retiredWorker from './site/_worker.js';
test('retired worker returns 410 without redirects and does not intercept other pages',async()=>{
 const response=await retiredWorker.fetch(new Request('https://leeandnote.com/disclosurepedia/005930-test/'),{});
 assert.equal(response.status,410);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Location'),null);
 const expected=new Response('asset');assert.equal(await retiredWorker.fetch(new Request('https://leeandnote.com/blog/'),{ASSETS:{fetch:()=>expected}}),expected);
});
test('institution indexability requires ten distinct official receipts',()=>{
 const page=count=>parseHTML(`<html><head><link rel="canonical" href="https://leeandnote.com/blog/issues/truston-asset-holdings/"></head><body><article><table>${Array.from({length:count},(_,i)=>`<tr><td><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=2026111900${String(i).padStart(4,'0')}">원문</a></td></tr>`).join('')}</table></article></body></html>`).document;
 const small=page(9);assert.equal(applyInstitutionGate(small).indexable,false);assert.equal(small.querySelector('meta[name="robots"]').getAttribute('content'),'noindex, follow');
 const enough=page(10);assert.equal(applyInstitutionGate(enough).indexable,true);assert.equal(enough.querySelector('meta[name="robots"]'),null);
});
test('retired company links become search, hub navigation removed and schema cleaned',()=>{
 const result=retireLinks('<html><head><script type="application/ld+json">{"name":"공시피디아","url":"https://leeandnote.com/disclosurepedia/"}</script></head><body><nav><a href="/disclosurepedia/">공시피디아</a></nav><p><a href="/disclosurepedia/005930-samsung/">삼성전자</a></p><a href="https://dart.fss.or.kr/">DART</a></body></html>');
 assert.doesNotMatch(result,/disclosurepedia|공시피디아/);
 const {document}=parseHTML(result);assert.equal(document.querySelector('p a').href,'/5percent?q='+encodeURIComponent('삼성전자'));
 assert.ok(document.querySelector('a[href="https://dart.fss.or.kr/"]'));
 assert.equal(isRetiredUrl('https://external.example/disclosurepedia/'),false);
});
test('deleted pages enter one deployment manifest but not the next history generation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retired-sitemap-'));
 try{
  fs.mkdirSync(path.join(dir,'data'));fs.writeFileSync(path.join(dir,'sitemap.xml'),'<urlset></urlset>');
  const retired='https://leeandnote.com/disclosurepedia/005930-test/';
  let result=await buildSearchSitemaps(dir,{previous:{[retired]:{hash:'old'}}});assert.equal(result.removed,1);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'data/search-changes.json')));assert.deepEqual(manifest.urls,[retired]);
  const previous=JSON.parse(fs.readFileSync(path.join(dir,'data/search-history.json'))).entries;
  result=await buildSearchSitemaps(dir,{previous});assert.equal(result.removed,0);assert.equal(result.changed,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('related selection prioritizes actual common stocks, excludes self and includes a guide',()=>{
 const current={url:'/blog/5percent/2026-11-19/',group:'5percent',stocks:['005930'],date:'2026-11-19'};
 const catalog=[current,...['18','17','16'].map(d=>({...current,url:`/blog/5percent/2026-11-${d}/`,date:`2026-11-${d}`,title:d})),{url:'/blog/issues/guide/',group:'issues',stocks:[],date:'',title:'공시 읽기'}];
 const selected=selectRelated(current,catalog);assert.equal(selected.length,3);assert.ok(selected.some(p=>p.group==='issues'));assert.ok(!selected.includes(current));
 const {document}=parseHTML(`<html><head><link rel="canonical" href="https://leeandnote.com${current.url}"></head><body><article><h1>제목</h1></article></body></html>`);
 attachRelated(document,catalog);attachRelated(document,catalog);assert.equal(document.querySelectorAll('#rn-related').length,1);
 assert.equal(document.querySelectorAll('.rn-adjacent').length,1);
 assert.deepEqual(selectRelated(current,[current,catalog[1]]),[]);
});
