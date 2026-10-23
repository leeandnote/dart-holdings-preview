import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLinks} from './search_foundation.mjs';
import {searchGuides} from './search_guides.mjs';
test('canonical sitemap and internal links use final clean route',()=>{
 const value='<loc>https://leeandnote.com/about.html</loc><a href="/editorial-policy.html">policy</a>';
 assert.equal(normalizeLinks(value),'<loc>https://leeandnote.com/about</loc><a href="/editorial-policy">policy</a>');
 assert.equal(normalizeLinks(normalizeLinks(value)),normalizeLinks(value));
});
test('blackrock matching supports aliases and escapes source data',()=>{
 const guide=searchGuides([{reporter:'BlackRock <test>',reportDate:'20261022',corpName:'A',stockCode:'000001',currentRate:5,url:'https://dart.fss.or.kr/'},{reporter:'다른 기관'}])[0];
 assert.equal(guide.rows.length,1);assert.match(guide.row(guide.rows[0]),/&lt;test&gt;/);assert.match(guide.row(guide.rows[0]),/직전 보고 미확인/);
});
test('no matches do not assert no holdings',()=>assert.match(searchGuides([])[0].answer,/미보유를 뜻하지 않는다/));
