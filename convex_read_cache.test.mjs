import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cachedConvexQuery} from './convex_read_cache.mjs';
import {refreshMajorSnapshot} from './renewal_data.mjs';
test('identical reads reused; expiry and changed arguments trigger collection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'read-cache-'));let calls=0;
 const fetch=async()=>{calls++;return Response.json({status:'success',value:[calls]});};
 try{
 const options={dir,now:1000,fetch};
 assert.deepEqual(await cachedConvexQuery('https://example.test','query',{date:'a'},options),[1]);
 assert.deepEqual(await cachedConvexQuery('https://example.test','query',{date:'a'},options),[1]);
 await cachedConvexQuery('https://example.test','query',{date:'b'},options);
 await cachedConvexQuery('https://example.test','query',{date:'a'},{...options,now:901001});
 assert.equal(calls,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('quota blocks subsequent reads, never substitutes stale data, probes after reset',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'read-quota-'));let calls=0;
 const fetch=async()=>{calls++;return Response.json({status:'error',errorMessage:'You have exceeded the free plan limits, so your deployments have been disabled.'});};
 const now=Date.parse('2026-11-30T23:59:00Z');
 try{
 await assert.rejects(cachedConvexQuery('https://example.test','query',{}, {dir,now,fetch}),/free plan/);
 await assert.rejects(cachedConvexQuery('https://example.test','other',{}, {dir,now,fetch}),/circuit open/);
 assert.equal(calls,1);
 await assert.rejects(cachedConvexQuery('https://example.test','query',{}, {dir,now:now+60001,fetch}),/free plan/);
 assert.equal(calls,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('site snapshot build does not contact Convex',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-only-')),original=globalThis.fetch,urls=[];
 const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10).replaceAll('-',''),receipt=date+'000001';
 const snapshot={rows:[{'공시유형':'투자판단관련주요경영사항','접수번호':receipt,'접수일':date,DART_URL:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt}]};
 fs.mkdirSync(path.join(dir,'data'));fs.writeFileSync(path.join(dir,'data/disclosure_signals.json'),JSON.stringify({rows:[]}));
 globalThis.fetch=async url=>{urls.push(url);return Response.json(snapshot);};
 try{assert.equal(await refreshMajorSnapshot(dir),1);assert.deepEqual(urls,['https://leeandnote.com/data/disclosure_signals.json']);}finally{globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
