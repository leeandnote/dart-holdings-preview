import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {noteHash,validateNote,publishNotes,renderMarkdown,readNote,loadNotes} from './note_series.mjs';
import {queueStatus} from './check_note_queue.mjs';
const now='2026-11-30T22:00:00Z';
function sample(){const n={slug:'lockup-test',body:'설명'.repeat(930)+'\n\n<table><tr><th>사례</th></tr><tr><td><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261127000001">실제 공시</a></td></tr></table>\n<section data-faq><h3>질문1?</h3><p>답</p><h3>질문2?</h3><p>답</p><h3>질문3?</h3><p>답</p></section>',meta:{series:'term',series_no:1,title:'락업',subtitle:'확인할 내용',definition:'처분이 제한되는 약정입니다.',publish_at:'2026-12-01T07:00:00+09:00',related_terms:[],references:[]}};n.meta.review={status:'approved',reviewer:'Test fixture reviewer',reviewed_at:'2026-11-29T12:00:00+09:00',content_sha256:noteHash(n)};return n;}
test('KST boundary, human review hash and actual term example gate',()=>{
 const n=sample();assert.equal(validateNote(n,now).ready,true);assert.equal(validateNote(n,'2026-11-30T21:59:59Z').due,false);assert.equal(validateNote(n,now).due,true);
 n.body+='변경';assert.ok(validateNote(n,now).errors.includes('human approval missing or content changed after review'));
});
test('malformed time, short prose, missing human approval and investor data are held',()=>{
 const n=sample();n.meta.publish_at='2026-12-01';assert.equal(validateNote(n,now).ready,false);
 n.meta.series='investor';n.body='짧음';delete n.meta.review;const v=validateNote(n,now);assert.ok(v.errors.some(e=>e.includes('ten distinct')));assert.ok(v.errors.some(e=>e.includes('prose length')));
});
test('scheduled drafts have no public files; due approved note and brief term link both ways',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'note-test-'));try{
 const n=sample();publishNotes(dir,{notes:[n],now:'2026-11-30T21:59:59Z'});assert.equal(fs.existsSync(path.join(dir,'blog/issues/lockup-test/index.html')),false);
 assert.equal(publishNotes(dir,{notes:[n],now}).length,1);const article=fs.readFileSync(path.join(dir,'blog/issues/lockup-test/index.html'),'utf8');assert.match(article,/stock-terms\/lockup-test/);const term=fs.readFileSync(path.join(dir,'stock-terms/lockup-test/index.html'),'utf8');assert.match(term,/blog\/issues\/lockup-test/);assert.ok(term.length<article.length);
 const h=JSON.parse(fs.readFileSync(path.join(dir,'data/blog-editorial.json'))).entries;assert.equal(h['https://leeandnote.com/blog/issues/lockup-test/'].publishedAt,now);
 publishNotes(dir,{notes:[n],now:'2026-12-02T22:00:00Z'});assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'data/blog-editorial.json'))).entries['https://leeandnote.com/blog/issues/lockup-test/'].modifiedAt,now);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('Markdown strips active content and queue ignores incomplete manuscripts',()=>{
 const html=renderMarkdown('<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">a</a>');assert.doesNotMatch(html,/script|onclick|javascript:/);
 const n=sample();assert.equal(queueStatus([n],'2026-11-30T01:00:00Z').ready,1);n.body='미완성';assert.equal(queueStatus([n],'2026-11-30T01:00:00Z').ready,0);
});
test('duplicate YAML keys and duplicate series numbers fail closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'note-yaml-'));try{fs.writeFileSync(path.join(dir,'bad.md'),'---\ntitle: a\ntitle: b\n---\nbody');assert.throws(()=>readNote(path.join(dir,'bad.md')));fs.rmSync(path.join(dir,'bad.md'));
 for(const slug of ['a','b'])fs.writeFileSync(path.join(dir,slug+'.md'),'---\nseries: term\nseries_no: 1\n---\nbody');assert.throws(()=>loadNotes(dir));}finally{fs.rmSync(dir,{recursive:true});}
});
