import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("site");
const OUT = path.join(ROOT, "blog", "issues");
const CONVEX = (process.env.CONVEX_URL || "https://quiet-cardinal-118.convex.cloud").replace(/\/$/, "");
const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
const endDe = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
const bgnDe = "00000000";
const iso = `${endDe.slice(0, 4)}-${endDe.slice(4, 6)}-${endDe.slice(6, 8)}`;

async function query(queryPath, limit = 3000) {
  const response = await fetch(`${CONVEX}/api/query`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: queryPath, args: { bgnDe, endDe, limit }, format: "json" }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || `${queryPath} failed`);
  return payload.value || [];
}

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = (value) => Number.isFinite(value) ? `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%` : "-";
const shares = (value) => Number.isFinite(value) ? `${Math.round(value).toLocaleString("ko-KR")}주` : "-";
const dateText = (value) => String(value || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3");

function head(title, description, canonical) {
  const schema = { "@context": "https://schema.org", "@type": "Article", headline: title, description, dateModified: iso, inLanguage: "ko-KR", mainEntityOfPage: canonical, author: { "@type": "Organization", name: "리앤노트" }, publisher: { "@type": "Organization", name: "리앤노트" }, isBasedOn: "https://dart.fss.or.kr/" };
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="google-adsense-account" content="ca-pub-5230074340613849"><title>${esc(title)} | 리앤노트</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5230074340613849" crossorigin="anonymous"></script></head>`;
}

const blogTemplate = await readFile(path.join(ROOT, "blog", "index.html"), "utf8");
const sharedStyle = blogTemplate.match(/<style>[\s\S]*?<\/style>/)?.[0] || "";
const sharedTopbar = blogTemplate.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] || "";
const issueStyle = `<style>
  .orbThumb.issue{background:radial-gradient(circle at 72% 44%,rgba(49,105,219,.21),rgba(49,105,219,.06) 35%,transparent 60%),linear-gradient(135deg,#f8fbff,#f8fafc 60%,#edf3ff)}.orbThumb.issue:after{background:linear-gradient(145deg,rgba(129,170,255,.66),rgba(55,91,170,.48));box-shadow:0 34px 70px rgba(49,105,219,.16)}.orbThumb.issue .orbit{border-color:rgba(49,105,219,.20);border-left-color:transparent;border-bottom-color:transparent}
  .issueTable{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed}.issueTable th{padding:11px 10px;border-bottom:1px solid #dfe5ec;background:#fbfcfd;color:#667085;font-size:12px;font-weight:780}.issueTable td{padding:14px 12px;border-bottom:1px solid #edf1f5;text-align:center;color:#333b47;font-size:14px;line-height:1.5}.issueTable td:first-child{text-align:left;font-weight:720;color:#111827}.issueTable small{display:block;margin-top:4px;color:#7b8490;font-size:12px}.issueTable a{color:#7b8490;text-decoration:none}.issueTable a:hover{color:#ff5520}.issueCategoryLead{margin-bottom:8px}
  @media(max-width:720px){.issueTableWrap{width:calc(100vw - 32px);overflow-x:auto}.issueTable{width:760px;min-width:760px}}
</style>`;
const categories = (active = "issues") => `<div class="categoryBar" aria-label="블로그 카테고리"><a href="/blog/">전체</a><a href="/blog/5percent/">5%보고</a><a href="/blog/executives/">임원보고</a><a href="/blog/contracts/">대형수주</a><a class="${active === "issues" ? "active" : ""}" href="/blog/issues/">이슈 분석</a></div>`;

