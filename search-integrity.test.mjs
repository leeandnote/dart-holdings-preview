import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML, DOMParser } from 'linkedom';
import { exclusiveThemes, ownershipHeadline, factualReview } from './daily_content.mjs';
import { connectSearchPages } from './search_graph.mjs';
import { buildSearchSitemaps,contentHash,historyEntry } from './search_sitemaps.mjs';
import { createTermPages,terms,termUrl } from './term_pages.mjs';
import { indexNowPayload } from './notify_indexnow.mjs';
const origin='https://leeandnote.com';
const page=(url,body)=>`<!doctype html><html><head><title>공시</title><meta name="description" content="공시 해설"><link rel="canonical" href="${origin+url}"></head><body><main>${body}</main></body></html>`;
test('exclusive categories preserve every disclosure once; headlines follow stocks',()=>{
  const a={receiptNo:'1',code:'005930',name:'가나다',reporter:'JP Morgan',delta:1,rateText:'5 → 6',deltaText:'+1%p',reason:'변동'},b={...a,receiptNo:'2',name:'다라마',delta:3};
  const result=exclusiveThemes([{rows:[a],heading:'A'},{rows:[a,b],heading:'B'},{rows:[b]}],[a,b,{...a,receiptNo:'3'}]);
  assert.deepEqual(result.flatMap(t=>t.rows.map(r=>r.receiptNo)),['1','2','3']);
  assert.equal(ownershipHeadline([a,b],[]),'다라마·가나다 지분 변동');
  assert.ok(factualReview([a])[0].includes('JP Morgan'));
});
test('modification time is stable and unknown historic dates are omitted',()=>{
  const a=page('/','<h1>제목</h1><p>내용</p><div id="editorial-byline">수정 오늘</div>');
  assert.equal(contentHash(a),contentHash(a.replace('수정 오늘','수정 내일')));
  const first=historyEntry(contentHash(a),null,'2026-11-19T00:00:00Z');assert.equal(first.modifiedAt,null);
  assert.deepEqual(historyEntry(contentHash(a),first,'2026-11-20T00:00:00Z'),first);
  assert.equal(historyEntry(contentHash(a.replace('내용','다른 내용')),first,'2026-11-20T00:00:00Z').modifiedAt,'2026-11-20T00:00:00Z');
});
test('IndexNow rejects foreign URLs and deduplicates valid notifications',()=>{
  assert.throws(()=>indexNowPayload('abcdefgh',['https://elsewhere.com/']));
  assert.throws(()=>indexNowPayload('bad',[]));
  assert.equal(indexNowPayload('abcdefgh',[origin+'/',origin+'/']).urlList.length,1);
});
test('terms, reciprocal links, breadcrumbs and split sitemaps remain stable',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'search-integrity-'));
  const put=(file,html)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),html);};
  try{
    put('data/.keep','');
    put('stock-terms.html',page('/stock-terms','<h1>용어</h1>'));
    put('disclosurepedia/005930-test/index.html',page('/disclosurepedia/005930-test/','<h1>기업</h1>'));
    put('blog/5percent/2026-11-18/index.html',page('/blog/5percent/2026-11-18/','<article><h1>오늘 공시</h1><p>보유비율 설명</p><table><tr><td class="stock"><strong>삼성전자</strong><small>005930 · KOSPI</small></td><td class="stock"><strong>미수록</strong><small>999999</small></td></tr></table></article>'));
    const sitemap=`<urlset>${['/stock-terms','/disclosurepedia/005930-test/','/blog/5percent/2026-11-18/'].map(p=>`<url><loc>${origin+p}</loc><lastmod>2000-01-01</lastmod></url>`).join('')}</urlset>`;
    put('sitemap.xml',sitemap);
    createTermPages(dir);connectSearchPages(dir);
    const post=fs.readFileSync(path.join(dir,'blog/5percent/2026-11-18/index.html'),'utf8');
    assert.ok(post.includes('href="/disclosurepedia/005930-test/"'));
    assert.ok(post.includes('href="/stock-terms/holding-ratio/"'));
    assert.ok(!post.includes('/disclosurepedia/999999'));
    assert.ok(post.includes('articleBreadcrumb'));
    assert.ok(fs.readFileSync(path.join(dir,'disclosurepedia/005930-test/index.html'),'utf8').includes('href="/blog/5percent/2026-11-18/"'));
    connectSearchPages(dir);assert.equal(fs.readFileSync(path.join(dir,'blog/5percent/2026-11-18/index.html'),'utf8'),post);
    for(const term of terms){const {document}=parseHTML(fs.readFileSync(path.join(dir,termUrl(term),'index.html'),'utf8'));assert.equal(document.querySelectorAll('h1').length,1);assert.equal(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'][0]['@type'],'DefinedTerm');}
    await buildSearchSitemaps(dir,{previous:{}});
    const previous=JSON.parse(fs.readFileSync(path.join(dir,'data/search-history.json'),'utf8')).entries;
    const xml=new DOMParser().parseFromString(fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8'),'text/xml');assert.equal(xml.querySelectorAll('sitemap').length,4);
    assert.ok(!fs.readFileSync(path.join(dir,'sitemap-blog.xml'),'utf8').includes('lastmod'));
    put('sitemap.xml',sitemap);
    const result=await buildSearchSitemaps(dir,{previous});assert.equal(result.changed,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
