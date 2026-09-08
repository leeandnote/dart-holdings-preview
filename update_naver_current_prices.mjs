import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "site", "data");
const priceDir = path.join(dataDir, "prices");
const targetsPath = path.join(dataDir, "convex_price_targets.json");
const currentPricesPath = path.join(dataDir, "current_prices.js");
const pricesIndexPath = path.join(dataDir, "prices.js");
const concurrency = Number(process.argv.includes("--concurrency") ? process.argv[process.argv.indexOf("--concurrency") + 1] : 8);
const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function fallbackTradeDate(dateText = todayKst) {
  const date = new Date(`${dateText}T12:00:00+09:00`);
  const day = date.getDay();
  const offset = day === 0 ? -2 : day === 6 ? -1 : 0;
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
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
  const map = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.stockCode || row.code || row["종목코드"]);
    if (!code) continue;
    map.set(code, { code, name: row.corpName || row.name || row["종목명"] || "" });
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
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

function writeChunk(code, items) {
  fs.mkdirSync(priceDir, { recursive: true });
  const text = `window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {}; window.__PRICE_CHUNKS__['${code}'] = ${JSON.stringify(items)};`;
  fs.writeFileSync(path.join(priceDir, `${code}.js`), text, "utf8");
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function latestChunkPrice(code) {
  const rows = readChunk(code)
    .filter((row) => row?.date && Number.isFinite(Number(row.close)) && Number(row.close) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = rows.at(-1);
  if (!latest) return null;
  const previous = rows.slice(0, -1).reverse().find((row) => Number.isFinite(Number(row.close)) && Number(row.close) > 0) || null;
  const close = round(latest.close);
  const previousClose = previous ? round(previous.close) : null;
  const change = previousClose === null ? 0 : round(close - previousClose);
  const changeRate = previousClose ? round((change / previousClose) * 100) : 0;
  return {
    date: String(latest.date).slice(0, 10),
    close,
    previousClose,
    change,
    changeRate,
    marketStatus: "PRICE_CHUNK_FALLBACK",
  };
}

async function fetchNaver(code) {
  const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  const item = data?.result?.areas?.[0]?.datas?.find((row) => row?.cd === code);
  if (!item) throw new Error("empty naver item");
  const close = Number(item.nv);
  if (!Number.isFinite(close) || close <= 0) throw new Error("invalid close");
  const tradedAt = item?.nxtOverMarketPriceInfo?.localTradedAt || item?.localTradedAt || item?.tradedAt || "";
  const priceDate = /^\d{4}-\d{2}-\d{2}/.test(tradedAt) ? tradedAt.slice(0, 10) : fallbackTradeDate();
  return {
    date: priceDate,
    close,
    previousClose: Number(item.sv) || null,
    change: Number(item.cv) || 0,
    changeRate: Number(item.cr) || 0,
    marketStatus: item.ms || "",
    candle: {
      date: priceDate,
      open: round(item.ov || close),
      high: round(item.hv || close),
      low: round(item.lv || close),
      close: round(close),
      volume: Number(item.aq || 0),
    },
  };
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

const targets = readTargets();
const currentPrices = {};
const errors = [];
let updatedChunks = 0;

console.log(`Naver current price targets: ${targets.length}`);
await runPool(targets, async (target, index) => {
  if (index === 0 || (index + 1) % 25 === 0) console.log(`[${index + 1}/${targets.length}] ${target.code} ${target.name}`);
  try {
    const price = await fetchNaver(target.code);
    currentPrices[target.code] = {
      date: price.date,
      close: price.close,
      change: price.change,
      changeRate: price.changeRate,
      previousClose: price.previousClose,
      source: "Naver Finance realtime",
      marketStatus: price.marketStatus,
    };
    const rows = readChunk(target.code);
    const map = new Map(rows.filter((row) => row?.date).map((row) => [row.date, row]));
    map.set(price.candle.date, price.candle);
    writeChunk(target.code, [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))));
    updatedChunks += 1;
  } catch (error) {
    const fallback = latestChunkPrice(target.code);
    if (fallback) {
      currentPrices[target.code] = {
        date: fallback.date,
        close: fallback.close,
        change: fallback.change,
        changeRate: fallback.changeRate,
        previousClose: fallback.previousClose,
        source: "Price chunk latest close fallback",
        marketStatus: fallback.marketStatus,
      };
      return;
    }
    errors.push({ code: target.code, name: target.name, error: error.message });
  }
});

fs.writeFileSync(currentPricesPath, `window.__CURRENT_PRICES__ = ${JSON.stringify(currentPrices)};`, "utf8");
fs.writeFileSync(
  pricesIndexPath,
  `window.__PRICE_DATA__ = ${JSON.stringify({
    generatedAt: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " "),
    source: "Naver Finance realtime close + Convex target price chunks",
    interval: "1d",
    stockCount: Object.keys(currentPrices).length,
    missingCount: errors.length,
    missing: errors,
    latestDateDistribution: Object.values(currentPrices).reduce((acc, row) => { acc[row.date] = (acc[row.date] || 0) + 1; return acc; }, {}),
    prices: {},
  })}; window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {};`,
  "utf8"
);

console.log(`NAVER_CURRENT_PRICES updated=${Object.keys(currentPrices).length} chunkUpdated=${updatedChunks} errors=${errors.length} latestDates=${JSON.stringify(Object.values(currentPrices).reduce((acc, row) => { acc[row.date] = (acc[row.date] || 0) + 1; return acc; }, {}))}`);
if (errors.length) console.log(JSON.stringify(errors.slice(0, 20), null, 2));




