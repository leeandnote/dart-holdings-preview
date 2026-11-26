import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildDiscovery} from './renewal_discovery.mjs';
import {seoSnapshot} from './renewal_layout.mjs';
import {prerenderDataPages} from './renewal_data.mjs';
test('discovery preserves metadata and exposes every daily through crawlable pagination',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-discovery-'));
  const write=(file,html)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),html);};
  try{
    const template='<html lang="ko"><head><title>Original</title><meta name="description" content="Original description"><link rel="canonical" href="https://leeandnote.com/"></head><body><main>Old</main></body></html>';
    write('index.html',template);write('blog/index.html',template);
    for(let i=1;i<=26;i++){const date=`2026-10-${String(i).padStart(2,'0')}`;write(`blog/5percent/${date}/index.html`,`<html><head><link rel="canonical" href="https://leeandnote.com/blog/5percent/${date}/"></head><body><article><h1>${date} 공시</h1><div class="articleBody">실제 데이터 테스트</div></article></body></html>`);}
    buildDiscovery(dir);
    assert.deepEqual(seoSnapshot(fs.readFileSync(path.join(dir,'index.html'),'utf8')),seoSnapshot(template));
    assert.ok(fs.existsSync(path.join(dir,'blog/page/2/index.html')));
    assert.match(fs.readFileSync(path.join(dir,'blog/page/2/index.html'),'utf8'),/2026-10-01/);
    assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/action="\/search\/"/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('data pages include real initial rows without removing their client mount point',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-data-'));
  try{
    fs.mkdirSync(path.join(dir,'data/blog-disclosures'),{recursive:true});
    fs.writeFileSync(path.join(dir,'data/blog-disclosures/20261125.json'),JSON.stringify([{receiptNo:'20261125000035',date:'20261125',code:'005930',name:'삼성전자',category:'5%보고',url:'https://dart.fss.or.kr/',reporter:'보고자',rateText:'5 → 6'}]));
    fs.writeFileSync(path.join(dir,'5percent.html'),'<html><body><div id="list"></div><script src="/app.js"></script></body></html>');
    assert.equal(prerenderDataPages(dir),1);
    const html=fs.readFileSync(path.join(dir,'5percent.html'),'utf8');
    assert.match(html,/삼성전자/);assert.match(html,/id="list"/);assert.match(html,/src="\/app.js"/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
