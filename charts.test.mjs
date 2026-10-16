import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chartGroups, chartUrl, widgetOptions} from './site/charts-data.mjs';
import {metadata} from './site_metadata.mjs';

test('symbols are unique and source links retain futures punctuation', () => {
  const items = Object.values(chartGroups).flat();
  assert.equal(new Set(items.map(item => item.symbol)).size, items.length);
  for (const item of items) {
    const url = new URL(chartUrl(item.symbol));
    assert.equal(url.hostname, 'www.tradingview.com');
    assert.equal(url.searchParams.get('symbol'), item.symbol);
  }
});
test('unsupported yields use links and embeds retain source identity', () => {
  for (const item of chartGroups.rates.filter(item => item.symbol.startsWith('TVC:'))) assert.equal(item.external, true);
  for (const item of Object.values(chartGroups).flat()) {
    assert.equal(widgetOptions(item.symbol).allow_symbol_change, false);
    assert.equal(widgetOptions(item.symbol).timezone, 'Asia/Seoul');
  }
});
test('charts metadata and template state scope data limitations', () => {
  const html = fs.readFileSync('site/charts.html', 'utf8');
  const output = metadata(html, 'charts/index.html');
  assert.match(output, /https:\/\/leeandnote.com\/charts/);
  assert.match(output, /property="og:title"/);
  assert.match(html, /국내 야간선물 시세는 이 페이지에서 제공하지 않는다/);
  assert.match(html, /aria-current="page">차트/);
});
test('built output includes navigation, route and sitemap', () => {
  assert.ok(fs.existsSync('public_dist/charts/index.html'));
  for (const file of ['calendar/index.html', '5percent/index.html', 'blog/index.html']) {
    assert.match(fs.readFileSync(`public_dist/${file}`, 'utf8'), /href="\/charts"/);
  }
  assert.match(fs.readFileSync('public_dist/sitemap.xml', 'utf8'), /https:\/\/leeandnote.com\/charts<\/loc>/);
});
