import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {disclosureRecords,buildUnifiedSearch} from './renewal_search.mjs';
import {matchRecords} from './site/unified-search.mjs';
test('search matches all terms across reporter, company and code without regex interpretation',()=>{
  const rows=[{kind:'disclosure',title:'삼성전자',description:'JP모건 5%보고',keywords:'005930',date:'2026-11-25'},{kind:'article',title:'삼성전자 지분',description:'',keywords:'005930',date:'2026-11-24'}];
  assert.equal(matchRecords(rows,'삼성 JP').length,1);
  assert.equal(matchRecords(rows,'005930','article').length,1);
  assert.equal(matchRecords(rows,'[').length,0);
  assert.equal(matchRecords(rows,' ').length,0);
});
test('index validates receipt dates and URLs, deduplicates, and keeps search noindex',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rn-search-'));
  try{
    fs.mkdirSync(path.join(dir,'data/blog-disclosures'),{recursive:true});
    const row={receiptNo:'20261125000035',date:'20261125',code:'098120',name:'테스트',reporter:'기관',category:'5%보고',url:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261125000035'};
    fs.writeFileSync(path.join(dir,'data/blog-disclosures/20261125.json'),JSON.stringify([row,row,{...row,date:'20261124'},{...row,url:'javascript:alert(1)'}]));
    assert.equal(disclosureRecords(dir).length,1);
    assert.deepEqual(buildUnifiedSearch(dir),{articles:0,disclosures:1});
    assert.match(fs.readFileSync(path.join(dir,'search/index.html'),'utf8'),/noindex,follow/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
