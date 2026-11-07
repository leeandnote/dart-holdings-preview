import test from 'node:test';
import assert from 'node:assert/strict';
import {compactTiming} from './site/calendar-model.mjs';

test('calendar summaries show time once and omit redundant date explanations',()=>{
  assert.equal(compactTiming({time:'22:30 KST',zone:'America/New_York'}),'22:30 KST');
  assert.equal(compactTiming({time:'한국 날짜 · 행사별 시각 상이',zone:'Asia/Seoul'}),'');
  assert.equal(compactTiming({time:'한국·일본 날짜 · 시각 미확인',zone:'Asia/Tokyo'}),'');
  assert.equal(compactTiming({time:'미국 피닉스 현지 날짜 · 세션별 시각 상이',zone:'America/Phoenix'}),'현지 날짜 기준');
  assert.equal(compactTiming({zone:'출처 표기일'}),'출처 날짜 기준');
});
