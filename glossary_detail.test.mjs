import test from 'node:test';
import assert from 'node:assert/strict';
import {glossaryDetails,addGlossaryTab,detailGroups} from './glossary_detail.mjs';
import {termGroups} from './blog_editorial.mjs';
test('glossary keeps anchors and schema matches visible answers',()=>{
 const source='<html><head></head><body><main class="termsPage"><h1>용어</h1>'+Object.keys(termGroups).map(k=>`<section class="editorialTerms" id="${k}"><h2>group</h2></section>`).join('')+'<footer class="editorialTerms"></footer></main></body></html>';
 const html=glossaryDetails(source,termGroups);
 const graph=JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/)[1])['@graph'];
 assert.equal(graph[0].mainEntity.length,16);
 for(const q of graph[0].mainEntity){assert.ok(html.includes(q.name));assert.ok(html.includes(q.acceptedAnswer.text));}
 for(const key of Object.keys(detailGroups))assert.equal(html.split(`id="${key}"`).length,2);
 assert.equal(glossaryDetails(html,termGroups),html);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
});
test('blog navigation is crawlable and idempotent',()=>{
 const html=addGlossaryTab('<nav class="insightTabs" aria-label="블로그"><a href="/blog/">전체</a></nav>');
 assert.ok(html.includes('href="/stock-terms"'));
 assert.equal(addGlossaryTab(html),html);
 assert.ok(addGlossaryTab('<div class="categoryBar" aria-label="블로그"></div>').includes('<nav class="categoryBar"'));
 assert.ok(addGlossaryTab('<div class="categoryBar"></div>').includes('href="/stock-terms"'));
});
