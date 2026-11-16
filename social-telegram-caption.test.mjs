import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./send_daily_social_cards.mjs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function telegramTitleFirst('), source.indexOf('async function sendMediaGroup(')), context);
const title = '[2026-11-16 DART전자공시 주요 이슈]';

test('Telegram title precedes exclusions without losing the notice or body', () => {
  const notice = '확인된 공시 기준 요약 · 보유비율·보고자 미확인 17건 제외';
  assert.equal(context.telegramTitleFirst(`${notice}\n\n${title}\n\n본문\n\n#리앤노트`), `${title}\n\n${notice}\n\n본문\n\n#리앤노트`);
});
test('already title-first captions stay unchanged', () => {
  const caption = `${title}\n\n본문`;
  assert.equal(context.telegramTitleFirst(caption), caption);
});
test('unrelated captions stay unchanged', () => {
  assert.equal(context.telegramTitleFirst('주간 일정\n본문'), '주간 일정\n본문');
});
