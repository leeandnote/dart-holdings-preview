import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { applyChannelMenu, channels } from './channel_menu.mjs';

test('remove category links, preserve company and editorial links, insert five channels once', () => {
  const input = '<html><head></head><body><nav><a href="/disclosurepedia/">공시피디아</a><a href="/calendar">일정</a></nav><a class="radarRow" href="/disclosurepedia/">공시피디아</a><main><a href="/disclosurepedia/005930-삼성전자/">삼성전자</a><a href="/disclosurepedia/">관련 자료</a></main></body></html>';
  const output = applyChannelMenu(input);
  const { document } = parseHTML(applyChannelMenu(output));
  assert.equal(document.querySelectorAll('#channel-menu').length, 1);
  assert.equal(document.querySelectorAll('nav a[href="/disclosurepedia/"]').length, 0);
  assert.equal(document.querySelectorAll('main a').length, 2);
  assert.equal(document.querySelectorAll('#channel-menu a').length, 5);
  assert.deepEqual([...document.querySelectorAll('#channel-menu a')].map(a => a.getAttribute('href')), channels.map(c => c[2]));
  assert.ok(document.querySelector('a[href="/calendar"]'));
});
