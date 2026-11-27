import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {contractChart,eventTimeline,institutionCharts,renderExtendedChart} from './renewal_extended_charts.mjs';
const rows=Array.from({length:6},(_,i)=>({'접수일':'20261125','접수번호':`2026112500000${i}`,'공시유형':'단일판매·공급계약','종목명':`기업${i}`,'계약금액':100+i,'최근매출액':1000,'매출대비비율':10+i/10,DART_URL:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=2026112500000${i}`}));
test('contract ratios require five real consistent values and reject missing revenue',()=>{
  assert.equal(contractChart(rows.slice(0,4),'20261125'),null);
  assert.equal(contractChart(rows.map(r=>({...r,'최근매출액':null})),'20261125'),null);
  assert.equal(contractChart(rows.map(r=>({...r,'매출대비비율':500})),'20261125'),null);
  const spec=contractChart([...rows,...rows],'20261125');assert.equal(spec.rows.length,5);assert.equal(spec.rows[0].value,10.5);assert.match(renderExtendedChart(spec),/이익률이 아닙니다/);
});
test('event timeline is date-specific, deduplicated, and labelled as receipt dates',()=>{
  const data=rows.map(r=>({...r,'공시유형':'투자판단관련주요경영사항','보고서명':'임상시험 계획 승인'}));
  assert.equal(eventTimeline(data,'20261124'),null);
  const spec=eventTimeline([...data,...data],'20261125');assert.equal(spec.rows.length,6);assert.match(renderExtendedChart(spec),/사건 발생일/);
});
test('a different DART receipt cannot substantiate a chart row',()=>{
  const invalid=rows.map(r=>({...r,DART_URL:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261125000999'}));
  assert.equal(contractChart(invalid,'20261125'),null);
  assert.equal(eventTimeline(invalid.map(r=>({...r,'공시유형':'투자판단관련주요경영사항','보고서명':'보고'})),'20261125'),null);
});
test('institution charts do not invent missing rates or missing months',()=>{
  const html=months=>`<html><head><link rel="canonical" href="https://leeandnote.com/blog/issues/vip-asset-holdings/"></head><body><div class="articleBody"><table><tbody>${months.map((m,i)=>`<tr><td>기업${i}<small>00000${i}</small></td><td>VIP자산운용</td><td>5% → ${6+i}%</td><td><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=2026${m}25000001">원문</a></td></tr>`).join('')}</tbody></table></div></body></html>`;
  assert.equal(institutionCharts(parseHTML(html(['06','07','08','09','10','11'])).document).length,2);
  assert.equal(institutionCharts(parseHTML(html(['05','07','08','09','10','11'])).document).length,1);
  assert.equal(institutionCharts(parseHTML(html(['09','10','11'])).document).length,0);
});
