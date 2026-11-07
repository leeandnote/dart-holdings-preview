import test from 'node:test';
import assert from 'node:assert/strict';
import {conferenceDefinitions,conferenceEvents,conferenceSources} from './site/calendar-conferences.mjs';
import {matchesCategory,normalizeEvent,splitDay} from './site/calendar-model.mjs';

test('verified conferences expand their full local date ranges without duplicates',()=>{
  assert.equal(conferenceDefinitions.length,11);
  assert.equal(new Set(conferenceEvents.map(e=>e.id)).size,conferenceEvents.length);
  for(const definition of conferenceDefinitions){
    const rows=conferenceEvents.filter(e=>e.source===definition.key);
    assert.equal(rows[0].date,definition.start);
    assert.equal(rows.at(-1).date,definition.end);
    assert.equal(rows.length,(Date.parse(definition.end)-Date.parse(definition.start))/86400000+1);
    for(const e of rows){
      assert.ok(conferenceSources[e.source][1].startsWith('https://'));
      assert.equal(e.instant,undefined);
      assert.ok(matchesCategory(normalizeEvent(e),'industry'));
      assert.ok(e.relatedSectors.length>0);
    }
  }
});
test('company IR filters do not imply participation by unrelated stocks',()=>{
  const company=conferenceEvents.filter(e=>e.scope==='company');
  assert.equal(company.length,5);
  assert.ok(company.every(e=>e.relatedStockCodes.join()==='005930'));
  assert.ok(company.every(e=>e.zone==='출처 표기일'));
});
test('busy dates retain overflow and cross-month events continue into December',()=>{
  const busy=conferenceEvents.filter(e=>e.date==='2026-11-18');
  assert.equal(busy.length,5);
  assert.equal(splitDay(busy).hidden,2);
  assert.ok(conferenceEvents.some(e=>e.source==='rsna26'&&e.date==='2026-12-03'));
  assert.ok(conferenceEvents.some(e=>e.source==='reinvent26'&&e.date==='2026-12-04'));
});
