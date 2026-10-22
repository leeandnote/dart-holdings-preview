import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceArticle,termGroups} from './blog_editorial.mjs';
const url='https://leeandnote.com/blog/contracts/2026-10-21/';
const html='<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","datePublished":"2026-10-21","dateModified":"2026-10-21"}]}</script></head><body><article><h1>수주 분석</h1><p>계약 공시</p></article></body></html>';
const now='2026-10-22T10:00:00.000Z';
function article(h){return JSON.parse(h.match(/application\/ld\+json">([^<]+)/)[1])['@graph'][0];}
test('legacy report dates are not invented publication dates',()=>{const r=enhanceArticle(html,url,null,now);assert.equal(article(r.html).datePublished,undefined);assert.match(r.html,/이전 기록 미확인/);assert.match(r.html,/공시 기준일/);assert.equal(article(r.html).author.name,'리앤노트');});
test('new pages get a persisted creation timestamp only with history',()=>{const r=enhanceArticle(html,url,null,now,true);assert.equal(article(r.html).datePublished,now);const next=enhanceArticle(html,url,r.entry,'2026-10-23T10:00:00.000Z',true);assert.deepEqual(next.entry,r.entry);});
test('content changes update modified time without moving published time',()=>{const r=enhanceArticle(html,url,null,now,true);const next=enhanceArticle(html.replace('계약 공시','계약 정정'),url,r.entry,'2026-10-23T10:00:00.000Z',true);assert.equal(next.entry.publishedAt,now);assert.notEqual(next.entry.modifiedAt,r.entry.modifiedAt);});
test('category lists are not decorated as authored articles',()=>assert.equal(enhanceArticle('<h1>블로그</h1>',url,null,now).html,'<h1>블로그</h1>'));
test('topic terms and bibliography are rendered in crawlable HTML',()=>{const r=enhanceArticle(html,url,null,now);for(const [q] of termGroups.contracts)assert.ok(r.html.includes(q));assert.ok(!r.html.includes('IND 신청'));assert.match(r.html,/BreadcrumbList/);assert.match(r.html,/stock-terms.html#contracts/);});
test('reapplying decoration does not duplicate sections',()=>{const r=enhanceArticle(html,url,null,now);assert.equal(enhanceArticle(r.html,url,r.entry,now).html,r.html);});
