import test from 'node:test';
import assert from 'node:assert/strict';
import { marketEvents, marketSources } from './site/calendar-market-events.mjs';
import { koreanTime } from './site/calendar-macro.mjs';

test('market events carry source, review date and unique valid dates', () => {
  assert.equal(marketEvents.length, 15);
  assert.equal(new Set(marketEvents.map(e => e.date + e.title)).size, 15);
  for (const e of marketEvents) {
    assert.equal(new Date(e.date).toISOString().slice(0,10), e.date);
    assert.ok(marketSources[e.source][1].startsWith('https://'));
    assert.equal(e.checkedAt, '2026-10-19');
    assert.ok(e.status && e.description && e.zone && e.time);
    if(e.instant) assert.deepEqual(koreanTime(e.instant), {date:e.date,time:e.time});
  }
});
test('US calls cross midnight while China releases remain on the local date', () => {
  for(const [source,date,time] of [['meta','2026-10-22','05:30 KST'],['tesla','2026-10-22','06:30 KST'],['amazon','2026-10-30','06:00 KST']]) {
    const e=marketEvents.find(e=>e.source===source);
    assert.equal(e.date,date); assert.equal(e.time,time);
  }
  for(const e of marketEvents.filter(e=>e.region==='CN')) {
    assert.equal(e.time,'11:00 KST'); assert.equal(e.date,e.localDate);
    assert.equal(e.status,'공식 예정');
  }
});
test('unconfirmed trade release and date-only events never invent a timestamp', () => {
  const trade=marketEvents.find(e=>e.source==='customsRule');
  assert.equal(trade.status,'규칙 기준'); assert.equal(trade.instant,undefined);
  const expiry=marketEvents.filter(e=>e.type==='expiry');
  assert.deepEqual(expiry.map(e=>e.date),['2026-10-16','2026-11-20','2026-12-18']);
  for(const e of expiry) {assert.equal(e.instant,undefined);assert.match(e.description,/AM/);}
});
