import test from 'node:test';
import assert from 'node:assert/strict';
import { macroEvents, macroSources, koreanTime } from './site/calendar-macro.mjs';

test('reviewed macro entries have valid dates and official sources', () => {
  assert.equal(macroEvents.length, 27);
  assert.equal(new Set(macroEvents.map(e => e.date + e.title)).size, 27);
  for (const e of macroEvents) {
    assert.equal(new Date(e.date).toISOString().slice(0,10), e.date);
    assert.match(macroSources[e.source][1], /^https:\/\/www\.(bok\.or\.kr|boj\.or\.jp|bea\.gov|bls\.gov|census\.gov)\//);
    assert.ok(e.description && e.zone && e.status);
  }
});
test('US releases preserve 08:30 Eastern across daylight saving change', () => {
  const releases = macroEvents.filter(e => e.instant && e.localTime.startsWith('08:30'));
  assert.equal(releases.length, 19);
  for (const e of releases) {
    const eastern = new Intl.DateTimeFormat('en-GB', { timeZone: e.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(e.instant));
    assert.equal(eastern, '08:30');
    assert.equal(e.time, e.localDate < '2026-11-01' ? '21:30 KST' : '22:30 KST');
  }
  assert.deepEqual(koreanTime('2026-12-09T14:00:00-05:00'), {date:'2026-12-10',time:'04:00 KST'});
});
test('JOLTS appears on the following Korean calendar day', () => {
  const jolts = macroEvents.filter(e => e.title.includes('JOLTS'));
  assert.deepEqual(jolts.map(e => [e.date, e.time]), [['2026-11-04','00:00 KST'], ['2026-12-02','00:00 KST']]);
});
test('central-bank announcements without confirmed times stay untimed', () => {
  for (const e of macroEvents.filter(e => e.type === 'policy')) {
    assert.equal(e.time, '시각 미정');
    assert.equal(e.instant, undefined);
  }
});
