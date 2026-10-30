import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCompanyNews, newsSection, newsLinks } from './company_news.mjs';
test('uses API HUB endpoint and authentication headers', async () => {
  let captured;
  await loadCompanyNews('삼성전자', { env: { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' }, request: async (url, options) => {
    captured = {url, options};
    return {ok:true, json:async () => ({items:[]})};
  }});
  assert.equal(new URL(captured.url).origin, 'https://naverapihub.apigw.ntruss.com');
  assert.equal(new URL(captured.url).pathname, '/search/v1/news');
  assert.equal(captured.options.headers['X-NCP-APIGW-API-KEY-ID'], 'id');
  assert.equal(captured.options.headers['X-NCP-APIGW-API-KEY'], 'secret');
});
test('missing credentials never calls provider', async () => {
  assert.equal((await loadCompanyNews('삼성전자', { env: {}, request: () => { throw Error('unexpected'); } })).status, 'unconfigured');
});
test('news validates links, dates, relevance and duplicates', async () => {
  const item = { title: '<b>삼성전자</b> 실적', originallink: 'https://example.com/a', pubDate: 'Fri, 30 Oct 2026 10:00:00 +0900' };
  const result = await loadCompanyNews('삼성전자', { env: { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' }, request: async () => ({ ok: true, json: async () => ({items: [item, item, {...item, title:'다른 회사'}, {...item, originallink:'javascript:alert(1)'}]}) }) });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, '삼성전자 실적');
  assert.match(newsSection('삼성전자', result), /example.com/);
});
test('provider errors have honest fallback with encoded search links', async () => {
  const result = await loadCompanyNews('A&B', { env: { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' }, request: async () => ({ok:false}) });
  assert.equal(result.status, 'unavailable');
  assert.match(newsLinks('A&B').naver, /A%26B/);
  assert.match(newsSection('<test>', result), /&lt;test&gt;/);
});
