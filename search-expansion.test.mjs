import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { metadata } from './site_metadata.mjs';
import { institutionTopics } from './institution_topics.mjs';
import { capitalGuides } from './capital_guides.mjs';
import { polishIssueHtml } from './issue_quality.mjs';

test('home descriptions match requested copy on every social surface', () => {
  const {document} = parseHTML(metadata('<html><head></head><body></body></html>', 'index.html'));
  const expected = 'DART 전자공시를 5% 지분보고, 임원·주요주주, 수주·공급계약, 투자판단으로 분류해 종목별 공시와 핵심 요약을 제공합니다.';
  for (const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']) assert.equal(document.querySelector(selector).content, expected);
  assert.ok(expected.length <= 80);
});
test('institutions require actual matching reporter and original disclosure, deduplicate without inventing zeros', () => {
  const row = {corpName:'테스트', stockCode:'123456', reporter:'신영자산운용', reportDate:'20261125', url:'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261125000123', previousRate:null,currentRate:5.1};
  const topics = institutionTopics([row,row,{...row,reporter:'신영증권'},{...row,reporter:'뱅가드',url:'https://bad.test'}]);
  assert.equal(topics.length, 1); assert.equal(topics[0].rows.length, 1);
  assert.match(topics[0].row(row), /미확인 → 5.1%/);
  assert.deepEqual(institutionTopics([]), []);
});
test('explanations have visible FAQs matching schema and no empty data table', () => {
  for (const guide of capitalGuides()) {
    const html = `<html><head></head><body><div class="articleBody"><h2 class="issueTableTitle">현황</h2><div class="issueTableWrap"><table class="issueTable"><tbody></tbody></table></div><div class="issueFaq">${guide.faq}</div><div class="note">누적</div></div></body></html>`;
    const output = polishIssueHtml(polishIssueHtml(html));
    const {document} = parseHTML(output);
    assert.equal(document.querySelectorAll('#issue-faq-schema').length, 1);
    assert.equal(document.querySelector('.issueTable'), null);
    const schema = JSON.parse(document.querySelector('#issue-faq-schema').textContent);
    assert.equal(schema.mainEntity.length, guide.slug==='rights-offering-disclosure-guide'?5:3);
    assert.deepEqual(schema.mainEntity.map(q => q.name), [...document.querySelectorAll('.issueFaq h3')].map(h => h.textContent));
  }
});
test('archive generator reads original headings instead of generic historic note titles', () => {
  const code = fs.readFileSync(new URL('./generate_daily_blog.mjs', import.meta.url),'utf8');
  assert.ok(code.includes('publishedTitles.get(`${kind}/${date}`)'));
  assert.ok(!code.includes('`${dottedItem} - 5%보고공시 요약 노트`'));
});