async function article(topic) {
  const dir = path.join(OUT, topic.slug); await mkdir(dir, { recursive: true });
  const canonical = `https://leeandnote.com/blog/issues/${topic.slug}/`;
  const rows = topic.rows;
  const bodyRows = rows.map(topic.row).join("");
  await writeFile(path.join(dir, "index.html"), `${head(topic.title, topic.description, canonical)}<body class="blogBody">${sharedStyle}${issueStyle}${sharedTopbar}<main class="blogShell"><article><header class="blogHero"><div class="postMeta"><span class="postBadge">이슈 분석</span><span class="postDate">· 최근 업데이트 ${iso}</span></div><h1>${esc(topic.title)}</h1><div class="lead">${esc(topic.description)}</div><nav class="insightTabs" aria-label="블로그 공시 주제"><a href="/blog/">전체</a><a href="/blog/5percent/">5%보고</a><a href="/blog/executives/">임원보고</a><a href="/blog/contracts/">대형수주</a><a class="active" href="/blog/issues/">이슈 분석</a></nav></header><section class="articleBody"><div class="summaryBox">${topic.answer}</div><div class="articleTableWrap issueTableWrap"><table class="issueTable"><thead><tr>${topic.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></div><div class="note">운영 DB 수집 시작 이후 공시를 누적해 최신순으로 제공한다. 실제 투자 판단 전 공시 원문과 최신 정정 공시를 함께 확인해야 한다.</div></section></article><footer class="blogFoot">출처: DART 전자공시 · LEE&amp;NOTE 데이터 레이더</footer></main></body></html>`, "utf8");
}

const [holdings, executives, majorEvents] = await Promise.all([
  query("dart:listDailyReportItemsRange"), query("dart:listExecutiveDailyReportItemsRange"), query("dart:listMajorEventDailyReportItemsRange", 1000),
]);

