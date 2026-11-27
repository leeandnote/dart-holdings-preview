import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {buildSeries} from './series_pages.mjs';
import {assertPrivateNotes,noteHash,publishNotes} from './note_series.mjs';
import {articlePath,validatePublishedHtml} from './preserve_published_articles.mjs';
import {encryptNotes,decryptNotes} from './private_notes.mjs';

test('series hides empty tabs, renders covers/OG, landing schemas and stable legacy URLs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'series-ui-'));try{
 fs.mkdirSync(path.join(dir,'assets/fonts'),{recursive:true});
 for(const f of ['Alata-Regular.ttf','NotoSansKR-Medium.otf'])fs.copyFileSync(path.join('site/assets/fonts',f),path.join(dir,'assets/fonts',f));
 fs.mkdirSync(path.join(dir,'blog'),{recursive:true});
 fs.writeFileSync(path.join(dir,'index.html'),'<html><head></head><body><main><section><div class="rn-editor-grid"></div></section></main></body></html>');
 fs.writeFileSync(path.join(dir,'blog/index.html'),'<html><head></head><body><main><nav class="rn-category-tabs"></nav><section><div class="rn-editor-grid"></div></section><section><ul class="rn-daily-list"></ul></section></main></body></html>');
 for(const [i,slug] of ['how-to-read-dart-disclosures','rights-offering-disclosure-guide'].entries()){
 const folder=path.join(dir,'blog/issues',slug);fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,'index.html'),`<html><head><title>공시</title><link rel="canonical" href="https://leeandnote.com/blog/issues/${slug}/"><script type="application/ld+json">{"@type":"Article","datePublished":"2026-11-${20+i}T22:00:00Z"}</script></head><body><article><header class="titleArea"><h1>공시 읽기 ${i}</h1></header><div class="articleBody"><p>설명입니다</p></div></article></body></html>`);
 }
 const result=buildSeries(dir);assert.equal(result.notes,2);
 const {document}=parseHTML(fs.readFileSync(path.join(dir,'index.html'),'utf8'));
 assert.equal(document.querySelectorAll('[role="tab"]').length,1);assert.equal(document.querySelector('[role="tab"]').textContent,'공시 해부');assert.ok(document.querySelector('[role="tabpanel"]:not([hidden]) .rn-note-card'));
 assert.equal(document.querySelectorAll('.rn-series-tile').length,1);
 const {document:landing}=parseHTML(fs.readFileSync(path.join(dir,'series/disclosure/index.html'),'utf8'));const schema=JSON.parse(landing.querySelector('script[type="application/ld+json"]').textContent);assert.equal(schema['@type'],'CollectionPage');assert.equal(schema.mainEntity.itemListElement.length,2);
 assert.match(fs.readFileSync(path.join(dir,'series/term/index.html'),'utf8'),/noindex, follow/);
 const png=fs.readFileSync(path.join(dir,'assets/series/disclosure.png'));assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 assert.match(fs.readFileSync(path.join(dir,'blog/issues/rights-offering-disclosure-guide/index.html'),'utf8'),/property="og:image"/);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('privacy validator fails if an unapproved URL leaks into feed or search',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'series-private-'));try{
 const n={slug:'private-note',meta:{series:'basics',series_no:1,title:'비공개',subtitle:'설명',publish_at:'2099-12-01T07:00:00+09:00',related_terms:[],references:[]},body:'초안'};
 fs.writeFileSync(path.join(dir,'rss.xml'),'<link>/blog/issues/private-note/</link>');assert.throws(()=>assertPrivateNotes(dir,{notes:[n]}),/Unpublished/);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('preservation accepts only same-origin article routes and matching identities',()=>{
 assert.equal(articlePath('https://evil.example/blog/issues/x/'),null);assert.equal(articlePath('https://leeandnote.com/blog/issues/../x/'),null);
 assert.equal(articlePath('https://leeandnote.com/blog/issues/x/'),'/blog/issues/x/');assert.throws(()=>validatePublishedHtml('<h1>Error</h1>','https://leeandnote.com/blog/issues/x/'));
});
test('private bundle is authenticated, hides manuscript text and rejects unsafe paths',()=>{
 const key=Buffer.alloc(32,17),files={'private-topic.md':'---\ntitle: unpublished unique title\n---\nprivate text'};
 const encrypted=encryptNotes(files,key);assert.doesNotMatch(JSON.stringify(encrypted),/unpublished unique title|private text/);assert.deepEqual(decryptNotes(encrypted,key),files);assert.throws(()=>decryptNotes(encrypted,Buffer.alloc(32,18)));
 assert.throws(()=>decryptNotes(encryptNotes({'../escape.md':'x'},key),key));
});
