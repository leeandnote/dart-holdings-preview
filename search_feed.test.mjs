import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { buildSearchFeed } from './search_feed.mjs';
import { draftDailyQuestion } from './draft_daily_question.mjs';

test('feed excludes hubs, noindex and future articles; dates are not invented; drafts remain private', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-test-'));
  const dist = path.join(root, 'public');
  const put = (name, content) => { const file = path.join(dist, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  const page = (url, extra = '', article = true) => `<html><head><link rel="canonical" href="https://leeandnote.com${url}"><meta name="description" content="금액 &amp; 조건">${extra}</head><body><main>${article ? '<article>' : ''}<h1>기업 &amp; 공시</h1><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20200102000123">원문</a>${article ? '</article>' : ''}</main></body></html>`;
  try {
    put('blog/contracts/2020-01-02/index.html', page('/blog/contracts/2020-01-02/'));
    put('blog/5percent/2020-01-01/index.html', page('/blog/5percent/2020-01-01/'));
    put('blog/index.html', page('/blog/', '', false));
    put('blog/private/index.html', page('/blog/private/', '<meta name="robots" content="noindex">'));
    put('blog/5percent/2099-01-01/index.html', page('/blog/5percent/2099-01-01/'));
    put('data/blog-editorial.json', JSON.stringify({entries:{'https://leeandnote.com/blog/contracts/2020-01-02/':{publishedAt:'2020-01-02T10:00:00Z'}}}));
    assert.equal(buildSearchFeed(dist, {now:'2026-11-25T00:00:00Z'}), 2);
    const before = fs.readFileSync(path.join(dist, 'rss.xml'), 'utf8');
    const xml = new DOMParser().parseFromString(before, 'text/xml');
    assert.equal(xml.querySelectorAll('item').length, 2);
    assert.equal(xml.querySelectorAll('pubDate').length, 1);
    assert.equal(xml.querySelector('item title').textContent, '기업 & 공시');
    buildSearchFeed(dist, {now:'2026-11-26T00:00:00Z'});
    assert.equal(fs.readFileSync(path.join(dist, 'rss.xml'), 'utf8'), before);
    assert.equal((fs.readFileSync(path.join(dist, 'blog/index.html'), 'utf8').match(/application\/rss\+xml/g) || []).length, 1);
    assert.throws(() => draftDailyQuestion(dist, '2020-01-02', path.join(dist, 'drafts')));
    assert.ok(draftDailyQuestion(dist, '2020-01-02', path.join(root, 'drafts')));
    assert.equal(draftDailyQuestion(dist, '2020-01-03', path.join(root, 'drafts')), null);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
