import process from "node:process";

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

const [siteCache, priceCount] = await Promise.all([
  getJson("site_cache?select=key,updated_at&order=key.asc"),
  getCount("price_candles?select=stock_code"),
]);

console.log("site_cache");
for (const row of siteCache) {
  console.log(`- ${row.key}: ${row.updated_at}`);
}
console.log(`price_candles: ${priceCount} stocks`);

async function getJson(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getCount(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.headers.get("content-range")?.split("/").at(-1) || "0";
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}
