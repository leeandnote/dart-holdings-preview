import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const siteDataDir = path.join(root, "site", "data");
const reportDir = path.join(root, "site", "reports");
const convexUrl = "https://gregarious-lemming-92.convex.cloud";
fs.mkdirSync(reportDir, { recursive: true });

function loadWindowScript(file, globals = {}) {
  const context = { window: {}, console, ...globals };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.window;
}

function loadDataFile(name, variable) {
  const file = path.join(siteDataDir, name);
  if (!fs.existsSync(file)) return null;
  return loadWindowScript(file)[variable] ?? null;
}

function normalizeCode(code) {
  const text = String(code ?? "").trim();
  return /^\d{6}$/.test(text) ? text : "";
}

function normalizeDate(value) {
  const raw = String(value ?? "").replace(/[^0-9]/g, "");
  if (raw.length >= 8) return raw.slice(0, 8);
  return "";
}

function displayDate(value) {
  const d = normalizeDate(value);
  return d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "N/A";
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sample(items, limit = 12) {
  return items.slice(0, limit);
}

function maxDate(values) {
  return values.map(normalizeDate).filter(Boolean).sort().at(-1) ?? "";
}

function loadPriceChunks(codes) {
  const priceDir = path.join(siteDataDir, "prices");
  const result = new Map();
  for (const code of codes) {
    const file = path.join(priceDir, `${code}.js`);
    if (!fs.existsSync(file)) {
      result.set(code, { exists: false, rows: [] });
      continue;
    }
    const context = { window: { __PRICE_CHUNKS__: {} }, console };
    vm.createContext(context);
    try {
      vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
      const rows = context.window.__PRICE_CHUNKS__?.[code] ?? [];
      result.set(code, { exists: true, rows: Array.isArray(rows) ? rows : [] });
    } catch (error) {
      result.set(code, { exists: true, rows: [], error: error.message });
    }
  }
  return result;
}

function addIssue(issues, level, title, detail, examples = []) {
  issues.push({ level, title, detail, examples: sample(examples) });
}

async function convexQuery(pathName, args) {
  const response = await fetch(convexUrl + "/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: pathName, args, format: "json" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || pathName);
  return Array.isArray(payload.value) ? payload.value : [];
}

async function convexAction(pathName, args) {
  const response = await fetch(convexUrl + "/api/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: pathName, args, format: "json" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || pathName);
  return payload.value;
}

function offsetYmd(ymd, offsetDays) {
  const d = normalizeDate(ymd);
  if (!d) return "";
  const date = new Date(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T12:00:00+09:00");
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

async function getLiveRecentReceiptDate5(todayKst) {
  try {
    const bgn = offsetYmd(todayKst, -14);
    const rows = await convexQuery("dart:listDailyReportItemsRange", { bgnDe: bgn, endDe: todayKst, limit: 5000 });
    return maxDate(rows.map((row) => row.reportDate || row.receiptDate));
  } catch {
    return "";
  }
}

function recentBusinessDates(ymd, count) {
  const dates = [];
  let cursor = normalizeDate(ymd);
  while (cursor && dates.length < count) {
    const date = new Date(`${cursor.slice(0, 4)}-${cursor.slice(4, 6)}-${cursor.slice(6, 8)}T12:00:00+09:00`);
    const day = date.getDay();
    if (day !== 0 && day !== 6) dates.push(cursor);
    date.setDate(date.getDate() - 1);
    cursor = date.toISOString().slice(0, 10).replace(/-/g, "");
  }
  return dates;
}

async function getDartMajorDbGaps(todayKst) {
  const gaps = [];
  const checks = [];
  for (const reportDate of recentBusinessDates(todayKst, 5)) {
    const [source, dbRows] = await Promise.all([
      convexAction("dart:debugDartList", { reportDate }),
      convexQuery("dart:listDailyReportItems", { reportDate, limit: 500 }),
    ]);
    const sourceRows = Array.isArray(source?.allMatches)
      ? source.allMatches.filter((row) => String(row.reportName ?? "").includes("주식등의대량보유상황보고서"))
      : [];
    const sourceCount = sourceRows.length;
    const dbCount = dbRows.length;
    checks.push({ reportDate, sourceCount, dbCount });
    if (sourceCount > 0 && dbCount === 0) gaps.push({ reportDate, sourceCount, dbCount, level: "error" });
    else if (sourceCount > dbCount) gaps.push({ reportDate, sourceCount, dbCount, level: "warn" });
  }
  return { checks, gaps };
}

const dart = loadDataFile("latest.js", "__DART_DATA__") ?? { rows: [] };
const rows5 = Array.isArray(dart.rows) ? dart.rows : [];
const shareholders = loadDataFile("shareholders.js", "__REGULAR_SHAREHOLDERS__") ?? {};
const eventPrices = loadDataFile("event_prices.js", "__EVENT_PRICES__") ?? {};
const currentPrices = loadDataFile("current_prices.js", "__CURRENT_PRICES__") ?? {};
const disclosureSignals = loadDataFile("disclosure_signals.js", "__DISCLOSURE_SIGNALS__") ?? { rows: [] };
const todayKst = todayYmdKst();
const expectedTradeYmd = latestBusinessYmd(todayKst);
const siteGeneratedYmd = normalizeDate(dart.generatedAt);
const siteAgeDays = daysBetweenYmd(siteGeneratedYmd, todayKst);
const currentPriceDates = Object.values(currentPrices).map((p) => normalizeDate(p?.date)).filter(Boolean);
const maxCurrentPriceDate = currentPriceDates.sort().at(-1) ?? "";
const currentPriceAgeDays = daysBetweenYmd(maxCurrentPriceDate, expectedTradeYmd);

const recentReceiptDate5 = maxDate(rows5.map((r) => r["접수일"]));
const recentRows5 = rows5.filter((r) => normalizeDate(r["접수일"]) === recentReceiptDate5);
const codes5 = [...new Set(recentRows5.map((r) => normalizeCode(r["종목코드"])).filter(Boolean))];

const executiveEntries = Object.values(shareholders).filter(Boolean);
const executiveCodes = [...new Set(executiveEntries.map((e) => normalizeCode(e.stockCode)).filter(Boolean))];
const allTargetCodes = [...new Set([...codes5, ...executiveCodes])].sort();
const priceChunks = loadPriceChunks(allTargetCodes);

const liveRecentReceiptDate5 = await getLiveRecentReceiptDate5(todayKst);
const dartMajorDbGapReport = await getDartMajorDbGaps(todayKst).catch((error) => ({ checks: [], gaps: [{ reportDate: todayKst, sourceCount: 0, dbCount: 0, level: "warn", error: error.message }] }));
const issues = [];
if (liveRecentReceiptDate5 && recentReceiptDate5 !== liveRecentReceiptDate5) addIssue(issues, "error", "5%보고 정적 백업 미동기화", `Convex 최신 접수일은 ${displayDate(liveRecentReceiptDate5)}이나 정적 백업 최신 접수일은 ${displayDate(recentReceiptDate5)}입니다.`);
const contractRows = (Array.isArray(disclosureSignals.rows) ? disclosureSignals.rows : []).filter((row) => row["공시유형"] === "단일판매·공급계약");
const recentContractDate = maxDate(contractRows.map((row) => row["접수일"]));
const recentContracts = contractRows.filter((row) => normalizeDate(row["접수일"]) === recentContractDate);
const invalidContracts = recentContracts.filter((row) => !isFiniteNumber(row["계약금액"]) || row["계약금액"] <= 0 || !isFiniteNumber(row["매출대비비율"]) || row["매출대비비율"] < 0);
const parseFailures = Number(disclosureSignals.parseFailures || 0);
const excludedIncompleteContracts = Number(disclosureSignals.excludedIncompleteContracts || 0);
const parseSuccesses = Number(disclosureSignals.parseSuccesses ?? (Number(disclosureSignals.parsedDocuments || 0) - parseFailures));
if (Number(disclosureSignals.totalCandidates || 0) > 0 && parseSuccesses <= 0) addIssue(issues, "error", "대형수주 원문 파싱 전부 실패", `${disclosureSignals.totalCandidates}개 후보가 있으나 원문 파싱 성공 건수가 0입니다. 불완전한 계약 데이터의 배포를 중단합니다.`);
if (recentContracts.length && invalidContracts.length) addIssue(issues, "error", "최신 대형수주 핵심 데이터 누락", `${displayDate(recentContractDate)} 계약 ${recentContracts.length}건 중 ${invalidContracts.length}건에서 계약금액 또는 매출대비비율이 누락되었습니다.`, invalidContracts.map((row) => `${row["종목명"]} ${row["접수번호"] || ""}`));
if (excludedIncompleteContracts > 0) addIssue(issues, "warn", "검증 불완전 계약 제외", `${excludedIncompleteContracts}건의 계약 정정 공시는 계약금액 또는 매출대비비율을 확정하지 못해 사이트와 소셜 카드에서 제외했습니다.`);
function daysBetweenYmd(a, b) {
  const aa = normalizeDate(a);
  const bb = normalizeDate(b);
  if (!aa || !bb) return null;
  const da = new Date(`${aa.slice(0,4)}-${aa.slice(4,6)}-${aa.slice(6,8)}T00:00:00Z`);
  const db = new Date(`${bb.slice(0,4)}-${bb.slice(4,6)}-${bb.slice(6,8)}T00:00:00Z`);
  return Math.round((db - da) / 86400000);
}

function todayYmdKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

function latestBusinessYmd(ymd) {
  const d = normalizeDate(ymd);
  if (!d) return "";
  const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00+09:00`);
  const day = date.getDay();
  const offset = day === 0 ? -2 : day === 6 ? -1 : 0;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

if (!liveRecentReceiptDate5 && siteAgeDays !== null && siteAgeDays >= 2) addIssue(issues, "warn", "정적 사이트 데이터 최신성 확인 필요", `site/data/latest.js 생성일이 ${displayDate(siteGeneratedYmd)}로 현재 KST ${displayDate(todayKst)} 기준 ${siteAgeDays}일 전입니다. Convex 실시간 DB도 확인되지 않아 fallback 데이터 갱신이 필요합니다.`, [`siteDataGeneratedAt=${dart.generatedAt ?? "N/A"}`]);
if (currentPriceAgeDays !== null && currentPriceAgeDays >= 2) addIssue(issues, "warn", "현재가 데이터 최신성 확인 필요", `current_prices.js의 최신 기준일이 ${displayDate(maxCurrentPriceDate)}로 예상 최신 거래일 ${displayDate(expectedTradeYmd)} 기준 ${currentPriceAgeDays}거래일 전입니다.`, [`maxCurrentPriceDate=${displayDate(maxCurrentPriceDate)}`]);
for (const gap of dartMajorDbGapReport.gaps) {
  const level = gap.level === "error" ? "error" : "warn";
  addIssue(issues, level, "5%보고 운영 DB 누락 가능", `DART 원문 목록에는 ${displayDate(gap.reportDate)} 5%보고가 ${gap.sourceCount}건 있으나 운영 DB에는 ${gap.dbCount}건만 있습니다. 수집/업서트/스키마 오류를 확인해야 합니다.`, [`reportDate=${displayDate(gap.reportDate)}`, `source=${gap.sourceCount}`, `db=${gap.dbCount}`, gap.error ? `error=${gap.error}` : ""]);
}
const missingChunk = allTargetCodes.filter((code) => !priceChunks.get(code)?.exists);
const emptyChunk = allTargetCodes.filter((code) => priceChunks.get(code)?.exists && (priceChunks.get(code)?.rows?.length ?? 0) === 0);
const shortChunk = allTargetCodes.filter((code) => {
  const info = priceChunks.get(code);
  return info?.exists && (info.rows?.length ?? 0) > 0 && info.rows.length < 20;
});
const staleChunk = allTargetCodes.filter((code) => {
  const rows = priceChunks.get(code)?.rows ?? [];
  const last = rows.at(-1)?.date ?? "";
  return last && normalizeDate(last) < "20260814";
});

if (missingChunk.length) addIssue(issues, "error", "가격 추이 파일 누락", `${missingChunk.length}개 종목의 site/data/prices/{code}.js 파일이 없습니다.`, missingChunk);
if (emptyChunk.length) addIssue(issues, "error", "가격 추이 데이터 비어 있음", `${emptyChunk.length}개 종목의 가격 파일은 있으나 차트 데이터가 비어 있습니다.`, emptyChunk);
if (shortChunk.length) addIssue(issues, "warn", "가격 추이 데이터 길이 짧음", `${shortChunk.length}개 종목의 가격 데이터가 20거래일 미만입니다. 신규상장/거래정지 여부 확인이 필요합니다.`, shortChunk);
if (staleChunk.length) addIssue(issues, "warn", "가격 추이 최신성 낮음", `${staleChunk.length}개 종목의 마지막 가격일이 2026-08-14 이전입니다.`, staleChunk);

const missingCurrent5 = recentRows5.filter((r) => !currentPrices[normalizeCode(r["종목코드"])]);
const missingEvent5 = recentRows5.filter((r) => !isFiniteNumber(r["보고의무발생일종가"]) && !eventPrices[`${normalizeCode(r["종목코드"])}_${normalizeDate(r["보고의무발생일"])}`]);
const missingRatio5 = recentRows5.filter((r) => !isFiniteNumber(r["직전지분율"]) || !isFiniteNumber(r["이번지분율"]));
const badDate5 = recentRows5.filter((r) => !normalizeDate(r["보고의무발생일"]) || !normalizeDate(r["접수일"]));

if (missingCurrent5.length) addIssue(issues, "warn", "5%보고 최근일 종가 누락", `${missingCurrent5.length}건에서 current_prices 매칭이 없습니다.`, missingCurrent5.map((r) => `${r["종목명"]} ${normalizeCode(r["종목코드"])}`));
if (missingEvent5.length) addIssue(issues, "warn", "5%보고 보고의무발생일 종가 누락", `${missingEvent5.length}건에서 event_prices 매칭이 없습니다.`, missingEvent5.map((r) => `${r["종목명"]} ${normalizeCode(r["종목코드"])} ${displayDate(r["보고의무발생일"])}`));
if (missingRatio5.length) addIssue(issues, "error", "5%보고 직전/이번 지분율 누락", `${missingRatio5.length}건에서 직전지분율 또는 이번지분율이 숫자가 아닙니다.`, missingRatio5.map((r) => `${r["종목명"]} ${normalizeCode(r["종목코드"])} ${r["접수번호"] ?? ""}`));
if (badDate5.length) addIssue(issues, "error", "5%보고 날짜 파싱 실패", `${badDate5.length}건에서 보고의무발생일 또는 접수일을 파싱하지 못했습니다.`, badDate5.map((r) => `${r["종목명"]} ${normalizeCode(r["종목코드"])} obligation=${r["보고의무발생일"]} receipt=${r["접수일"]}`));

const receiptGroups = new Map();
for (const r of recentRows5) {
  const key = r["접수번호"] || `${normalizeCode(r["종목코드"])}_${r["종목명"]}_${normalizeDate(r["보고의무발생일"])}`;
  receiptGroups.set(key, (receiptGroups.get(key) ?? 0) + 1);
}
const duplicateReceipts = [...receiptGroups.entries()].filter(([, count]) => count > 1);
if (duplicateReceipts.length) addIssue(issues, "warn", "5%보고 접수번호 중복 행", `${duplicateReceipts.length}개 접수번호/키가 최근 접수일 데이터에서 중복됩니다. 같은 공시 내 다중 행인지 확인하세요.`, duplicateReceipts.map(([k, c]) => `${k}: ${c}`));

const executiveMissingCurrent = executiveEntries.filter((e) => normalizeCode(e.stockCode) && !currentPrices[normalizeCode(e.stockCode)]);
const executiveMissingChunk = executiveCodes.filter((code) => !priceChunks.get(code)?.exists || (priceChunks.get(code)?.rows?.length ?? 0) === 0);
const executiveRows = executiveEntries.flatMap((e) => (Array.isArray(e.rows) ? e.rows.map((row) => ({ entry: e, row })) : []));
const executiveMissingRatio = executiveRows.filter(({ row }) => !isFiniteNumber(row.basisRatio) || !isFiniteNumber(row.ratio));

if (executiveMissingCurrent.length) addIssue(issues, "warn", "임원보고 최근일 종가 누락", `${executiveMissingCurrent.length}개 임원보고 종목에서 current_prices 매칭이 없습니다.`, executiveMissingCurrent.map((e) => `${e.corpName} ${normalizeCode(e.stockCode)}`));
if (executiveMissingChunk.length) addIssue(issues, "warn", "임원보고 1년 추이 차트 누락 가능", `${executiveMissingChunk.length}개 임원보고 종목의 가격 추이 파일이 없거나 비어 있습니다.`, executiveMissingChunk);
if (executiveMissingRatio.length) addIssue(issues, "warn", "임원보고 직전/이번 비율 누락 가능", `${executiveMissingRatio.length}개 임원보고 상세 행에서 basisRatio 또는 ratio가 숫자가 아닙니다.`, executiveMissingRatio.map(({ entry, row }) => `${entry.corpName} ${normalizeCode(entry.stockCode)} ${row.name ?? ""}`));

const summary = {
  generatedAt: new Date().toISOString(),
  siteDataGeneratedAt: dart.generatedAt ?? null,
  recentReceiptDate5: displayDate(recentReceiptDate5),
  liveDbRecentReceiptDate5: displayDate(liveRecentReceiptDate5),
  dartMajorDbChecks: dartMajorDbGapReport.checks.map((row) => ({ ...row, reportDate: displayDate(row.reportDate) })),
  counts: {
    rows5Total: rows5.length,
    rows5RecentReceiptDate: recentRows5.length,
    codes5RecentReceiptDate: codes5.length,
    executiveCompanies: executiveEntries.length,
    executiveRows: executiveRows.length,
    targetCodesChecked: allTargetCodes.length,
    maxCurrentPriceDate: displayDate(maxCurrentPriceDate),
    siteAgeDays,
    currentPriceAgeDays,
    issues: issues.length,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warn").length,
    contractsLatest: recentContracts.length,
    contractsInvalid: invalidContracts.length,
    contractParseFailures: parseFailures,
    excludedIncompleteContracts,
  },
  issues,
};

const jsonPath = path.join(reportDir, "site_health_report.json");
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

const lines = [];
lines.push("# LEE&NOTE Site Health Report");
lines.push("");
lines.push(`- generatedAt: ${summary.generatedAt}`);
lines.push(`- siteDataGeneratedAt: ${summary.siteDataGeneratedAt ?? "N/A"}`);
lines.push(`- 5% recent receipt date: ${summary.recentReceiptDate5}`);
lines.push(`- 5% live DB recent receipt date: ${summary.liveDbRecentReceiptDate5}`);
lines.push(`- checked codes: ${summary.counts.targetCodesChecked}`);
lines.push(`- issues: ${summary.counts.issues} (errors ${summary.counts.errors}, warnings ${summary.counts.warnings})`);
lines.push("");
if (!issues.length) {
  lines.push("No blocking data-quality issues found in the static site data.");
} else {
  for (const issue of issues) {
    lines.push(`## [${issue.level.toUpperCase()}] ${issue.title}`);
    lines.push(issue.detail);
    if (issue.examples?.length) {
      lines.push("");
      for (const ex of issue.examples) lines.push(`- ${ex}`);
    }
    lines.push("");
  }
}
fs.writeFileSync(path.join(reportDir, "site_health_report.md"), lines.join("\n"), "utf8");

console.log(`SITE_HEALTH issues=${summary.counts.issues} errors=${summary.counts.errors} warnings=${summary.counts.warnings}`);
console.log(jsonPath);






