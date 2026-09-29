import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const convexUrl = (process.env.CONVEX_URL || "https://quiet-cardinal-118.convex.cloud").replace(/\/$/, "");
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const backfillDays = Math.max(1, Number(daysArg?.split("=")[1] || 21));

function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function queryDates(queryPath) {
  const response = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: queryPath, args: {}, format: "json" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${queryPath} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status !== "success") throw new Error(payload.errorMessage || `${queryPath} failed`);
  return Array.isArray(payload.value) ? payload.value : [];
}

const dates = new Set();
for (let offset = 0; offset < backfillDays; offset += 1) dates.add(kstDate(-offset));

for (const queryPath of ["dart:listDailyReportDates", "dart:listExecutiveDailyReportDates"]) {
  const availableDates = await queryDates(queryPath);
  for (const value of availableDates) {
    const normalized = String(value).replace(/\D/g, "").slice(0, 8);
    if (/^\d{8}$/.test(normalized)) dates.add(normalized);
  }
}

const selectedDates = [...dates].sort().slice(-Math.max(backfillDays * 3, 30));
for (const reportDate of selectedDates) {
  console.log(`Generating blog archive for ${reportDate}`);
  const result = spawnSync(process.execPath, [path.join(root, "generate_daily_blog.mjs"), reportDate], {
    cwd: root,
    env: { ...process.env, CONVEX_URL: convexUrl },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Blog generation failed for ${reportDate}`);
}

console.log(`BLOG_ARCHIVE_DATES=${selectedDates.length}`);
console.log(`BLOG_ARCHIVE_LATEST=${selectedDates.at(-1) || "none"}`);
