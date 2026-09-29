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
body[data-page-kind="disclosurepedia"] main{padding-top:14px}.pediaHero{padding:4px 0 12px}.pediaHero .eyebrow{margin-bottom:5px}.pediaHero h1{font-size:24px;line-height:1.25}.pediaHero p{margin-top:5px;color:var(--muted);font-size:13px;line-height:1.55}.pediaStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:4px 0 14px}.pediaStat{padding:13px 15px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 5px 14px rgba(15,23,42,.035)}.pediaStat b{display:block;color:var(--ink);font-size:21px}.pediaStat span{color:var(--muted);font-size:11px;font-weight:700}.pediaPanel{margin:0 0 14px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 10px 24px rgba(15,23,42,.05);overflow:hidden}.pediaPanel>h2{padding:15px 17px;border-top:3px solid var(--orange);border-bottom:1px solid #e8ecf2;font-size:17px}.pediaGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px}.pediaCompany{display:block;min-height:104px;padding:13px;border:1px solid #e0e6ee;border-radius:8px;background:#fff;text-decoration:none}.pediaCompany:hover{border-color:#ff9d79;background:#fffaf7}.pediaCompany strong{color:var(--ink);font-size:16px}.pediaCompany small{color:#718096;font-size:11px;font-weight:700}.pediaCompany p{margin:9px 0 0;color:#566276;font-size:12px;line-height:1.5}.pediaTable{width:100%;border-collapse:collapse;table-layout:fixed}.pediaTable th{height:44px;padding:8px 12px;background:#1e2530;color:#fff;font-size:12px;text-align:left}.pediaTable td{height:58px;padding:9px 12px;border-bottom:1px solid #e7ecf2;font-size:12px;vertical-align:middle}.pediaTable td:first-child{width:112px;white-space:nowrap}.pediaTable td:last-child{width:90px}.pediaPill{display:inline-flex;margin-right:6px;padding:3px 7px;border:1px solid #ffb899;border-radius:999px;background:#fffaf7;color:#273142;font-size:10px;font-weight:800}.pediaDart{color:#7b8493;font-size:11px;font-weight:700;text-decoration:none}.pediaDart:hover{color:var(--orange)}.pediaSummary{overflow:hidden;color:#596579;line-height:1.45;text-overflow:ellipsis}.pediaLinks{display:flex;flex-wrap:wrap;gap:8px;padding:14px 17px}.pediaLinks a{padding:8px 11px;border:1px solid #dce3ec;border-radius:7px;background:#fbfcfe;font-size:12px;font-weight:800;text-decoration:none}.pediaFoot{margin:18px 2px 0;color:#8792a2;font-size:11px;line-height:1.6}@media(max-width:1100px){.pediaGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.pediaGrid{grid-template-columns:1fr}.pediaStats{grid-template-columns:repeat(2,1fr)}.pediaTable th:nth-child(3),.pediaTable td:nth-child(3){display:none}.pediaTable td{padding:9px 8px}.pediaHero h1{font-size:22px}}
`;
function shell({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="google-adsense-account" content="ca-pub-5230074340613849"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><link rel="icon" href="/assets/favicon.ico" sizes="any"><link rel="stylesheet" href="/styles.css?v=20260929-pedia1"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5230074340613849" crossorigin="anonymous"></script><script type="application/ld+json">${JSON.stringify(jsonLd)}</script><style>${commonStyle}</style></head><body data-page-kind="disclosurepedia"><header class="topbar"><a class="brandHome" href="/" aria-label="리앤노트 홈"><img class="brandMark" src="/assets/leeandnote-mark.png" alt=""><img class="brandLogo" src="/assets/leeandnote-logo.png" alt="LEE&amp;NOTE"></a><nav class="siteNav" aria-label="주요 카테고리"><a class="navLink" href="/5percent"><span class="navIcon disclosureIcon"></span>5%</a><a class="navLink" href="/executives"><span class="navIcon disclosureIcon"></span>임원·주요주주</a><a class="navLink" href="/contracts"><span class="navIcon disclosureIcon"></span>대형수주</a><a class="navLink" href="/major-events"><span class="navIcon disclosureIcon"></span>투자판단</a><a class="navLink active" href="/disclosurepedia/"><span class="navIcon disclosureIcon"></span>공시피디아</a><a class="navLink" href="/blog/"><span class="navIcon disclosureIcon"></span>블로그</a></nav></header>${body}</body></html>`;
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const latestDate = selected.map((c) => c.rows[0]?.date).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0,10).replaceAll("-","");
const cards = selected.map((company) => {
  const counts = Object.groupBy ? Object.groupBy(company.rows, category) : company.rows.reduce((a,r)=>((a[category(r)] ||= []).push(r),a),{});
  const labels = Object.entries(counts).map(([key,value]) => `${key} ${value.length}건`).join(" · ");
  return `<a class="pediaCompany" href="/disclosurepedia/${esc(slug(company.code, company.name))}/"><strong>${esc(company.name)}</strong><br><small>${company.code} · ${esc(company.market)}</small><p>${esc(labels)}<br>최근 공시 ${isoDate(company.rows[0]?.date)}</p></a>`;
}).join("");
const hubDescription = `한국 상장사 주요 공시를 종목별로 모은 리앤노트 공시피디아입니다. 5%보고, 임원·주요주주, 대형수주와 투자판단 공시 이력을 확인할 수 있습니다.`;
const hub = shell({ title:"공시피디아 | 종목별 DART 전자공시 아카이브 - 리앤노트", description:hubDescription, canonical:`${BASE}/disclosurepedia/`, jsonLd:{"@context":"https://schema.org","@type":"CollectionPage",name:"리앤노트 공시피디아",url:`${BASE}/disclosurepedia/`,description:hubDescription,dateModified:isoDate(latestDate)}, body:`<main><section class="pediaHero"><p class="eyebrow">한국주식 DART전자공시 데이터베이스</p><h1>종목별 공시피디아</h1><p>관심 종목의 지분 변동, 임원·주요주주 거래, 대형수주와 투자판단 주요경영사항을 시간순으로 연결합니다.</p></section><section class="pediaPanel"><h2>공시가 축적된 주요 종목</h2><div class="pediaGrid">${cards}</div></section><p class="pediaFoot">DART 전자공시를 바탕으로 정리한 정보 제공용 자료이며 투자 권유가 아닙니다.</p></main>` });
fs.writeFileSync(path.join(OUT,"index.html"), hub, "utf8");

