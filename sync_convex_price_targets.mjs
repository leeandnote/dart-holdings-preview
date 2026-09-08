import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.dirname(fileURLToPath(import.meta.url));
const targetsPath = path.join(root, "site", "data", "convex_price_targets.json");
const shareholdersPath = path.join(root, "site", "data", "shareholders.js");
const disclosureSignalsPath = path.join(root, "site", "data", "disclosure_signals.json");
const convexUrl = "https://gregarious-lemming-92.convex.cloud";
const days = Number(process.argv.includes("--days") ? process.argv[process.argv.indexOf("--days") + 1] : 30);

function kstYmd(offsetDays = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

function normalizeCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const code = digits.padStart(6, "0");
  return /^\d{6}$/.test(code) ? code : "";
}

function normalizeMarket(value) {
  const market = String(value ?? "").toUpperCase();
  if (market.includes("KOSDAQ") || market === "KQ") return "KOSDAQ";
  if (market.includes("KOSPI") || market === "KS") return "KOSPI";
  return "";
}

function normalizeDate(value) {
  const raw = String(value ?? "").replace(/\D/g, "");
  return raw.length >= 8 ? raw.slice(0, 8) : "";
}

async function convexQuery(pathName, args) {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: pathName, args, format: "json" }),
  });
  const json = await res.json();
  if (json.status !== "success") throw new Error(`${pathName}: ${JSON.stringify(json)}`);
  return Array.isArray(json.value) ? json.value : [];
}

function readExisting() {
  if (!fs.existsSync(targetsPath)) return [];
  const raw = JSON.parse(fs.readFileSync(targetsPath, "utf8").replace(/^\uFEFF/, ""));
  return Array.isArray(raw) ? raw : raw.rows || raw.items || [];
}

function readStaticExecutiveTargets() {
  if (!fs.existsSync(shareholdersPath)) return [];
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(shareholdersPath, "utf8"), context, { filename: shareholdersPath });
  const entries = Object.values(context.window.__REGULAR_SHAREHOLDERS__ || {}).filter(Boolean);
  return entries.map((entry) => ({
    corpName: entry.corpName || entry.name || "",
    market: normalizeMarket(entry.market || entry.marketType || entry["시장"]),
    stockCode: normalizeCode(entry.stockCode || entry.code || entry["종목코드"]),
    reportDate: normalizeDate(entry.reportDate || entry.settlementDate || entry["접수일"]) || kstYmd(),
    sourceKind: "executive-static",
  })).filter((row) => row.stockCode);
}


function readContractTargets() {
  if (!fs.existsSync(disclosureSignalsPath)) return [];
  const data = JSON.parse(fs.readFileSync(disclosureSignalsPath, "utf8").replace(/^\uFEFF/, ""));
  return (data.rows || []).filter((row) => row["공시유형"] === "단일판매·공급계약").map((row) => ({
    corpName: row["종목명"] || "",
    market: normalizeMarket(row["시장"]),
    stockCode: normalizeCode(row["종목코드"]),
    reportDate: normalizeDate(row["접수일"]) || kstYmd(),
    sourceKind: "contract",
  })).filter((row) => row.stockCode);
}
function toTarget(row, sourceKind) {
  const stockCode = normalizeCode(row.stockCode || row.code || row.stock_code || row["종목코드"]);
  const market = normalizeMarket(row.market || row.marketType || row["시장"]);
  const corpName = String(row.corpName || row.stockName || row.corp_name || row.name || row["종목명"] || "").trim();
  if (!stockCode) return null;
  return {
    corpName,
    market,
    stockCode,
    reportDate: normalizeDate(row.reportDate || row.rceptDt || row.receiptDate || row["접수일"]) || kstYmd(),
    sourceKind,
  };
}

function mergeTargets(existing, incoming) {
  const map = new Map();
  for (const row of existing) {
    const stockCode = normalizeCode(row.stockCode || row.code || row["종목코드"]);
    const market = normalizeMarket(row.market || row["시장"]);
    if (!stockCode) continue;
    map.set(stockCode, {
      corpName: row.corpName || row.name || row["종목명"] || "",
      market,
      reportDate: normalizeDate(row.reportDate || row["접수일"]) || "",
      stockCode,
      sourceKinds: Array.isArray(row.sourceKinds) ? row.sourceKinds : row.sourceKind ? [row.sourceKind] : ["existing"],
    });
  }
  let added = 0;
  for (const row of incoming) {
    const prev = map.get(row.stockCode);
    if (!prev) {
      map.set(row.stockCode, { ...row, sourceKinds: [row.sourceKind] });
      added += 1;
      continue;
    }
    prev.corpName = prev.corpName || row.corpName;
    prev.market = prev.market || row.market;
    prev.reportDate = [prev.reportDate, row.reportDate].filter(Boolean).sort().at(-1) || "";
    prev.sourceKinds = [...new Set([...(prev.sourceKinds || []), row.sourceKind])];
  }
  return { rows: [...map.values()].sort((a, b) => a.stockCode.localeCompare(b.stockCode)), added };
}

const bgnDe = kstYmd(-days);
const endDe = kstYmd(0);
const [holdings, executives] = await Promise.all([
  convexQuery("dart:listDailyReportItemsRange", { bgnDe, endDe, limit: 5000 }),
  convexQuery("dart:listExecutiveDailyReportItemsRange", { bgnDe, endDe, limit: 5000 }),
]);

const incoming = [
  ...holdings.map((row) => toTarget(row, "5percent")),
  ...executives.map((row) => toTarget(row, "executive")),
  ...readStaticExecutiveTargets(),
  ...readContractTargets(),
].filter(Boolean);

const { rows, added } = mergeTargets(readExisting(), incoming);
fs.writeFileSync(targetsPath, JSON.stringify(rows, null, 2), "utf8");
console.log(`SYNC_CONVEX_PRICE_TARGETS days=${days} incoming=${incoming.length} total=${rows.length} added=${added}`);
const missingCodes = ["306040", "367000"].filter((code) => rows.some((row) => row.stockCode === code));
console.log(`CHECK_CODES_PRESENT=${missingCodes.join(",")}`);




