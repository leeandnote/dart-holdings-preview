import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectFeedArticles } from './search_feed.mjs';

export function draftDailyQuestion(dist, date, output) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD');
  if (path.resolve(output).startsWith(path.resolve(dist) + path.sep)) throw new Error('Drafts must stay outside the public site');
  const candidates = collectFeedArticles(dist).filter(a => a.reportDate === date && a.sources.length && /\/blog\/(contracts|5percent|executives)\//.test(a.url));
  // Prefer a concrete contract question; never infer investment merit from a headline.
  const article = candidates.find(a => a.url.includes('/contracts/')) || candidates[0];
  if (!article) { console.log(`No sourced article for ${date}; no draft generated`); return null; }
  const question = article.url.includes('/contracts/') ? '이 수주 공시의 계약금액은 매출에 언제 반영될까?' : '이번 지분 변동은 실제 매수일까, 다른 사유일까?';
  const text = `# ${date} 질문형 기사 검토 초안\n\n상태: 미검수 · 공개 발행 금지\n\n## 제목 후보\n${question}\n\n## 취재 출발점\n${article.title}\n${article.url}\n\n## 데이터 페이지 요약 (원문 대조 전)\n${article.description}\n\n## 원문 후보\n${article.sources.slice(0, 5).map(u => '- ' + u).join('\n')}\n\n## 작성·검수 항목\n- 원문 한 건을 선택하고 실제 기업명을 제목에 넣기\n- 접수일과 거래일·계약기간을 구분하고 최신 정정 여부 확인\n- 핵심 수치와 계산 분모를 원문과 대조\n- 첫 문단에 질문의 답을 쓰고, 이번 사례의 조건과 예외 설명\n- 일반 용어 설명 대신 해당 공시의 고유한 사실 2~3개 포함\n- 관련 종목·용어 링크, 작성자, 검수일 기재\n- 근거 없는 주가 전망과 매수·매도 유도 삭제\n\n자동 생성된 기획 초안이며 완성 기사나 투자 분석이 아닙니다.\n`;
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, `${date}.md`);
  fs.writeFileSync(file, text);
  return file;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const date = process.argv[2] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  console.log(draftDailyQuestion('public_dist', date, 'editorial-drafts') || 'Skipped');
}
