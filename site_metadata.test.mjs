import test from 'node:test';
import assert from 'node:assert/strict';
import { metadata } from './site_metadata.mjs';
test('category metadata is unique and preserves body and verification tags', () => {
  const input='<html><head><title>Old</title><meta name="description" content="Old"><meta name="naver-site-verification" content="keep"><meta name="robots" content="noindex"></head><body>unchanged</body></html>';
  const output=metadata(input,'calendar/index.html');
  assert.match(output,/증시 일정 달력/);
  assert.match(output,/href="https:\/\/leeandnote.com\/calendar\/"/);
  assert.match(output,/content="noindex"/);
  assert.match(output,/content="keep"/);
  assert.ok(output.endsWith('<body>unchanged</body></html>'));
  assert.equal((metadata(output,'calendar/index.html').match(/<title>/g)||[]).length,1);
});
test('article title schema canonical and social image remain intact', () => {
  const schema='<script type="application/ld+json">{"@type":"Article","headline":"삼성전자"}</script>';
  const input=`<head><title>삼성전자 지분 | 리앤노트</title><meta name="description" content="A &amp; B"><link rel="canonical" href="https://leeandnote.com/blog/issues/samsung/"><meta property="og:image" content="/assets/article.png"><meta name="twitter:card" content="summary_large_image">${schema}</head>`;
  const output=metadata(input,'blog/issues/samsung/index.html');
  assert.match(output,/삼성전자 지분 \| 리앤노트/);
  assert.ok(output.includes(schema));
  assert.match(output,/content="summary_large_image"/);
  assert.match(output,/content="https:\/\/leeandnote.com\/assets\/article.png"/);
  assert.match(output,/content="A &amp; B"/);
});
