import test from 'node:test';
import assert from 'node:assert/strict';
import {chartSpec,renderChart} from './renewal_charts.mjs';
const rows=Array.from({length:5},(_,i)=>({date:'20261125',receiptNo:`2026112500000${i}`,code:`00000${i}`,category:'5%보고',name:'종목',reporter:`보고자${i}`,prev:5,cur:6+i,url:'https://dart.fss.or.kr/'}));
test('chart gates and numeric validation exclude unavailable or malformed data',()=>{
  assert.equal(chartSpec(rows.slice(0,2),'5percent','20261125'),null);
  assert.equal(chartSpec(rows,'5percent','20261124'),null);
  assert.equal(chartSpec(rows.map(r=>({...r,prev:null})),'5percent','20261125'),null);
  const spec=chartSpec(rows,'5percent','20261125');
  assert.equal(spec.rows[0].cur,10);assert.match(renderChart(spec),/차트 데이터와 원문/);
  assert.throws(()=>renderChart({...spec,source:''}),/missing source/);
});
test('share-change chart is signed and deduplicated and does not infer trading',()=>{
  const data=rows.map((r,i)=>({...r,category:'임원·주요주주',shareDelta:i%2?100:-100}));
  const spec=chartSpec([...data,...data],'executives','20261125');
  assert.equal(spec.rows.length,5);assert.match(renderChart(spec),/#1f6feb/);assert.match(renderChart(spec),/#e42939/);
});
