import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;
const convexUrl = "https://gregarious-lemming-92.convex.cloud";
const days = Number(process.argv.includes("--days") ? process.argv[process.argv.indexOf("--days") + 1] : 30);
const priceDir = path.join(root, "site", "data", "prices");

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
  const res = await fetch(`${convexUrl}/api/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: pathName, args, format: "json" }) });
  const json = await res.json();
  if (json.status !== "success") throw new Error(`${pathName}: ${JSON.stringify(json)}`);
  return Array.isArray(json.value) ? json.value : [];
}
function readPriceStatus(code) {
  const file = path.join(priceDir, `${code}.js`);
  if (!fs.existsSync(file)) return "missing-file";
  const context = { window: { __PRICE_CHUNKS__: {} }, console };
  vm.createContext(context);
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    const rows = context.window.__PRICE_CHUNKS__?.[code] || [];
    const uniq = new Set(rows.map((row) => row.close).filter(Number.isFinite));
    if (rows.length < 2) return "empty-or-short";
    if (uniq.size < 2) return "flatline";
    return "ok";
  } catch {
    return "empty-or-short";
  }
}

execFileSync(node, [path.join(root, "sync_convex_price_targets.mjs"), "--days", String(days)], { cwd: root, stdio: "inherit" });
const args = { bgnDe: kstYmd(-days), endDe: kstYmd(0), limit: 1000 };
const rows = [
  ...(await convexQuery("dart:listDailyReportItemsRange", args)),
  ...(await convexQuery("dart:listExecutiveDailyReportItemsRange", args)),
];
const codes = [...new Set(rows.filter((row) => ["KOSPI", "KOSDAQ"].includes(normalizeMarket(row.market))).map((row) => normalizeCode(row.stockCode)).filter(Boolean))].sort();
const badCodes = codes.filter((code) => readPriceStatus(code) !== "ok");
console.log(`REPAIR_CONVEX_PRICE_GAPS checked=${codes.length} bad=${badCodes.length}`);
if (codes.length) {
  console.log(`REFRESH_CONVEX_PRICE_CHUNKS all=${codes.length}`);
  execFileSync(node, [path.join(root, "update_convex_price_chunks.js"), "--range", "1y", "--concurrency", "8", "--codes", codes.join(",")], { cwd: root, stdio: "inherit" });
}
if (badCodes.length) {
  console.log(`REPAIR_CODES=${badCodes.join(",")}`);
  execFileSync(node, [path.join(root, "update_convex_price_chunks.js"), "--range", "1y", "--concurrency", "6", "--codes", badCodes.join(",")], { cwd: root, stdio: "inherit" });
}
execFileSync(node, [path.join(root, "convex_price_health_check.mjs"), "--days", String(days)], { cwd: root, stdio: "inherit" });
execFileSync(node, [path.join(root, "update_naver_current_prices.mjs"), "--concurrency", "10"], { cwd: root, stdio: "inherit" });
execFileSync(node, [path.join(root, "update_convex_current_prices.mjs")], { cwd: root, stdio: "inherit" });



