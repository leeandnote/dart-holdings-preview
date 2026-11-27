import test from 'node:test';import assert from 'node:assert/strict';import {dailyContext} from './daily_context.mjs';
test('context counts reports rather than rows and limits repeated reporters to thirty days',()=>{
 const r={category:'5%보고',date:'20261126',receiptNo:'20261126000001',name:'A',code:'000001',reporter:'기관',prev:5,cur:6,url:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261126000001'};
 const report=dailyContext([r,r,{...r,date:'20261101',receiptNo:'20261101000001'},{...r,date:'20261001',receiptNo:'20261001000001'}],'5%보고','20261126');
 assert.match(report.points[0],/공시는 1건/);assert.match(report.points[1],/보고 1건/);assert.equal(report.historyDates,1);assert.match(report.points[2],/\+1%p/);
});
