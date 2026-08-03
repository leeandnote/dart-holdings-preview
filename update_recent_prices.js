import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "site", "data");
const latestPath = path.join(dataDir, "latest.json");
const priceDir = path.join(dataDir, "prices");
const currentPricesPath = path.join(dataDir, "current_prices.js");
const eventPricesPath = path.join(dataDir, "event_prices.js");
const pricesIndexPath = path.join(dataDir, "prices.js");
const range = process.argv.includes("--range") ? process.argv[process.argv.indexOf("--range") + 1] : "1mo";
const concurrency = Number(process.argv.includes("--concurrency") ? process.argv[process.argv.indexOf("--concurrency") + 1] : 24);
const maxStocks = Number(process.argv.includes("--max") ? process.argv[process.argv.indexOf("--max") + 1] : 0);
const recentDays = Number(process.argv.includes("--recent-days") ? process.argv[process.argv.indexOf("--recent-days") + 1] : 0);
const timeoutMs = Number(process.argv.includes("--timeout-ms") ? process.argv[process.argv.indexOf("--timeout-ms") + 1] : 10000);
const cutoff = getKoreaTodayDate();
const cutoffKey = cutoff.toISOString().slice(0, 10);

function getKoreaTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${lookup.year}-${lookup.month}-${lookup.day}T00:00:00Z`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function readWindowObject(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const match = text.match(/=\s*(\{.*\});?\s*$/s);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

function suffix(market) {
  return market === "KOSDAQ" ? "KQ" : "KS";
}

function rowValue(row, key, fallback = "") {
  return row[key] ?? fallback;
}

function stockTargets(rows) {
  const map = new Map();
  const recentCutoff = recentDays > 0 ? new Date(cutoff.getTime() - recentDays * 24 * 60 * 60 * 1000) : null;
  for (const row of rows) {
    if (recentCutoff) {
      const receiptDate = rowDate(rowValue(row, "접수일"));
      const obligationDate = rowDate(rowValue(row, "보고의무발생일") || rowValue(row, "보고의무발생일자") || rowValue(row, "변동일"));
      const isRecent = (receiptDate && receiptDate >= recentCutoff) || (obligationDate && obligationDate >= recentCutoff);
      if (!isRecent) continue;
    }
    const market = rowValue(row, "시장");
    const code = rowValue(row, "종목코드");
    const name = rowValue(row, "종목명");
    if (!code || (market !== "KOSPI" && market !== "KOSDAQ")) continue;
    map.set(code, { code, market, name, symbol: `${code}.${suffix(market)}` });
  }
  const targets = [...map.values()].sort((a, b) => `${a.market}${a.code}`.localeCompare(`${b.market}${b.code}`));
  return maxStocks > 0 ? targets.slice(0, maxStocks) : targets;
}

function rowDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`);
}

function parseChunk(code) {
  const file = path.join(priceDir, `${code}.js`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const match = text.match(/=\s*(\[.*\]);?\s*$/s);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function mergeCandles(oldItems, newItems) {
  const map = new Map();
  for (const item of oldItems || []) {
    if (item?.date) map.set(item.date, item);
  }
  for (const item of newItems || []) {
    if (item?.date) map.set(item.date, item);
  }
  return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function fetchCandles(stock) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?range=${range}&interval=1d&events=history&includeAdjustedClose=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let data;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Yahoo timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!timestamps.length || !quote) throw new Error("empty chart result");
  const items = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (open == null || high == null || low == null || close == null) continue;
    const date = new Date((timestamps[i] + 9 * 60 * 60) * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    if (dateKey > cutoffKey) continue;
    items.push({
      date: dateKey,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Number(quote.volume?.[i] || 0),
    });
  }
  return items;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function writeChunk(code, items) {
  const json = JSON.stringify(items);
  const text = `window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {}; window.__PRICE_CHUNKS__['${code}'] = ${json};`;
  fs.writeFileSync(path.join(priceDir, `${code}.js`), text, "utf8");
}

async function runPool(targets, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (index < targets.length) {
      const current = index++;
      await worker(targets[current], current);
    }
  });
  await Promise.all(workers);
}

function closestEventPrice(items, yyyymmdd) {
  if (!items?.length || !yyyymmdd || yyyymmdd.length !== 8) return null;
  const target = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00`);
  let best = null;
  let bestDiff = Infinity;
  for (const item of items) {
    const diff = Math.abs(new Date(`${item.date}T00:00:00`) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  return best ? { date: best.date, close: best.close } : null;
}

async function main() {
  fs.mkdirSync(priceDir, { recursive: true });
  const latest = readJson(latestPath);
  const targets = stockTargets(latest.rows || []);
  const currentPrices = readWindowObject(currentPricesPath);
  const mergedPrices = new Map();
  const errors = [];

  await runPool(targets, async (stock, i) => {
    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`[${i + 1}/${targets.length}] ${stock.code} ${stock.name}`);
    }
    try {
      const oldItems = parseChunk(stock.code);
      const newItems = await fetchCandles(stock);
      const merged = mergeCandles(oldItems, newItems);
      if (!merged.length) throw new Error("no candles");
      writeChunk(stock.code, merged);
      mergedPrices.set(stock.code, merged);
      const latestClosed = merged.filter((item) => new Date(`${item.date}T00:00:00`) <= cutoff).at(-1);
      if (latestClosed) currentPrices[stock.code] = { date: latestClosed.date, close: latestClosed.close };
    } catch (error) {
      errors.push({ code: stock.code, name: stock.name, symbol: stock.symbol, error: error.message });
      const oldItems = parseChunk(stock.code);
      const latestClosed = oldItems.filter((item) => new Date(`${item.date}T00:00:00`) <= cutoff).at(-1);
      if (latestClosed) currentPrices[stock.code] = { date: latestClosed.date, close: latestClosed.close };
    }
  });

  const eventPrices = {};
  for (const row of latest.rows || []) {
    const code = rowValue(row, "종목코드");
    const obligationDate = rowValue(row, "보고의무발생일") || rowValue(row, "보고의무발생일자") || rowValue(row, "변동일") || rowValue(row, "접수일");
    if (!code || !obligationDate) continue;
    const key = `${code}_${obligationDate}`;
    if (eventPrices[key]) continue;
    const items = mergedPrices.get(code) || parseChunk(code);
    const eventPrice = closestEventPrice(items, String(obligationDate));
    if (eventPrice) eventPrices[key] = eventPrice;
  }

  const generatedAt = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ");
  fs.writeFileSync(currentPricesPath, `window.__CURRENT_PRICES__ = ${JSON.stringify(currentPrices)};`, "utf8");
  fs.writeFileSync(eventPricesPath, `window.__EVENT_PRICES__ = ${JSON.stringify(eventPrices)};`, "utf8");
  fs.writeFileSync(
    pricesIndexPath,
    `window.__PRICE_DATA__ = ${JSON.stringify({
      generatedAt,
      source: "Yahoo Finance chart API recent merge",
      range,
      interval: "1d",
      completeCloseCutoff: cutoffKey,
      stockCount: Object.keys(currentPrices).length,
      errorCount: errors.length,
      errors,
      prices: {},
    })}; window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {};`,
    "utf8"
  );
  console.log(`Recent price cache done: ${targets.length} refreshed / ${Object.keys(currentPrices).length} cached stocks, ${errors.length} errors, cutoff ${cutoffKey}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
