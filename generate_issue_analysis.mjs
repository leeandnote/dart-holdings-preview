import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("site");
const OUT = path.join(ROOT, "blog", "issues");
const CONVEX = (process.env.CONVEX_URL || "https://quiet-cardinal-118.convex.cloud").replace(/\/$/, "");
const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
const endDe = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
today.setUTCDate(today.getUTCDate() - 120);
const bgnDe = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
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
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | 리앤노트</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script><style>
  body{margin:0;background:#f6f7f9;color:#111827;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.issueShell{max-width:980px;margin:auto;padding:42px 20px 80px}.issueNav{display:flex;gap:18px;padding:18px 0;border-bottom:1px solid #dde3eb}.issueNav a{color:#263247;text-decoration:none;font-weight:800}.issueHero{padding:46px 0 28px}.issueHero small{color:#f0521d;font-weight:900}.issueHero h1{max-width:820px;margin:12px 0;font-size:38px;line-height:1.22}.issueHero p{color:#647086;font-size:17px;line-height:1.7}.answer{margin:10px 0 28px;padding:20px 22px;border-left:4px solid #fa4905;background:#fff;border-radius:0 8px 8px 0;line-height:1.75}.issueTable{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dfe5ed}.issueTable th{padding:13px;background:#1e2530;color:#fff;font-size:13px}.issueTable td{padding:13px;border-bottom:1px solid #e6ebf2;text-align:center;font-size:14px}.issueTable td:first-child{text-align:left;font-weight:800}.issueTable small{display:block;color:#708097;margin-top:4px}.issueTable a{color:#697386}.note{margin-top:26px;color:#737f91;font-size:13px;line-height:1.7}@media(max-width:720px){.issueHero h1{font-size:29px}.issueTableWrap{overflow-x:auto}.issueTable{min-width:720px}}
  </style></head>`;
}

function nav() { return `<nav class="issueNav"><a href="/">LEE&amp;NOTE</a><a href="/blog/">블로그</a><a href="/blog/issues/">이슈 분석</a><a href="/disclosurepedia/">공시피디아</a></nav>`; }

async function article(topic) {
  const dir = path.join(OUT, topic.slug); await mkdir(dir, { recursive: true });
  const canonical = `https://leeandnote.com/blog/issues/${topic.slug}/`;
  const rows = topic.rows.slice(0, 20);
  const bodyRows = rows.map(topic.row).join("");
  await writeFile(path.join(dir, "index.html"), `${head(topic.title, topic.description, canonical)}<body><main class="issueShell">${nav()}<article><header class="issueHero"><small>이슈 분석 · ${iso}</small><h1>${esc(topic.title)}</h1><p>${esc(topic.description)}</p></header><div class="answer">${topic.answer}</div><div class="issueTableWrap"><table class="issueTable"><thead><tr>${topic.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></div><p class="note">DART 전자공시를 기준으로 정리한 정보 제공 자료다. 실제 투자 판단 전 공시 원문과 최신 정정 공시를 함께 확인해야 한다.</p></article></main></body></html>`, "utf8");
}

const [holdings, executives, majorEvents] = await Promise.all([
  query("dart:listDailyReportItemsRange"), query("dart:listExecutiveDailyReportItemsRange"), query("dart:listMajorEventDailyReportItemsRange", 1000),
]);

