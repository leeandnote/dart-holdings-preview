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
  .issueColumn{margin:28px 0;color:#303846;font-size:16px;line-height:1.85}.issueColumn h2{margin:32px 0 12px;color:#101828;font-size:24px;line-height:1.35}.issueColumn h3{margin:24px 0 8px;color:#172033;font-size:18px}.issueColumn p{margin:0 0 14px}.issueColumn ul{margin:8px 0 18px;padding-left:22px}.issueColumn li{margin:6px 0}.issueColumn strong{color:#101828}.issueTableTitle{margin:30px 0 12px;color:#101828;font-size:22px}.issueFaq{margin-top:30px;padding-top:4px;border-top:1px solid #e3e8ef}.issueFaq h3{font-size:17px}.issueFaq p{color:#4d5766}
  @media(max-width:720px){.issueTableWrap{width:calc(100vw - 32px);overflow-x:auto}.issueTable{width:760px;min-width:760px}}
</style>`;
const categories = (active = "issues") => `<div class="categoryBar" aria-label="블로그 카테고리"><a href="/blog/">전체</a><a href="/blog/5percent/">5%보고</a><a href="/blog/executives/">임원보고</a><a href="/blog/contracts/">대형수주</a><a class="${active === "issues" ? "active" : ""}" href="/blog/issues/">이슈 분석</a></div>`;

async function article(topic) {
  const dir = path.join(OUT, topic.slug); await mkdir(dir, { recursive: true });
  const canonical = `https://leeandnote.com/blog/issues/${topic.slug}/`;
  const rows = topic.rows;
  const bodyRows = rows.map(topic.row).join("");
  await writeFile(path.join(dir, "index.html"), `${head(topic.title, topic.description, canonical)}<body class="blogBody">${sharedStyle}${issueStyle}${sharedTopbar}<main class="blogShell"><article><header class="blogHero"><div class="postMeta"><span class="postBadge">이슈 분석</span><span class="postDate">· 최근 업데이트 ${iso}</span></div><h1>${esc(topic.title)}</h1><div class="lead">${esc(topic.description)}</div><nav class="insightTabs" aria-label="블로그 공시 주제"><a href="/blog/">전체</a><a href="/blog/5percent/">5%보고</a><a href="/blog/executives/">임원보고</a><a href="/blog/contracts/">대형수주</a><a class="active" href="/blog/issues/">이슈 분석</a></nav></header><section class="articleBody"><div class="summaryBox">${topic.answer}</div><div class="issueColumn">${topic.column}</div><h2 class="issueTableTitle">관련 DART 공시 누적 현황</h2><div class="articleTableWrap issueTableWrap"><table class="issueTable"><thead><tr>${topic.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></div><div class="issueColumn issueFaq">${topic.faq}</div><div class="note">운영 DB 수집 시작 이후 공시를 누적해 최신순으로 제공한다. 실제 투자 판단 전 공시 원문과 최신 정정 공시를 함께 확인해야 한다.</div></section></article><footer class="blogFoot">출처: DART 전자공시 · LEE&amp;NOTE 데이터 레이더</footer></main></body></html>`, "utf8");
}

const [holdings, executives, majorEvents] = await Promise.all([
  query("dart:listDailyReportItemsRange"), query("dart:listExecutiveDailyReportItemsRange"), query("dart:listMajorEventDailyReportItemsRange", 1000),
]);

