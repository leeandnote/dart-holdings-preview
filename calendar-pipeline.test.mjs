import test from 'node:test';
import assert from 'node:assert/strict';
import {extractArticle,validateCandidate,upsertEvents,titleSimilarity} from './calendar_pipeline.mjs';
import {toCalendarEvents} from './site/calendar-auto.mjs';
import {matchesCategory} from './site/calendar-model.mjs';
// Synthetic articles: no actual future announcement is asserted.
export const fixtures=[
  ['예시반도체','실적발표','2026년 3분기','주요실적','반도체','005930','2026-11-12'],
  ['예시학회','학회','2026년 정기학회','산업/학회/정책','바이오','','2026-11-13'],
  ['예시위원회','선거','2026년 정기선거','정치/지정학','신재생','','2026-11-14'],
].map(([entity,eventKind,period,category,sector,stock,date],i)=>{
  const text=`${entity} ${stock} ${period} ${eventKind} 일정은 한국시간 ${date}로 확정 발표했다.`;
  const article={url:`https://example.org/news/${i}`,text,publishedAt:'2026-11-06T00:00:00Z'};
  return {article,event:{date,time:null,title:`${entity} ${eventKind}`,category,importance:'high',relatedSectors:[sector],relatedStockCodes:stock?[stock]:[],sourceUrl:article.url,entity,eventKind,period,status:'scheduled',region:'KR',dateBasis:'KST',evidence:text,dateEvidence:date}};
});
test('three sample articles parse locally without a model or network',async()=>{
  for(const {article,event} of fixtures){
    const candidates=await extractArticle(article);
    assert.equal(candidates[0].requiresReview,true);
    const validated=validateCandidate(candidates[0],article);
    assert.ok(validated);
    const ui=toCalendarEvents({updatedAt:'2026-11-06T00:00:00Z',events:[validated]});
    assert.equal(ui[0].date,event.date);
    assert.equal(ui[0].provenance,'news');
    assert.ok(matchesCategory(ui[0],validated.category));
  }
});
test('rumors, absent evidence, unknown zones, invalid dates and invented links are rejected',()=>{
  const {article,event}=fixtures[0];
  for(const patch of [{status:'uncertain'},{evidence:'invented'},{dateBasis:'unknown'},{date:'2026-02-30'},{sourceUrl:'https://evil.example'},{time:'13:00 KST'}])assert.equal(validateCandidate({...event,...patch},article),null);
  assert.equal(validateCandidate({...event,evidence:event.evidence+' 가능성'},{...article,text:article.text+' 가능성'}),null);
});
test('upsert is idempotent, preserves reschedules and ignores older news',()=>{
  const first=validateCandidate(fixtures[0].event,fixtures[0].article);
  const rows=upsertEvents([first],[first]);assert.equal(rows.length,1);
  const moved={...first,date:'2026-11-20',sourcePublishedAt:'2026-11-07T00:00:00Z'};
  const next=upsertEvents(rows,[moved]);assert.equal(next.length,1);assert.equal(next[0].previousDate,first.date);
  assert.equal(upsertEvents(next,[first])[0].date,moved.date);
  assert.equal(toCalendarEvents({events:[{...moved,status:'cancelled'}]}).length,0);
  assert.equal(titleSimilarity('예시 실적 발표','예시 실적발표'),1);
});
test('ambiguous news produces no inferred events',async()=>{
  for(const text of ['오는 목요일 실적 발표 전망','2026-11-12 선거 가능성','발행 2026-11-12 주가 상승'])assert.deepEqual(await extractArticle({text}),[]);
});
