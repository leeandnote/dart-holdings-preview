import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWeeklyIssue} from './weekly_issue.mjs';
test('reviewed issue has sourced events and matching dates',async()=>{
 const issue=await loadWeeklyIssue('2026-11-23');
 assert.equal(issue.end,'2026-11-29');assert.equal(issue.events.length,8);
 assert.ok(issue.caption.startsWith('[리앤노트] 다음 주 증시 일정 | 11/23~11/29'));
 assert.ok(!issue.caption.includes('11/9~11/15'));
 assert.ok(issue.events.find(e=>e.title.includes('조기')).detail.includes('11/28 03:00'));
});
test('missing or invalid issues fail closed',async()=>{
 for(const week of ['../../secret','2026-11-24','2026-11-30'])await assert.rejects(loadWeeklyIssue(week));
});