const topics = [];
const pension = executives.filter((r) => /국민연금|연기금|공무원연금|사학연금/.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (pension.length) topics.push({ slug: "national-pension-stock-holdings", score: 88, title: "국민연금이 보유주식을 늘리거나 줄인 종목", description: "DART 임원·주요주주 보고에서 국민연금의 보유주식수와 보유비율 변동을 종목별로 누적 정리했다.", answer: `운영 DB 수집 시작 이후 국민연금 관련 공시 <strong>${pension.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 보유비율과 주식수 증감은 공시 제출 시점 기준이며 실제 매매 시점과 다를 수 있다.`, rows: pension, headers: ["종목", "보고자", "보유비율", "주식수 변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const samsung = executives.filter((r) => r.stockCode === "005930").sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (samsung.length) topics.push({ slug: "samsung-electronics-executive-shareholdings", score: 92, title: "삼성전자 임원·주요주주 보유주식 변동", description: "삼성전자 임원과 주요주주의 보유주식수 및 지분율 변동 공시를 제출인별로 누적했다.", answer: `삼성전자 임원·주요주주 보고는 제출인마다 별도 공시된다. 아래 표는 운영 DB 수집 시작 이후 공시를 누적해 현재 보유주식수와 직전 보고 대비 증감 수량을 비교한다.`, rows: samsung, headers: ["제출인", "직책·구분", "보유주식수", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.reporter)}<small>삼성전자 · 005930</small></td><td>${esc(r.reporterType)}</td><td>${shares(r.currentShares)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const clinical = majorEvents.filter((r) => /임상|IND|시험계획|품목허가/i.test(`${r.eventType} ${r.reportName} ${r.eventTitle}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (clinical.length) topics.push({ slug: "biotech-clinical-trials", score: 86, title: "바이오·제약사 임상시험과 IND 공시", description: "국내 바이오·제약사의 임상시험계획 신청·승인과 주요 임상 단계 공시를 한곳에 누적 정리했다.", answer: `운영 DB 수집 시작 이후 투자판단 관련 주요경영사항에서 임상·IND 공시 <strong>${clinical.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 신청과 승인은 의미가 다르므로 진행 상태와 임상 단계를 구분해 확인해야 한다.`, rows: clinical, headers: ["종목", "핵심 사건", "임상 단계·상태", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.eventTitle)}</td><td>${esc(r.metric)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const jpmorgan = holdings.filter((r) => /j\.?\s*p\.?\s*morgan|jpmorgan|제이피모간|제이피모건/i.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (jpmorgan.length) topics.push({ slug: "jpmorgan-five-percent-holdings", score: 90, title: "JP모건 5% 신규 보유 및 지분 변동 종목", description: "JP모건 계열 제출인의 국내 상장사 5% 보유 신규·변동 보고를 누적 정리했다.", answer: `운영 DB 수집 시작 이후 JP모건 관련 5%보고 <strong>${jpmorgan.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 신규 5% 진입과 기존 지분 변동을 구분해 볼 필요가 있다.`, rows: jpmorgan, headers: ["종목", "제출인", "보유비율", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${pct(r.rateDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

topics.sort((a, b) => b.score - a.score);
await mkdir(OUT, { recursive: true });
for (const topic of topics) await article(topic);
const cards = topics.map((t) => `<a class="insightCard" href="/blog/issues/${t.slug}/"><div class="insightThumb"><div class="orbThumb issue"><span class="stars"></span><span class="orbit"></span><span class="label">ISSUE ANALYSIS<small>UPDATED ${iso.replaceAll("-", ".")}</small></span></div></div><div class="insightContent"><small>이슈 분석 · 최근 업데이트 ${iso.replaceAll("-", ".")}</small><h2>${esc(t.title)}</h2><p>${esc(t.description)}</p></div></a>`).join("");
await writeFile(path.join(OUT, "index.html"), `${head("주식 공시 이슈 분석", "검색 수요와 공시 중요도를 함께 고려해 기관·인물·임상 이슈를 분석한다.", "https://leeandnote.com/blog/issues/")}<body class="blogBody">${sharedStyle}${issueStyle}${sharedTopbar}<main class="blogShell"><section class="blogHero"><p>LEE&amp;NOTE ISSUE ANALYSIS</p><h1>검색 수요가 높은 주식 공시 이슈</h1><div class="lead issueCategoryLead">기관 지분 변동, 주요 인물의 보유주식, 바이오 임상처럼 반복해서 찾는 공시를 대표 페이지로 누적 갱신합니다.</div></section>${categories()}<section class="insightGrid" aria-label="이슈 분석 목록">${cards || "<p>발행 기준을 충족한 이슈가 없습니다.</p>"}</section><footer class="blogFoot">본 서비스는 DART 공시를 기반으로 한 정보 제공 서비스이며, 특정 종목의 매수·매도 추천이 아닙니다.</footer></main></body></html>`, "utf8");

let mainBlog = await readFile(path.join(ROOT, "blog", "index.html"), "utf8");
mainBlog = mainBlog.replace(/\n?\s*<!-- ISSUE_ANALYSIS_START -->[\s\S]*?<!-- ISSUE_ANALYSIS_END -->\n?/g, "\n");
mainBlog = mainBlog.replace(/(<section class="insightGrid" aria-label="공시 인사이트 목록">)/, `$1\n<!-- ISSUE_ANALYSIS_START -->\n${cards}\n<!-- ISSUE_ANALYSIS_END -->`);
if (!mainBlog.includes('<a href="/blog/issues/">이슈 분석</a>')) {
  mainBlog = mainBlog.replace(/(<a href="\/blog\/contracts\/">대형수주<\/a>)/, `$1\n    <a href="/blog/issues/">이슈 분석</a>`);
}
await writeFile(path.join(ROOT, "blog", "index.html"), mainBlog, "utf8");
const sitemapPath = path.join(ROOT, "sitemap.xml");
let sitemap = await readFile(sitemapPath, "utf8");
const issueUrls = ["https://leeandnote.com/blog/issues/", ...topics.map((topic) => `https://leeandnote.com/blog/issues/${topic.slug}/`)];
for (const loc of issueUrls) {
  if (!sitemap.includes(`<loc>${loc}</loc>`)) {
    sitemap = sitemap.replace("</urlset>", `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${iso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
  }
}
await writeFile(sitemapPath, sitemap, "utf8");
console.log(JSON.stringify({ generated: topics.map((t) => t.slug), scores: Object.fromEntries(topics.map((t) => [t.slug, t.score])) }, null, 2));
