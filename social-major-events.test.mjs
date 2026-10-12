import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./send_daily_social_cards.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function majorEventKind('), source.indexOf('function majorEventCardHtml('));
const context = vm.createContext({ cleanContractText: (text) => String(text).trim() });
vm.runInContext(functions, context);

test('clinical rejection overrides a stale approval metric', () => {
  const [row] = context.pickMajorEvents([{ corpName: '올릭스', eventTitle: '임상시험계획 승인 신청 반려', eventType: '임상시험·IND', metric: '임상시험계획 승인' }]);
  assert.equal(row.metric, '승인 신청 반려');
});
test('share transfer is not a supply contract', () => {
  const [row] = context.pickMajorEvents([{ corpName: '광명전기', eventTitle: '최대주주 변경을 수반하는 주식양수도계약 체결', eventType: '단일판매·수주' }]);
  assert.equal(row.kind, '지배구조');
});
test('bid amount in won is converted without treating it as revenue', () => {
  assert.equal(context.majorEventMetric('낙찰금액(원) : 108,081,549,400 (부가세 제외)', '단일판매·수주'), '1,080.8억원');
  assert.equal(context.majorEventMetric('최근매출액(원) : 108,081,549,400', '단일판매·수주'), '핵심 수치 원문 확인');
});
