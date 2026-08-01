import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const siteData = path.join(root, "site", "data");

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates",
};

const cacheFiles = [
  ["latest", "latest.json"],
  ["logos", "logos.json"],
  ["event_prices", "event_prices.js"],
  ["current_prices", "current_prices.js"],
  ["shareholders", "shareholders.json"],
  ["disclosure_signals", "disclosure_signals.json"],
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  console.log("[Supabase] site_cache sync started");
  for (const [key, fileName] of cacheFiles) {
    const filePath = path.join(siteData, fileName);
    const payload = await readCachePayload(filePath, key);
    await upsert("site_cache", [{ key, payload }]);
    console.log(`  synced site_cache.${key}`);
  }

  console.log("[Supabase] price_candles sync started");
  const pricesDir = path.join(siteData, "prices");
  const files = (await fs.readdir(pricesDir)).filter((file) => /^\d{6}\.js$/.test(file)).sort();
  let count = 0;
  let batch = [];
  for (const file of files) {
    const stockCode = file.slice(0, 6);
    const candles = await readPriceChunk(path.join(pricesDir, file), stockCode);
    const dates = candles.map((item) => item.date).filter(Boolean).sort();
    batch.push({
      stock_code: stockCode,
      payload: candles,
      start_date: dates[0] || null,
      end_date: dates.at(-1) || null,
    });
    count += 1;
    if (batch.length >= 40) {
      await upsert("price_candles", batch);
      batch = [];
      console.log(`  synced ${count}/${files.length} price chunks`);
    }
  }
  if (batch.length) {
    await upsert("price_candles", batch);
  }
  console.log(`[Supabase] done. ${count} price chunks synced.`);
}

async function readCachePayload(filePath, key) {
  const text = stripBom(await fs.readFile(filePath, "utf8"));
  if (filePath.endsWith(".json")) return JSON.parse(text);

  if (key === "event_prices") {
    return parseAssignedJson(text, "window.__EVENT_PRICES__");
  }
  if (key === "current_prices") {
    return parseAssignedJson(text, "window.__CURRENT_PRICES__");
  }
  throw new Error(`JS 캐시 파싱 규칙이 없습니다: ${filePath}`);
}

async function readPriceChunk(filePath, stockCode) {
  const text = stripBom(await fs.readFile(filePath, "utf8"));
  const pattern = new RegExp(`window\\.__PRICE_CHUNKS__\\[['"]${stockCode}['"]\\]\\s*=\\s*(\\[[\\s\\S]*?\\]);?\\s*$`);
  const match = text.match(pattern);
  if (!match) throw new Error(`가격 chunk 파싱 실패: ${filePath}`);
  return JSON.parse(match[1]);
}

function parseAssignedJson(text, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*=\\s*([\\s\\S]*?);?\\s*$`));
  if (!match) throw new Error(`${variableName} 파싱 실패`);
  return JSON.parse(match[1]);
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function upsert(table, rows) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${table} upsert 실패 ${response.status}: ${text}`);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}
