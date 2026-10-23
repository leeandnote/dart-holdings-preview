import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {enhanceHome,faqs} from './home_search.mjs';
test('home semantics schema and original advertising stay consistent',()=>{
 const source=fs.readFileSync('site/index.html','utf8');
 const html=enhanceHome(source);
 assert.equal((html.match(/<h1\b/g)||[]).length,1);
 assert.equal((html.match(/<main\b/g)||[]).length,1);
 assert.equal((html.match(/<\/main>/g)||[]).length,1);
 assert.ok(html.indexOf('homeFaq')<html.lastIndexOf('</main>'));
 const graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
 assert.equal(graph.filter(x=>x['@type']==='Service').length,4);
 assert.equal(graph.find(x=>Array.isArray(x['@type'])).mainEntity.length,4);
 for(const [q,a] of faqs){assert.ok(html.includes(`<h3>${q}</h3>`));assert.ok(html.includes(`<p>${a}</p>`));}
 assert.equal((html.match(/adsbygoogle.js/g)||[]).length,(source.match(/adsbygoogle.js/g)||[]).length);
 assert.ok(html.includes('naver-site-verification'));
 assert.equal(enhanceHome(html),html);
 assert.ok(!html.includes('aggregateRating'));
});