const topics = [];
const pension = executives.filter((r) => /국민연금|연기금|공무원연금|사학연금/.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (pension.length) topics.push({ slug: "national-pension-stock-holdings", score: 88, title: "국민연금이 보유주식을 늘리거나 줄인 종목", description: "최근 DART 임원·주요주주 보고에서 국민연금의 보유주식수와 보유비율 변동을 종목별로 정리했다.", answer: `최근 120일 운영 DB에서 국민연금 관련 공시 <strong>${pension.length.toLocaleString("ko-KR")}건</strong>을 확인했다. 보유비율과 주식수 증감은 공시 제출 시점 기준이며 실제 매매 시점과 다를 수 있다.`, rows: pension, headers: ["종목", "보고자", "보유비율", "주식수 변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const samsung = executives.filter((r) => r.stockCode === "005930").sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (samsung.length) topics.push({ slug: "samsung-electronics-executive-shareholdings", score: 92, title: "삼성전자 임원·주요주주 보유주식 변동", description: "삼성전자 임원과 주요주주의 최근 보유주식수 및 지분율 변동 공시를 제출인별로 모았다.", answer: `삼성전자 임원·주요주주 보고는 제출인마다 별도 공시된다. 아래 표는 최근 120일 공시를 기준으로 현재 보유주식수와 직전 보고 대비 증감 수량을 비교한다.`, rows: samsung, headers: ["제출인", "직책·구분", "보유주식수", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.reporter)}<small>삼성전자 · 005930</small></td><td>${esc(r.reporterType)}</td><td>${shares(r.currentShares)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const clinical = majorEvents.filter((r) => /임상|IND|시험계획|품목허가/i.test(`${r.eventType} ${r.reportName} ${r.eventTitle}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (clinical.length) topics.push({ slug: "biotech-clinical-trials", score: 86, title: "바이오·제약사 임상시험과 IND 공시", description: "국내 바이오·제약사의 임상시험계획 신청·승인과 주요 임상 단계 공시를 한곳에 정리했다.", answer: `최근 투자판단 관련 주요경영사항에서 임상·IND 공시 <strong>${clinical.length.toLocaleString("ko-KR")}건</strong>을 확인했다. 신청과 승인은 의미가 다르므로 진행 상태와 임상 단계를 구분해 확인해야 한다.`, rows: clinical, headers: ["종목", "핵심 사건", "임상 단계·상태", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.eventTitle)}</td><td>${esc(r.metric)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const jpmorgan = holdings.filter((r) => /j\.?\s*p\.?\s*morgan|jpmorgan|제이피모간|제이피모건/i.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (jpmorgan.length) topics.push({ slug: "jpmorgan-five-percent-holdings", score: 90, title: "JP모건 5% 신규 보유 및 지분 변동 종목", description: "JP모건 계열 제출인의 국내 상장사 5% 보유 신규·변동 보고를 정리했다.", answer: `최근 120일 5%보고에서 JP모건 관련 공시 <strong>${jpmorgan.length.toLocaleString("ko-KR")}건</strong>을 확인했다. 신규 5% 진입과 기존 지분 변동을 구분해 볼 필요가 있다.`, rows: jpmorgan, headers: ["종목", "제출인", "보유비율", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${pct(r.rateDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

topics.sort((a, b) => b.score - a.score);
await mkdir(OUT, { recursive: true });
for (const topic of topics) await article(topic);
const cards = topics.map((t) => `<a class="issueCard" href="/blog/issues/${t.slug}/"><small>이슈 분석 · 갱신 ${iso}</small><h2>${esc(t.title)}</h2><p>${esc(t.description)}</p></a>`).join("");
await writeFile(path.join(OUT, "index.html"), `${head("주식 공시 이슈 분석", "검색 수요와 공시 중요도를 함께 고려해 기관·인물·임상 이슈를 분석한다.", "https://leeandnote.com/blog/issues/")}<body><main class="issueShell">${nav()}<header class="issueHero"><small>LEE&amp;NOTE ISSUE ANALYSIS</small><h1>검색 수요가 높은 주식 공시 이슈</h1><p>기관 지분 변동, 주요 인물의 보유주식, 바이오 임상처럼 반복해서 찾는 공시를 대표 페이지로 누적 갱신한다.</p></header><section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">${cards || "<p>발행 기준을 충족한 이슈가 없습니다.</p>"}</section><style>.issueCard{display:block;padding:22px;border:1px solid #dfe5ed;border-radius:8px;background:#fff;color:#172033;text-decoration:none}.issueCard small{color:#f0521d;font-weight:900}.issueCard h2{font-size:21px;line-height:1.35}.issueCard p{color:#647086;line-height:1.65}</style></main></body></html>`, "utf8");
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
