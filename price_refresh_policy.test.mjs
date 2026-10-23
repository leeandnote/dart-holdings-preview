import test from 'node:test';
import assert from 'node:assert/strict';
import {completedCloseCutoff,allPriceTargets} from './price_refresh_policy.mjs';
test('morning excludes unfinished candle',()=>assert.equal(completedCloseCutoff(new Date('2026-10-23T01:00:00Z')),'2026-10-22'));
test('after close includes completed day',()=>assert.equal(completedCloseCutoff(new Date('2026-10-23T08:00:00Z')),'2026-10-23'));
test('Monday morning and weekends use Friday',()=>{
  for(const date of ['2026-10-26T01:00:00Z','2026-10-24T08:00:00Z'])assert.equal(completedCloseCutoff(new Date(date)),'2026-10-23');
});
test('old disclosures remain targets across schemas and duplicates',()=>{
 const rows=allPriceTargets([{'종목코드':'005930','시장':'KOSPI','접수일':'20200101'},{stockCode:'005930',market:'KOSPI'},{stockCode:'000001',market:'KOSDAQ'},{stockCode:'000002',market:'KONEX'}]);
 assert.equal(rows.length,2);assert.equal(rows[1].symbol,'005930.KS');
});