const sitemapUrls = [];
for (const company of selected) {
  const pageSlug = slug(company.code, company.name); const dir = path.join(OUT,pageSlug); fs.mkdirSync(dir,{recursive:true});
  const counts = company.rows.reduce((map,row)=>(map.set(category(row),(map.get(category(row))||0)+1),map),new Map());
  const count = (key) => counts.get(key) || 0; const latestRow = company.rows[0];
  const desc = `${company.name}(${company.code})의 DART 공시 ${company.rows.length}건을 정리했습니다. 5%보고 ${count("5%보고")}건, 대형수주 ${count("대형수주")}건, 투자판단 ${count("투자판단")}건과 최근 변동을 확인하세요.`;
  const table = company.rows.slice(0,100).map((row)=>`<tr><td>${isoDate(row.date)}</td><td><span class="pediaPill">${esc(category(row))}</span><strong>${esc(compact(row.reportName,70))}</strong></td><td class="pediaSummary">${esc(compact(row.summary || row.reporter || "공시 원문에서 세부 내용을 확인하세요.",150))}</td><td>${row.url ? `<a class="pediaDart" href="${esc(row.url)}" rel="nofollow">원문 보기</a>` : "-"}</td></tr>`).join("");
  const canonical = `${BASE}/disclosurepedia/${pageSlug}/`;
  const page = shell({title:`${company.name} 공시 총정리: 지분·임원·수주·투자판단 | 리앤노트`,description:desc,canonical,jsonLd:{"@context":"https://schema.org","@graph":[{"@type":"WebPage",name:`${company.name} 공시 총정리`,url:canonical,description:desc,dateModified:isoDate(latestRow.date)},{"@type":"Organization",name:company.name,identifier:company.code},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:"리앤노트",item:`${BASE}/`},{"@type":"ListItem",position:2,name:"공시피디아",item:`${BASE}/disclosurepedia/`},{"@type":"ListItem",position:3,name:company.name,item:canonical}]}]},body:`<main><section class="pediaHero"><p class="eyebrow">한국주식 DART전자공시 데이터베이스 · ${company.code} ${esc(company.market)}</p><h1>${esc(company.name)} 공시 총정리</h1><p>${esc(desc)}</p></section><div class="pediaStats"><div class="pediaStat"><b>${company.rows.length}</b><span>전체 수록 공시</span></div><div class="pediaStat"><b>${count("5%보고")}</b><span>5%보고</span></div><div class="pediaStat"><b>${count("대형수주")}</b><span>대형수주</span></div><div class="pediaStat"><b>${count("투자판단")}</b><span>투자판단</span></div></div><section class="pediaPanel"><h2>${esc(company.name)} 최근 공시 타임라인</h2><table class="pediaTable"><thead><tr><th>접수일</th><th>공시 유형·제목</th><th>주요 내용</th><th>DART</th></tr></thead><tbody>${table}</tbody></table></section><section class="pediaPanel"><h2>관련 데이터 더 보기</h2><div class="pediaLinks"><a href="/5percent?search=${encodeURIComponent(company.name)}">${esc(company.name)} 5%보고</a><a href="/executives?search=${encodeURIComponent(company.name)}">임원·주요주주</a><a href="/contracts?search=${encodeURIComponent(company.name)}">대형수주</a><a href="/major-events?search=${encodeURIComponent(company.name)}">투자판단 공시</a><a href="/blog/">공시 분석 노트</a></div></section><p class="pediaFoot">공시 원문을 우선하여 확인하세요. 본 페이지는 정보 제공 목적이며 특정 종목의 매수·매도 추천이 아닙니다.</p></main>`});
  fs.writeFileSync(path.join(dir,"index.html"),page,"utf8"); sitemapUrls.push({loc:canonical,lastmod:isoDate(latestRow.date)});
}

const sitemapPath = path.join(SITE,"sitemap.xml");
let sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath,"utf8") : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/leeandnote\.com\/disclosurepedia\/[^<]*<\/loc>[\s\S]*?<\/url>/g, "");
const additions = [{loc:`${BASE}/disclosurepedia/`,lastmod:isoDate(latestDate)},...sitemapUrls].map(({loc,lastmod})=>`  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${loc.endsWith("/disclosurepedia/") ? "0.8" : "0.7"}</priority>\n  </url>`).join("\n");
sitemap = sitemap.replace("</urlset>",`${additions}\n</urlset>`); fs.writeFileSync(sitemapPath,sitemap,"utf8");
console.log(JSON.stringify({companies:selected.length,pages:selected.length+1,latestDate},null,2));
