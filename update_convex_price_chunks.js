const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataDir = path.join(root, "site", "data");
const priceDir = path.join(dataDir, "prices");
const targetsPath = path.join(dataDir, "convex_price_targets.json");
const range = process.argv.includes("--range") ? process.argv[process.argv.indexOf("--range") + 1] : "1y";
const concurrency = Number(process.argv.includes("--concurrency") ? process.argv[process.argv.indexOf("--concurrency") + 1] : 8);
const codesArg = process.argv.includes("--codes") ? process.argv[process.argv.indexOf("--codes") + 1] : "";
const codeFilter = new Set(String(codesArg || "").split(",").map(normalizeCode).filter(Boolean));
const missingOnly = process.argv.includes("--missing-only");

function suffix(market) {
  return market === "KOSDAQ" ? "KQ" : "KS";
}

function normalizeCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const code = digits.padStart(6, "0");
  return /^\d{6}$/.test(code) ? code : "";
}

function readTargets() {
  const raw = JSON.parse(fs.readFileSync(targetsPath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(raw) ? raw : raw.rows || raw.items || [];
  const map = new Map();
  for (const row of rows) {
    const market = row.market || row["시장"] || "";
    const code = normalizeCode(row.stockCode || row.code || row["종목코드"]);
    const name = row.corpName || row.name || row["종목명"] || "";
    if (!code || (market !== "KOSPI" && market !== "KOSDAQ")) continue;
    map.set(code, { code, market, name, symbol: `${code}.${suffix(market)}` });
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function parseChunk(code) {
  const file = path.join(priceDir, `${code}.js`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const match = text.match(/\['[^']+'\]\s*=\s*(\[.*\]);?\s*$/s) || text.match(/=\s*(\[.*\]);?\s*$/s);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function mergeCandles(oldItems, newItems) {
  const map = new Map();
  for (const item of oldItems || []) if (item?.date) map.set(item.date, item);
  for (const item of newItems || []) if (item?.date) map.set(item.date, item);
  return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function fetchYahooCandles(stock) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?range=${range}&interval=1d&events=history&includeAdjustedClose=true`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
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
    const date = new Date((timestamps[i] + 9 * 60 * 60) * 1000).toISOString().slice(0, 10);
    items.push({
      date,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Number(quote.volume?.[i] || 0),
    });
  }
  return items;
}
function naverCountForRange(value) {
  if (value === "6mo") return 190;
  if (value === "2y") return 740;
  if (value === "5y") return 1850;
  return 370;
}

async function fetchNaverCandles(stock) {
  const count = naverCountForRange(range);
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${stock.code}&timeframe=day&count=${count}&requestType=0`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`naver ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const items = [];
  for (const match of xml.matchAll(/<item\s+data="([^"]+)"\s*\/>/g)) {
    const [dateRaw, open, high, low, close, volume] = match[1].split("|");
    if (!/^\d{8}$/.test(dateRaw)) continue;
    const closeNumber = Number(close);
    if (!Number.isFinite(closeNumber) || closeNumber <= 0) continue;
    items.push({
      date: `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Number(volume || 0),
    });
  }
  if (items.length < 2) throw new Error("naver not enough candles");
  return items;
}

async function fetchCandles(stock) {
  try {
    const yahooItems = await fetchYahooCandles(stock);
    if (yahooItems.length >= 2) return yahooItems;
  } catch (error) {
    stock.yahooError = error.message;
  }
  return fetchNaverCandles(stock);
}
function writeChunk(code, items) {
  const text = `window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {}; window.__PRICE_CHUNKS__['${code}'] = ${JSON.stringify(items)};`;
  fs.writeFileSync(path.join(priceDir, `${code}.js`), text, "utf8");
}

async function runPool(targets, worker) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (index < targets.length) {
      const current = index++;
      await worker(targets[current], current);
    }
  }));
}

async function main() {
  fs.mkdirSync(priceDir, { recursive: true });
  let targets = readTargets();
  if (codeFilter.size) targets = targets.filter((stock) => codeFilter.has(stock.code));
  if (missingOnly) targets = targets.filter((stock) => parseChunk(stock.code).length < 2);
  const errors = [];
  let updated = 0;
  console.log(`Convex price chunk targets: ${targets.length}`);
  await runPool(targets, async (stock, i) => {
    if (i === 0 || (i + 1) % 20 === 0) console.log(`[${i + 1}/${targets.length}] ${stock.code} ${stock.name}`);
    try {
      const oldItems = parseChunk(stock.code);
      const newItems = await fetchCandles(stock);
      const merged = mergeCandles(oldItems, newItems);
      if (merged.length < 2) throw new Error("not enough candles");
      writeChunk(stock.code, merged);
      updated += 1;
    } catch (error) {
      errors.push({ code: stock.code, name: stock.name, symbol: stock.symbol, error: error.message });
    }
  });
  console.log(`Convex price chunks updated: ${updated}, errors: ${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 20), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});