const topics = [];
const pension = executives.filter((r) => /국민연금|연기금|공무원연금|사학연금/.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (pension.length) topics.push({ slug: "national-pension-stock-holdings", score: 88, title: "국민연금 보유주식 변동 종목은? 지분 증가·감소 공시 정리", description: "국민연금의 국내 상장사 보유주식과 지분율 변동 공시를 종목별·제출일별로 누적 정리한다.", answer: `운영 DB 수집 시작 이후 국민연금 관련 공시 <strong>${pension.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 보유비율과 주식수 증감은 공시 제출 시점 기준이며 실제 매매 시점과 다를 수 있다.`, column: `<h2>국민연금 보유주식 변동은 무엇을 보여주나</h2><p>국민연금 관련 공시는 특정 상장사의 보유주식수나 보유비율이 이전 보고와 비교해 어떻게 달라졌는지 확인하는 자료다. 표의 증가·감소 수치는 공시상 직전 보고와 이번 보고의 차이를 뜻한다.</p><p>다만 <strong>공시 접수일이 실제 매수·매도일과 같지는 않다.</strong> 여러 거래가 일정 기간 누적된 뒤 보고될 수 있으므로, 단순히 접수 당일 국민연금이 해당 종목을 사고팔았다고 해석해서는 안 된다.</p><h2>국민연금 지분 공시를 볼 때 확인할 항목</h2><ul><li>직전 보고 대비 보유비율이 증가했는지 감소했는지</li><li>주식수 변화와 지분율 변화의 방향이 같은지</li><li>신규 보고인지 기존 보유분의 변동 보고인지</li><li>보고의무 발생일과 공시 접수일 사이에 시차가 있는지</li></ul>`, faq: `<h2>자주 묻는 질문</h2><h3>국민연금이 산 주식을 바로 알 수 있나?</h3><p>공시로 보유량의 변화를 확인할 수 있지만 실제 거래일과 평균 매입가격을 모두 알 수 있는 것은 아니다. 보고의무 발생일과 세부 변동 사유를 원문에서 함께 확인해야 한다.</p><h3>지분 증가가 주가 상승 신호인가?</h3><p>지분 증가는 기관의 보유 변화라는 사실을 보여줄 뿐 향후 수익률을 보장하지 않는다. 회사의 실적, 밸류에이션, 시장 상황과 별도로 판단할 필요가 있다.</p>`, rows: pension, headers: ["종목", "보고자", "보유비율", "주식수 변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const samsung = executives.filter((r) => r.stockCode === "005930").sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (samsung.length) topics.push({ slug: "samsung-electronics-executive-shareholdings", score: 92, title: "삼성전자 임원 주식 보유 현황은? 주요주주 지분 변동 정리", description: "삼성전자 임원과 주요주주의 보유주식수, 증감 수량과 지분 관련 공시를 제출인별로 확인한다.", answer: `삼성전자 임원·주요주주 보고는 제출인마다 별도 공시된다. 아래 표는 운영 DB 수집 시작 이후 공시를 누적해 현재 보유주식수와 직전 보고 대비 증감 수량을 비교한다.`, column: `<h2>삼성전자 임원 보유주식 공시는 어떻게 읽어야 하나</h2><p>삼성전자 임원과 주요주주의 주식 변동은 임원·주요주주 특정증권등 소유상황보고서를 통해 확인할 수 있다. 한 번의 공시에 회사 전체 임원이 함께 표시되는 방식이 아니라 <strong>제출인별로 별도 보고</strong>되기 때문에 여러 공시를 모아 봐야 흐름을 파악하기 쉽다.</p><p>보유주식 증가가 모두 장내매수를 의미하는 것은 아니다. 상여금, 주식매수선택권 행사, 신규 임원 선임, 증여 등 다양한 사유가 있을 수 있다. 따라서 보유주식수와 증감 수량뿐 아니라 DART 원문의 변동 사유와 취득·처분 방법을 확인해야 한다.</p><h2>이재용 지분율과 임원 보유주식은 같은 자료인가</h2><p>동일한 개념이 아니다. 최대주주와 특수관계인의 지분 현황, 5% 이상 대량보유 보고, 임원·주요주주의 소유상황 보고는 보고 목적과 기준이 다르다. 특정 인물의 삼성전자 지분율을 확인하려면 해당 인물과 특수관계인 범위, 기준일, 보고서 종류를 함께 구분해야 한다.</p>`, faq: `<h2>자주 묻는 질문</h2><h3>임원이 주식을 늘리면 장내매수인가?</h3><p>반드시 그렇지는 않다. 변동 수량은 같아도 취득 원인은 장내매수, 상여, 주식보상 등으로 다를 수 있으므로 원문보기에서 변동 사유를 확인해야 한다.</p><h3>표의 보유주식수는 현재 실시간 수량인가?</h3><p>각 제출인의 가장 최근 공시 시점 수량이다. 공시 이후 거래가 있었지만 아직 보고되지 않았다면 실제 현재 수량과 차이가 생길 수 있다.</p>`, rows: samsung, headers: ["제출인", "직책·구분", "보유주식수", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.reporter)}<small>삼성전자 · 005930</small></td><td>${esc(r.reporterType)}</td><td>${shares(r.currentShares)}</td><td>${shares(r.shareDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const clinical = majorEvents.filter((r) => /임상|IND|시험계획|품목허가/i.test(`${r.eventType} ${r.reportName} ${r.eventTitle}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (clinical.length) topics.push({ slug: "biotech-clinical-trials", score: 86, title: "바이오 임상시험 IND 신청·승인 차이는? 최신 공시 종목 정리", description: "국내 바이오·제약사의 임상시험계획 IND 신청·승인과 임상 단계별 주요 공시를 설명하고 누적 정리한다.", answer: `운영 DB 수집 시작 이후 투자판단 관련 주요경영사항에서 임상·IND 공시 <strong>${clinical.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 신청과 승인은 의미가 다르므로 진행 상태와 임상 단계를 구분해 확인해야 한다.`, column: `<h2>IND 신청과 승인은 무엇이 다른가</h2><p>IND는 의약품 후보물질을 사람에게 투여하는 임상시험을 진행하기 위해 규제기관에 제출하는 임상시험계획을 뜻한다. <strong>IND 신청은 심사를 요청한 단계이고, IND 승인은 임상시험 진행을 허가받은 단계</strong>이므로 같은 의미로 볼 수 없다.</p><p>승인 공시가 곧 임상 성공이나 품목허가를 의미하지도 않는다. 승인 이후에도 환자 모집, 투약, 데이터 분석과 후속 임상 단계가 남는다. 공시 제목에 표시된 신청·승인·변경승인과 임상 1상, 2상, 3상 구분을 함께 확인해야 한다.</p><h2>바이오 임상 공시에서 확인할 핵심 정보</h2><ul><li>신청인지 승인인지, 또는 임상시험계획 변경승인인지</li><li>임상 단계와 대상 환자, 적응증</li><li>시험 대상 국가와 규제기관</li><li>임상시험의 1차·2차 평가지표</li><li>예상 일정이 아니라 실제 승인·개시 여부인지</li></ul>`, faq: `<h2>자주 묻는 질문</h2><h3>IND 승인은 치료제의 판매 허가인가?</h3><p>아니다. IND 승인은 임상시험을 수행할 수 있다는 의미이며, 의약품 판매를 위한 품목허가와는 별개의 절차다.</p><h3>임상 3상이면 성공 가능성이 확정됐나?</h3><p>임상 단계가 진행됐다는 사실을 보여주지만 결과를 보장하지 않는다. 시험 설계, 평가변수, 환자 모집과 최종 통계 결과를 모두 확인해야 한다.</p>`, rows: clinical, headers: ["종목", "핵심 사건", "임상 단계·상태", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.eventTitle)}</td><td>${esc(r.metric)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

const jpmorgan = holdings.filter((r) => /j\.?\s*p\.?\s*morgan|jpmorgan|제이피모간|제이피모건/i.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
if (jpmorgan.length) topics.push({ slug: "jpmorgan-five-percent-holdings", score: 90, title: "JP모건이 5% 이상 보유한 국내 주식은? 지분 변동 종목 정리", description: "JP모건 계열 제출인의 국내 상장사 5% 신규 보유와 지분 증가·감소 공시를 종목별로 누적 확인한다.", answer: `운영 DB 수집 시작 이후 JP모건 관련 5%보고 <strong>${jpmorgan.length.toLocaleString("ko-KR")}건</strong>을 누적했다. 신규 5% 진입과 기존 지분 변동을 구분해 볼 필요가 있다.`, column: `<h2>JP모건 5% 지분 공시는 무엇을 의미하나</h2><p>국내 상장사 주식 등을 5% 이상 보유하게 되거나 보유비율에 중요한 변동이 생기면 대량보유상황보고가 제출된다. JP모건 관련 보고는 영문 법인명이나 계열사 명칭으로 제출될 수 있어 단일 이름만 검색하면 일부 공시를 놓칠 수 있다.</p><p><strong>신규 5% 보고는 처음 투자한 날과 같은 뜻이 아니다.</strong> 보유비율이 보고 기준에 도달해 의무가 발생한 것이며, 여러 거래가 누적된 결과일 수 있다. 반대로 5% 아래로 내려간 보고도 전량 매도를 뜻하지 않는다.</p><h2>기관 5% 보고에서 함께 볼 항목</h2><ul><li>직전 보고와 이번 보고의 보유비율</li><li>보고 목적이 단순투자인지 일반투자인지 경영참가 목적인지</li><li>제출인이 JP모건 계열 어느 법인인지</li><li>보유주식수 변화와 보고의무 발생일</li></ul>`, faq: `<h2>자주 묻는 질문</h2><h3>JP모건이 5%를 신고하면 주가에 긍정적인가?</h3><p>기관의 대량보유 사실은 참고 정보지만 향후 주가 방향을 보장하지 않는다. 보유 목적과 이후 추가 보고, 회사의 재무·사업 상황을 함께 봐야 한다.</p><h3>표에서 0%에서 시작하는 이유는 무엇인가?</h3><p>운영 데이터상 비교 가능한 직전 보고가 없거나 신규 보고로 분류된 경우 0%로 표시될 수 있다. 정확한 기준은 연결된 DART 원문에서 확인하는 것이 좋다.</p>`, rows: jpmorgan, headers: ["종목", "제출인", "보유비율", "변동", "접수일"], row: (r) => `<tr><td>${esc(r.corpName)}<small>${esc(r.stockCode)} · ${esc(r.market)}</small></td><td>${esc(r.reporter)}</td><td>${pct(r.previousRate)} → ${pct(r.currentRate)}</td><td>${pct(r.rateDelta)}</td><td>${dateText(r.reportDate)}<small><a href="${esc(r.url)}">원문보기</a></small></td></tr>` });

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
