import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./send_daily_social_cards.mjs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function isVerifiedOwnership('), source.indexOf('function pickFive(')), context);
test('missing ownership values and unidentified reporters are excluded', () => {
  for (const row of [
    { prev: null, cur: 5, reporter: '기관' },
    { prev: 0, cur: undefined, reporter: '기관' },
    { prev: 0, cur: 5, reporter: '보고자 확인중' },
    { prev: 0, cur: 101, reporter: '기관' },
  ]) assert.equal(context.isVerifiedOwnership(row), false);
});
test('verified zero ownership is retained', () => {
  assert.equal(context.isVerifiedOwnership({ prev: 0, cur: 8.25, reporter: '기관' }), true);
  assert.equal(context.isVerifiedOwnership({ prev: 8.25, cur: 0, reporter: '기관' }), true);
});
