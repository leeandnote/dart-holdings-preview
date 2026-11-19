import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML, DOMParser } from 'linkedom';
import { exclusiveThemes, ownershipHeadline, factualReview, reportCounts } from './daily_content.mjs';
import { normalizeRoute, normalizeSearchRoutes } from './canonical_routes.mjs';
import { connectSearchPages } from './search_graph.mjs';
import { buildSearchSitemaps,contentHash,historyEntry } from './search_sitemaps.mjs';
import { createTermPages,terms,termUrl } from './term_pages.mjs';
import { indexNowPayload } from './notify_indexnow.mjs';
const origin='https://leeandnote.com';
test('canonical routes normalize aliases without changing external URLs',()=>{
  for(const value of ['/about.html','about.html','/about/']) assert.equal(normalizeRoute(value,origin+'/blog/5percent/2026-11-19/'),'/about');
  assert.equal(normalizeRoute('/blog/5percent/2026-11-19?x=1#table'),'/blog/5percent/2026-11-19/?x=1#table');
  assert.equal(normalizeRoute('https://elsewhere.com/about.html'),'https://elsewhere.com/about.html');
  assert.equal(normalizeRoute('/assets/blog/image.svg'),'/assets/blog/image.svg');
});
test('report counts distinguish five disclosures from three companies',()=>{
  const rows=['a','a','a','b','c'].map((code,i)=>({code,receiptNo:String(i),reporter:'reporter'}));
  assert.deepEqual(reportCounts(rows),{reports:5,companies:3});
  assert.equal(exclusiveThemes([], [...rows,rows[0]]).flatMap(t=>t.rows).length,5);
});
test('missing companies link only to validated DART receipt URLs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dart-fallback-'));
  try {
    fs.mkdirSync(path.join(dir,'blog'),{recursive:true});
    const row=url=>`<tr><td class="stock"><strong>미수록</strong><small>999999</small></td><td><a class="subLink" href="${url}">원문</a></td></tr>`;
    const file=path.join(dir,'blog','index.html');
    fs.writeFileSync(file,page('/blog/example/','<article><h1>공시</h1><table>'+row('https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261119000333')+row('https://untrusted.example/report')+'</table></article>'));
    connectSearchPages(dir);
    const {document}=parseHTML(fs.readFileSync(file,'utf8'));
    assert.equal(document.querySelectorAll('td.stock a').length,1);
    assert.match(document.querySelector('td.stock a').href,/rcpNo=20261119000333$/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('canonical, social metadata, schema and links agree; redirects are idempotent',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-routes-'));
  try {
    const file=path.join(dir,'index.html');
    fs.writeFileSync(file,`<html><head><link rel="canonical" href="${origin}/blog/5percent/2026-11-19"><meta property="og:url" content="${origin}/blog/5percent/2026-11-19"><script type="application/ld+json">{"url":"${origin}/blog/5percent/2026-11-19","name":"about"}</script></head><body><a href="contact.html">Contact</a></body></html>`);
    normalizeSearchRoutes(dir);
    const first=fs.readFileSync(file,'utf8'), redirects=fs.readFileSync(path.join(dir,'_redirects'),'utf8');
    const {document}=parseHTML(first);
    assert.equal(document.querySelector('link').href,origin+'/blog/5percent/2026-11-19/');
    assert.equal(document.querySelector('meta').getAttribute('content'),origin+'/blog/5percent/2026-11-19/');
    assert.equal(JSON.parse(document.querySelector('script').textContent).name,'about');
    assert.equal(document.querySelector('a').href,'/contact');
    assert.match(redirects,/\/blog\/5percent\/2026-11-19 \/blog\/5percent\/2026-11-19\/ 301/);
    normalizeSearchRoutes(dir);
    assert.equal(fs.readFileSync(file,'utf8'),first);
    assert.equal(fs.readFileSync(path.join(dir,'_redirects'),'utf8').trim(),redirects.trim());
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
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
test('news fetch clocks do not modify pages, but article changes do',()=>{
  const html=page('/disclosurepedia/005930-test/','<h1>기업</h1><div class="companyNews"><ul><li><a href="https://example.com/news">기사 제목</a></li></ul><p>뉴스 확인: 26. 11. 19. 22:00 KST · 네이버 뉴스 검색</p></div>');
  assert.equal(contentHash(html),contentHash(html.replace('22:00','22:10')));
  assert.notEqual(contentHash(html),contentHash(html.replace('기사 제목','새로운 기사 제목')));
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
