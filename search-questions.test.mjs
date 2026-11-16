import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { questionGuides, questions } from './disclosure_questions.mjs';
import { applySearchFoundation } from './search_foundation.mjs';

test('guides have distinct URLs, sources, explanations and labelled fictional examples',()=>{
  const guides=questionGuides();
  assert.equal(new Set(guides.map(g=>g.slug)).size,guides.length);
  for(const g of guides){
    assert.ok(questions.some(([,slug])=>slug===g.slug));
    assert.match(g.column,/가상/);
    assert.match(g.column,/https:\/\/(dart\.fss\.or\.kr|kind\.krx\.co\.kr)/);
    assert.match(g.column,/<table>/);
    assert.ok(g.column.length>900);
  }
});
test('search foundation adds crawlable questions and stable unique table of contents',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reading-test-'));
  try {
    const article=path.join(dir,'blog/issues/ownership-rate-vs-share-count');
    fs.mkdirSync(article,{recursive:true});
    fs.writeFileSync(path.join(dir,'sitemap.xml'),'<urlset></urlset>');
    const file=path.join(article,'index.html');
    fs.writeFileSync(file,'<html><head></head><body><main><h1>지분</h1><div class="issueColumn"><h2>확인 순서</h2><p>본문</p></div><h2 class="issueTableTitle">빈 표</h2><table></table><div class="issueColumn issueFaq"><h2>질문</h2></div></main></body></html>');
    applySearchFoundation(dir);
    const first=fs.readFileSync(file,'utf8');
    assert.match(first,/href="#reading-1"/);
    assert.match(first,/id="reading-1"/);
    assert.match(first,/href="\/blog\/issues\/contract-value-vs-revenue\/"/);
    assert.doesNotMatch(first,/빈 표/);
    applySearchFoundation(dir);
    assert.equal(fs.readFileSync(file,'utf8'),first);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
