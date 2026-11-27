import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {applyArticleDesign,measureArticle} from './renewal_article.mjs';
import {seoSnapshot,applyRenewalLayout} from './renewal_layout.mjs';
const fixture=(text,extras='')=>parseHTML(`<html><head><title>Original</title><link rel="canonical" href="https://leeandnote.com/blog/5percent/2026-11-19/"></head><body><article><header class="blogHero"><h1>2026.11.19 삼성전자 | 5%보고공시</h1></header><section class="articleBody"><div class="summaryBox">요약</div><p>${text}</p><h2>A?</h2><h2>B?</h2><h2>C?</h2><h2>D?</h2>${extras}</section></article></body></html>`).document;
test('preserved old article upgrades once without duplicate byline or CTA',()=>{
 const d=fixture('본문','<section class="guideContents"><ol><li><a href="#a">A</a></li></ol></section>');
 d.querySelector('article').setAttribute('data-rn-article','');
 d.body.insertAdjacentHTML('afterbegin','<header id="rn-header"></header><aside class="rn-scroll-cta"></aside>');
 d.querySelector('article').insertAdjacentHTML('beforeend','<div class="rn-author">old</div><section class="rn-article-cta">old</section>');
 const upgraded=applyRenewalLayout(d.toString()),{document}=parseHTML(upgraded);
 assert.equal(document.querySelectorAll('.rn-author').length,1);
 assert.equal(document.querySelectorAll('.rn-article-cta').length,1);
 assert.equal(document.querySelectorAll('.rn-compact-toc').length,1);
 assert.equal(document.querySelectorAll('.guideContents').length,0);
 assert.equal(applyRenewalLayout(upgraded),upgraded);
});
test('short prose excludes long tables and omits ornamental summary/TOC',()=>{
 const d=fixture('본문',`<table><tbody><tr><td>${'데이터'.repeat(2000)}</td></tr></tbody></table>`);
 const report=applyArticleDesign(d);
 assert.ok(report.bodyChars<100);assert.equal(d.querySelector('.rn-toc'),null);assert.equal(d.querySelector('.summaryBox'),null);
 assert.ok(d.querySelector('.rn-intro'));assert.ok(d.querySelector('.rn-single-record'));
 assert.equal(d.querySelector('h1').textContent,'삼성전자');assert.equal(d.querySelector('title').textContent,'Original');
});
test('long prose enables anchored TOC; identical plain columns collapse with labels',()=>{
 const d=fixture('본문 '.repeat(1200),'<table><thead><tr><th>종목</th><th>제출인</th></tr></thead><tbody><tr><td>A</td><td>기관</td></tr><tr><td>B</td><td>기관</td></tr></tbody></table>');
 applyArticleDesign(d);assert.ok(d.querySelector('.rn-toc'));assert.ok(d.querySelector('.summaryBox'));
 assert.equal(d.querySelector('.rn-table-context').textContent,'제출인: 기관');assert.equal(d.querySelectorAll('thead th').length,1);
});
test('matching real FAQ becomes accessible details without changing SEO',()=>{
 const html=fs.readFileSync('site/blog/issues/rights-offering-disclosure-guide/index.html','utf8');
 const output=applyRenewalLayout(html);assert.deepEqual(seoSnapshot(html),seoSnapshot(output));
 const d=parseHTML(output).document;assert.equal(d.querySelectorAll('.rn-faq').length,5);assert.ok(d.querySelector('.rn-author'));
 assert.equal(applyRenewalLayout(output),output);
});
test('audit records no invented author profile',()=>assert.equal(measureArticle(fixture('본문')).gates.authorProfile,false));
test('metadata is consolidated and short guide contents become one disclosure',()=>{
 const d=fixture('본문','<nav class="guideContents"><h2>이 글에서 확인할 내용</h2><ol><li>A</li></ol></nav><p>작성·편집: 리앤노트 · 자료 수집·정정 기준</p>');
 const old=d.createElement('div');old.id='editorial-byline';old.textContent='작성·운영';d.querySelector('.blogHero').append(old);
 applyArticleDesign(d);assert.equal(d.querySelector('#editorial-byline'),null);assert.equal(d.querySelectorAll('.rn-author').length,1);assert.equal(d.querySelectorAll('.rn-compact-toc').length,1);assert.equal(d.querySelector('.guideContents'),null);assert.doesNotMatch(d.querySelector('.articleBody').textContent,/작성·편집:/);
});
