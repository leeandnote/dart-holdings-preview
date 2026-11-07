import test from 'node:test';
import assert from 'node:assert/strict';
import { japanSources, japanEvents } from './site/calendar-japan.mjs';
import { normalizeEvent, matchesCategory } from './site/calendar-model.mjs';

test('Japan official calendar has unique dated events and valid sources', () => {
  assert.equal(japanEvents.length,11);
  assert.equal(new Set(japanEvents.map(e=>e.id)).size,11);
  for (const event of japanEvents) {
    assert.ok(japanSources[event.source][1].startsWith('https://'));
    assert.equal(event.region,'JP');
    assert.equal(event.checkedAt,'2026-11-07');
    assert.ok(matchesCategory(normalizeEvent(event),'macro'));
  }
});
test('Japan times stay on the same Korean date, unverified times remain unknown', () => {
  for (const e of japanEvents.filter(e=>e.instant)) {
    assert.equal(e.date,e.localDate);
    assert.match(e.time,/08:50/);
  }
  assert.ok(japanEvents.filter(e=>e.source==='jpCpi').every(e=>!e.instant));
});
