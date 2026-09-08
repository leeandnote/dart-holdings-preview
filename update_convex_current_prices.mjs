import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "site", "data");
const targetsPath = path.join(dataDir, "convex_price_targets.json");
const priceDir = path.join(dataDir, "prices");
const currentPricesPath = path.join(dataDir, "current_prices.js");
const pricesIndexPath = path.join(dataDir, "prices.js");
const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function fallbackTradeDate(dateText = todayKst) {
  const date = new Date(`${dateText}T12:00:00+09:00`);
  const day = date.getDay();
  const offset = day === 0 ? -2 : day === 6 ? -1 : 0;
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

const maxCurrentTradeDate = fallbackTradeDate();

function normalizeCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const code = digits.padStart(6, "0");
  return /^\d{6}$/.test(code) ? code : "";
}

function readTargets() {
  if (!fs.existsSync(targetsPath)) return [];
  const raw = JSON.parse(fs.readFileSync(targetsPath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(raw) ? raw : raw.rows || raw.items || [];
  return [...new Set(rows.map((row) => normalizeCode(row.stockCode || row.code || row["종목코드"])).filter(Boolean))].sort();
}

function readChunk(code) {
  const file = path.join(priceDir, `${code}.js`);
  if (!fs.existsSync(file)) return [];
  const context = { window: { __PRICE_CHUNKS__: {} }, console };
  vm.createContext(context);
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    const rows = context.window.__PRICE_CHUNKS__?.[code] || [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

const currentPrices = {};
const missing = [];
const staleDates = new Map();
for (const code of readTargets()) {
  const rows = readChunk(code)
    .filter((row) => row && Number.isFinite(Number(row.close)) && row.date && String(row.date) <= maxCurrentTradeDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = rows.at(-1);
  if (!latest) {
    missing.push(code);
    continue;
  }
  currentPrices[code] = { date: latest.date, close: Number(latest.close) };
  staleDates.set(latest.date, (staleDates.get(latest.date) || 0) + 1);
}

const generatedAt = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ");
fs.writeFileSync(currentPricesPath, `window.__CURRENT_PRICES__ = ${JSON.stringify(currentPrices)};`, "utf8");
fs.writeFileSync(
  pricesIndexPath,
  `window.__PRICE_DATA__ = ${JSON.stringify({
    generatedAt,
    source: "Convex target price chunks latest close",
    interval: "1d",
    stockCount: Object.keys(currentPrices).length,
    missingCount: missing.length,
    missing,
    latestDateDistribution: Object.fromEntries([...staleDates.entries()].sort()),
    prices: {},
  })}; window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {};`,
  "utf8"
);

const latestDate = Object.keys(Object.fromEntries(staleDates)).sort().at(-1) || "";
console.log(`CONVEX_CURRENT_PRICES stockCount=${Object.keys(currentPrices).length} missing=${missing.length} latestDate=${latestDate}`);
console.log(JSON.stringify(Object.fromEntries([...staleDates.entries()].sort().slice(-8)), null, 2));


