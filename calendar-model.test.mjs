import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent,matchesCategory,zoneBadge,splitDay} from './site/calendar-model.mjs';
// Synthetic fixtures only: never imported into the public calendar.
const samples = [
  {date:'2026-11-03',title:'미국 중간선거 (테스트)',type:'politics',category:'politics',importance:'high',relatedSectors:['신재생'],zone:'America/New_York'},
  {date:'2026-11-18',title:'엔비디아 실적 (가상 테스트 날짜)',type:'earnings',category:'earnings',importance:'high',relatedSectors:['반도체'],zone:'America/New_York'},
  {date:'2026-11-06',title:'면역항암학회 (테스트)',type:'industry',category:'industry',relatedSectors:['바이오'],zone:'America/New_York'},
];
test('categories filter independently and all retains every event',()=>{
  for(const item of samples) assert.equal(samples.filter(e=>matchesCategory(e,item.category)).length,1);
  assert.equal(samples.filter(e=>matchesCategory(e,'all')).length,3);
  assert.equal(normalizeEvent({type:'policy'}).category,'macro');
});
test('importance and sectors survive normalization',()=>{
  assert.equal(normalizeEvent(samples[0]).importance,'high');
  assert.deepEqual(normalizeEvent(samples[1]).relatedSectors,['반도체']);
});
test('timezones distinguish daylight saving and Korean instants',()=>{
  assert.equal(zoneBadge({...samples[0],date:'2026-10-30'}),'EDT');
  assert.equal(zoneBadge(samples[0]),'EST');
  assert.equal(zoneBadge({...samples[0],instant:'2026-11-03T20:00:00Z'}),'KST');
});
test('overflow retains all events for the day dialog',()=>{
  assert.equal(splitDay([...samples,...samples]).hidden,3);
  assert.equal(splitDay(samples).hidden,0);
});
