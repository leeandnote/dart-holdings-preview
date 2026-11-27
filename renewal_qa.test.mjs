import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {capitalGuides} from './capital_guides.mjs';
import {dailyTitle} from './renewal_discovery.mjs';
import {applyRenewalLayout} from './renewal_layout.mjs';
test('rights manuscript clears prose, question, figure and source gates without fake datasets',()=>{
 const g=capitalGuides().find(g=>g.slug==='rights-offering-disclosure-guide');
 const {document:d}=parseHTML(`<html><body>${g.column}${g.faq}</body></html>`);
 assert.equal(d.querySelectorAll('figure').length,3);assert.equal(d.querySelectorAll('h3').length,5);assert.ok(d.querySelectorAll('.rn-references li').length>=2);
 const h=[...d.querySelectorAll('h2')];assert.ok(h.filter(n=>n.textContent.endsWith('?')).length/h.length>=.8);
 d.querySelectorAll('figure,table,.rn-references').forEach(n=>n.remove());assert.ok(d.body.textContent.replace(/\s+/g,' ').length>=5000);
 assert.doesNotMatch(g.column,/\{\{DATA|최근 30일 유상증자 결정 공시는 \d+건/);assert.match(g.column,/가상 예시/);
});
test('daily list titles omit repeated date and category',()=>{
 assert.equal(dailyTitle('2026.11.26 삼성전자 신규 보고 | 5%보고공시'),'삼성전자 신규 보고');
});
test('all official channel links use named icons and retain accessible labels',()=>{
 const {document:d}=parseHTML(applyRenewalLayout('<html><head><title>Test</title></head><body><main></main></body></html>'));
 for(const a of d.querySelectorAll('.rn-quick a,.rn-footer-social a')){assert.ok(a.querySelector('img'));assert.ok(a.getAttribute('aria-label'));}
});
