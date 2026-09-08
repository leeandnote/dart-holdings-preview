import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const reportDir = path.join(root, "site", "reports");
const priceDir = path.join(root, "site", "data", "prices");
const convexUrl = "https://gregarious-lemming-92.convex.cloud";
const days = Number(process.argv.includes("--days") ? process.argv[process.argv.indexOf("--days") + 1] : 30);
fs.mkdirSync(reportDir, { recursive: true });

function kstYmd(offsetDays = 0) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
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
  if (market.includes("KONEX")) return "KONEX";
  return "";
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

function readPriceChunk(code) {
  const file = path.join(priceDir, `${code}.js`);
  if (!fs.existsSync(file)) return { exists: false, rows: [] };
  const context = { window: { __PRICE_CHUNKS__: {} }, console };
  vm.createContext(context);
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    const rows = context.window.__PRICE_CHUNKS__?.[code] || [];
    return { exists: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { exists: true, rows: [], error: error.message };
  }
}

function classifyPrice(code) {
  const info = readPriceChunk(code);
  const closes = info.rows.map((row) => row.close).filter(Number.isFinite);
  const uniq = new Set(closes);
  return {
    exists: info.exists,
    rows: info.rows.length,
    uniqueCloses: uniq.size,
    firstDate: info.rows[0]?.date || "",
    lastDate: info.rows.at(-1)?.date || "",
    error: info.error || "",
  };
}

const bgnDe = kstYmd(-days);
const endDe = kstYmd(0);
const [holdings, executives] = await Promise.all([
  convexQuery("dart:listDailyReportItemsRange", { bgnDe, endDe, limit: 1000 }),
  convexQuery("dart:listExecutiveDailyReportItemsRange", { bgnDe, endDe, limit: 1000 }),
]);

const byCode = new Map();
for (const row of [...holdings, ...executives]) {
  const stockCode = normalizeCode(row.stockCode);
  const market = normalizeMarket(row.market);
  if (!stockCode || market === "KONEX") continue;
  if (market !== "KOSPI" && market !== "KOSDAQ") continue;
  const prev = byCode.get(stockCode) || { stockCode, market, corpName: row.corpName || "", kinds: new Set(), receipts: 0 };
  prev.kinds.add(holdings.includes(row) ? "5percent" : "executive");
  prev.receipts += 1;
  prev.corpName = prev.corpName || row.corpName || "";
  byCode.set(stockCode, prev);
}

const checks = [...byCode.values()].sort((a, b) => a.stockCode.localeCompare(b.stockCode)).map((row) => {
  const price = classifyPrice(row.stockCode);
  let status = "ok";
  if (!price.exists) status = "missing-file";
  else if (price.rows < 2) status = "empty-or-short";
  else if (price.uniqueCloses < 2) status = "flatline";
  return { ...row, kinds: [...row.kinds], price, status };
});

const bad = checks.filter((row) => row.status !== "ok");
const summary = {
  generatedAt: new Date().toISOString(),
  range: { bgnDe, endDe, days },
  counts: {
    holdings: holdings.length,
    executives: executives.length,
    kospiKosdaqCodes: checks.length,
    bad: bad.length,
    missingFile: bad.filter((x) => x.status === "missing-file").length,
    emptyOrShort: bad.filter((x) => x.status === "empty-or-short").length,
    flatline: bad.filter((x) => x.status === "flatline").length,
  },
  bad,
};

fs.writeFileSync(path.join(reportDir, "convex_price_health_report.json"), JSON.stringify(summary, null, 2), "utf8");
const md = [
  "# Convex Price Health Report",
  "",
  `- generatedAt: ${summary.generatedAt}`,
  `- range: ${bgnDe} ~ ${endDe}`,
  `- checked KOSPI/KOSDAQ codes: ${summary.counts.kospiKosdaqCodes}`,
  `- bad: ${summary.counts.bad}`,
  "",
  ...bad.slice(0, 50).map((row) => `- [${row.status}] ${row.stockCode} ${row.corpName} ${row.market} rows=${row.price.rows} uniqueCloses=${row.price.uniqueCloses}`),
];
fs.writeFileSync(path.join(reportDir, "convex_price_health_report.md"), md.join("\n"), "utf8");
console.log(`CONVEX_PRICE_HEALTH checked=${summary.counts.kospiKosdaqCodes} bad=${summary.counts.bad} missing=${summary.counts.missingFile} short=${summary.counts.emptyOrShort} flatline=${summary.counts.flatline}`);
if (bad.length) console.log(bad.slice(0, 30).map((row) => `${row.stockCode}:${row.status}`).join(","));


