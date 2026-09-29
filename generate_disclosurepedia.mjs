import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SITE = path.join(ROOT, "site");
const OUT = path.join(SITE, "disclosurepedia");
const BASE = "https://leeandnote.com";
const MAX_COMPANIES = 30;
const MIN_DISCLOSURES = 3;
const PRIORITY_CODES = [
  "005930", "000660", "000270", "035420", "068270", "207940", "042660",
  "034020", "247540", "086520", "012450", "373220", "005380", "035720",
];

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { return fallback; }
}
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function digits(value) { return String(value || "").replace(/\D/g, "").slice(0, 8); }
function isoDate(value) { const d = digits(value); return d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : ""; }
function compact(value, max = 110) { const s = String(value || "").replace(/\s+/g, " ").trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s; }
function money(value) {
  const n = Number(value); if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 100000000 ? `${Math.round(n / 100000000).toLocaleString("ko-KR")}억원` : `${Math.round(n).toLocaleString("ko-KR")}원`;
}
function pct(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%` : ""; }
function slug(code, name) { return `${code}-${String(name || "company").replace(/[^0-9A-Za-z가-힣]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`; }
function category(row) {
  if (row.category) return row.category;
  const report = `${row.reportName || ""} ${row.type || ""}`;
  if (/임원|주요주주.*소유상황/.test(report)) return "임원·주요주주";
  if (/단일판매|공급계약/.test(report)) return "대형수주";
  if (/투자판단.*주요경영사항/.test(report)) return "투자판단";
  return "5%보고";
}

const latest = readJson(path.join(SITE, "data", "latest.json"), { rows: [] });
const signals = readJson(path.join(SITE, "data", "disclosure_signals.json"), { rows: [] });
const rows = [];
for (const row of latest.rows || []) {
  const code = String(row["종목코드"] || row.stockCode || "").trim();
  const name = String(row["종목명"] || row.corpName || "").trim();
  if (!/^\d{6}$/.test(code) || !name) continue;
  rows.push({
    code, name, market: row["시장"] || row.market || "", date: digits(row["접수일"] || row.receiptDate),
    receiptNo: row["접수번호"] || row.receiptNo || "", reportName: row["보고서명"] || row.reportName || "주식등의대량보유상황보고서",
    type: row["보고구분"] || row.reporterType || "5%보고", reporter: row["보고자"] || row.reporter || "",
    summary: [row["보고사유"] || row.reason, row["직전지분율"] !== undefined && row["이번지분율"] !== undefined ? `${pct(row["직전지분율"])} → ${pct(row["이번지분율"])}` : ""].filter(Boolean).join(" · "),
    url: row.DART_URL || row.url || "", category: "5%보고",
  });
}
for (const row of signals.rows || []) {
  const code = String(row["종목코드"] || "").trim(); const name = String(row["종목명"] || "").trim();
  if (!/^\d{6}$/.test(code) || !name) continue;
  const type = String(row["공시유형"] || "");
  const cat = type === "단일판매·공급계약" ? "대형수주" : type === "투자판단관련주요경영사항" ? "투자판단" : "실적";
  const summary = cat === "대형수주"
    ? [money(row["계약금액"]), pct(row["매출대비비율"]), row["계약상대방"], row["계약내용"]].filter(Boolean).join(" · ")
    : row["주요내용"] || row["계약내용"] || "";
  rows.push({ code, name, market: row["시장"] || "", date: digits(row["접수일"]), receiptNo: row["접수번호"] || "", reportName: row["보고서명"] || type, type, reporter: "", summary, url: row.DART_URL || "", category: cat });
}

const companies = new Map();
for (const row of rows) {
  const item = companies.get(row.code) || { code: row.code, name: row.name, market: row.market, rows: [] };
  item.name ||= row.name; item.market ||= row.market; item.rows.push(row); companies.set(row.code, item);
}
const ranked = [...companies.values()]
  .map((company) => ({ ...company, rows: company.rows.sort((a,b) => b.date.localeCompare(a.date) || String(b.receiptNo).localeCompare(String(a.receiptNo))) }))
  .sort((a,b) => b.rows.length - a.rows.length || b.rows[0].date.localeCompare(a.rows[0].date));
const priority = PRIORITY_CODES.map((code) => ranked.find((company) => company.code === code)).filter(Boolean);
const prioritySet = new Set(priority.map((company) => company.code));
const selected = [...priority, ...ranked.filter((company) => company.rows.length >= MIN_DISCLOSURES && !prioritySet.has(company.code))].slice(0, MAX_COMPANIES);

const commonStyle = `
*{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#111c30;font-family:Pretendard,"Noto Sans KR",Arial,sans-serif;letter-spacing:0}a{color:inherit}.top{height:64px;background:#fff;border-bottom:1px solid #dde4ed;display:flex;align-items:center;padding:0 4vw;gap:25px}.brand{font-size:23px;font-weight:900;text-decoration:none}.top nav{display:flex;gap:18px}.top nav a{font-size:14px;font-weight:750;text-decoration:none;color:#46546a}.wrap{width:min(1180px,calc(100% - 34px));margin:0 auto;padding:46px 0 80px}.eyebrow{margin:0 0 9px;color:#3266d5;font-size:13px;font-weight:900}.hero h1{margin:0;font-size:40px;line-height:1.22}.hero p{max-width:820px;color:#5e6c80;font-size:17px;line-height:1.7}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.stat{background:#fff;border:1px solid #dae2ec;border-radius:8px;padding:19px}.stat b{display:block;font-size:27px}.stat span{font-size:13px;color:#718096}.panel{margin-top:24px;background:#fff;border:1px solid #dbe3ed;border-radius:8px;overflow:hidden}.panel h2{margin:0;padding:22px 24px;border-bottom:1px solid #e5eaf0;font-size:21px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:20px}.company{display:block;text-decoration:none;border:1px solid #dce4ee;border-radius:8px;padding:18px;min-height:128px}.company:hover{border-color:#7da1ed}.company strong{font-size:20px}.company small,.muted{color:#718096}.company p{margin:13px 0 0;font-size:14px;line-height:1.55}.table{width:100%;border-collapse:collapse}.table th{background:#172236;color:#fff;font-size:13px;padding:15px;text-align:left}.table td{padding:17px 15px;border-bottom:1px solid #e7ecf2;font-size:14px;vertical-align:top}.table td:first-child{white-space:nowrap}.pill{display:inline-block;padding:5px 9px;border:1px solid #b8c9ee;border-radius:999px;background:#f1f5ff;color:#365da8;font-size:12px;font-weight:800}.dart{color:#3266d5;font-weight:750;text-decoration:none}.summary{line-height:1.55;color:#4b596d}.links{display:flex;flex-wrap:wrap;gap:9px;padding:19px 24px}.links a{padding:9px 12px;border:1px solid #d8e0ea;border-radius:6px;text-decoration:none;font-size:13px;font-weight:750}.foot{margin-top:40px;color:#8792a2;font-size:13px;line-height:1.7}@media(max-width:760px){.top nav{display:none}.wrap{padding-top:30px}.hero h1{font-size:29px}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.table th:nth-child(3),.table td:nth-child(3){display:none}.table td{padding:13px 10px}}
`;
function shell({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="google-adsense-account" content="ca-pub-5230074340613849"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5230074340613849" crossorigin="anonymous"></script><script type="application/ld+json">${JSON.stringify(jsonLd)}</script><style>${commonStyle}</style></head><body><header class="top"><a class="brand" href="/">LEE&amp;NOTE</a><nav><a href="/5percent">5%보고</a><a href="/executives">임원보고</a><a href="/contracts">대형수주</a><a href="/major-events">투자판단</a><a href="/disclosurepedia/">공시피디아</a><a href="/blog/">블로그</a></nav></header>${body}</body></html>`;
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const latestDate = selected.map((c) => c.rows[0]?.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0,10).replaceAll("-","");
const cards = selected.map((company) => {
  const counts = Object.groupBy ? Object.groupBy(company.rows, category) : company.rows.reduce((a,r)=>((a[category(r)] ||= []).push(r),a),{});
  const labels = Object.entries(counts).map(([key,value]) => `${key} ${value.length}건`).join(" · ");
  return `<a class="company" href="/disclosurepedia/${esc(slug(company.code, company.name))}/"><strong>${esc(company.name)}</strong><br><small>${company.code} · ${esc(company.market)}</small><p>${esc(labels)}<br>최근 공시 ${isoDate(company.rows[0]?.date)}</p></a>`;
}).join("");
const hubDescription = `한국 상장사 주요 공시를 종목별로 모은 리앤노트 공시피디아입니다. 5%보고, 임원·주요주주, 대형수주와 투자판단 공시 이력을 확인할 수 있습니다.`;
const hub = shell({ title:"공시피디아 | 종목별 DART 전자공시 아카이브 - 리앤노트", description:hubDescription, canonical:`${BASE}/disclosurepedia/`, jsonLd:{"@context":"https://schema.org","@type":"CollectionPage",name:"리앤노트 공시피디아",url:`${BASE}/disclosurepedia/`,description:hubDescription,dateModified:isoDate(latestDate)}, body:`<main class="wrap"><section class="hero"><p class="eyebrow">LEE&amp;NOTE DISCLOSUREPEDIA</p><h1>종목별 공시를 한곳에 모은 공시피디아</h1><p>관심 종목의 지분 변동, 임원·주요주주 거래, 대형수주와 투자판단 주요경영사항을 시간순으로 연결합니다.</p></section><section class="panel"><h2>공시가 축적된 주요 종목</h2><div class="grid">${cards}</div></section><p class="foot">DART 전자공시를 바탕으로 정리한 정보 제공용 자료이며 투자 권유가 아닙니다.</p></main>` });
fs.writeFileSync(path.join(OUT,"index.html"), hub, "utf8");

const sitemapUrls = [];
for (const company of selected) {
  const pageSlug = slug(company.code, company.name); const dir = path.join(OUT,pageSlug); fs.mkdirSync(dir,{recursive:true});
  const counts = company.rows.reduce((map,row)=>(map.set(category(row),(map.get(category(row))||0)+1),map),new Map());
  const count = (key) => counts.get(key) || 0; const latestRow = company.rows[0];
  const desc = `${company.name}(${company.code})의 DART 공시 ${company.rows.length}건을 정리했습니다. 5%보고 ${count("5%보고")}건, 대형수주 ${count("대형수주")}건, 투자판단 ${count("투자판단")}건과 최근 변동을 확인하세요.`;
  const table = company.rows.slice(0,100).map((row)=>`<tr><td>${isoDate(row.date)}</td><td><span class="pill">${esc(category(row))}</span><br><strong>${esc(compact(row.reportName,70))}</strong></td><td class="summary">${esc(compact(row.summary || row.reporter || "공시 원문에서 세부 내용을 확인하세요.",150))}</td><td>${row.url ? `<a class="dart" href="${esc(row.url)}" rel="nofollow">원문 보기</a>` : "-"}</td></tr>`).join("");
  const canonical = `${BASE}/disclosurepedia/${pageSlug}/`;
  const page = shell({title:`${company.name} 공시 총정리: 지분·임원·수주·투자판단 | 리앤노트`,description:desc,canonical,jsonLd:{"@context":"https://schema.org","@graph":[{"@type":"WebPage",name:`${company.name} 공시 총정리`,url:canonical,description:desc,dateModified:isoDate(latestRow.date)},{"@type":"Organization",name:company.name,identifier:company.code},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"리앤노트",item:`${BASE}/`},{"@type":"ListItem",position:2,name:"공시피디아",item:`${BASE}/disclosurepedia/`},{"@type":"ListItem",position:3,name:company.name,item:canonical}]}]},body:`<main class="wrap"><section class="hero"><p class="eyebrow">공시피디아 · ${company.code} ${esc(company.market)}</p><h1>${esc(company.name)} 공시 총정리</h1><p>${esc(desc)}</p></section><div class="stats"><div class="stat"><b>${company.rows.length}</b><span>전체 수록 공시</span></div><div class="stat"><b>${count("5%보고")}</b><span>5%보고</span></div><div class="stat"><b>${count("대형수주")}</b><span>대형수주</span></div><div class="stat"><b>${count("투자판단")}</b><span>투자판단</span></div></div><section class="panel"><h2>${esc(company.name)} 최근 공시 타임라인</h2><table class="table"><thead><tr><th>접수일</th><th>공시 유형·제목</th><th>주요 내용</th><th>DART</th></tr></thead><tbody>${table}</tbody></table></section><section class="panel"><h2>관련 데이터 더 보기</h2><div class="links"><a href="/5percent?search=${encodeURIComponent(company.name)}">${esc(company.name)} 5%보고</a><a href="/executives?search=${encodeURIComponent(company.name)}">임원·주요주주</a><a href="/contracts?search=${encodeURIComponent(company.name)}">대형수주</a><a href="/major-events?search=${encodeURIComponent(company.name)}">투자판단 공시</a><a href="/blog/">공시 분석 노트</a></div></section><p class="foot">공시 원문을 우선하여 확인하세요. 본 페이지는 정보 제공 목적이며 특정 종목의 매수·매도 추천이 아닙니다.</p></main>`});
  fs.writeFileSync(path.join(dir,"index.html"),page,"utf8"); sitemapUrls.push({loc:canonical,lastmod:isoDate(latestRow.date)});
}

const sitemapPath = path.join(SITE,"sitemap.xml");
let sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath,"utf8") : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/leeandnote\.com\/disclosurepedia\/[^<]*<\/loc>[\s\S]*?<\/url>/g, "");
const additions = [{loc:`${BASE}/disclosurepedia/`,lastmod:isoDate(latestDate)},...sitemapUrls].map(({loc,lastmod})=>`  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${loc.endsWith("/disclosurepedia/") ? "0.8" : "0.7"}</priority>\n  </url>`).join("\n");
sitemap = sitemap.replace("</urlset>",`${additions}\n</urlset>`); fs.writeFileSync(sitemapPath,sitemap,"utf8");
console.log(JSON.stringify({companies:selected.length,pages:selected.length+1,latestDate},null,2));
