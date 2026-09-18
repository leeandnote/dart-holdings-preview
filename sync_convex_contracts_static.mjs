import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "site", "data");
const jsonPath = path.join(dataDir, "disclosure_signals.json");
const jsPath = path.join(dataDir, "disclosure_signals.js");
const convexUrl = "https://quiet-cardinal-118.convex.cloud";

function ymd(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function kstTimestamp() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function query(pathName, args) {
  const response = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: pathName, args, format: "json" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || pathName);
  return Array.isArray(payload.value) ? payload.value : [];
}

const end = new Date();
const begin = new Date(end);
begin.setUTCDate(begin.getUTCDate() - 180);
const bgnDe = ymd(begin);
const endDe = ymd(end);
const contracts = await query("dart:listContractDailyReportItemsRange", { bgnDe, endDe, limit: 5000 });
const previous = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : { rows: [] };
const nonContracts = (previous.rows ?? []).filter((row) => row["공시유형"] !== "단일판매·공급계약");
const contractRows = contracts.map((row) => ({
  "접수일": row.reportDate,
  "시장": row.market ?? "",
  "공시유형": "단일판매·공급계약",
  "종목명": row.corpName ?? "",
  "종목코드": row.stockCode ?? "",
  "보고서명": row.reportName ?? "",
  "계약금액": row.amount ?? null,
  "최근매출액": Number.isFinite(row.amount) && Number.isFinite(row.salesRatio) && row.salesRatio > 0
    ? Math.round(row.amount / (row.salesRatio / 100))
    : null,
  "매출대비비율": row.salesRatio ?? null,
  "계약상대방": row.counterparty ?? "",
  "계약기간": row.periodText || [row.startDate, row.endDate].filter(Boolean).join(" ~ "),
  "계약시작일": row.startDate ?? "",
  "계약종료일": row.endDate ?? "",
  "계약내용": row.content ?? "",
  "판매공급지역": "",
  "매출액": null,
  "영업이익": null,
  "당기순이익": null,
  "턴어라운드": "",
  "접수번호": row.receiptNo ?? "",
  "DART_URL": row.url ?? "",
}));
const rows = [...contractRows, ...nonContracts].sort((a, b) =>
  String(b["접수일"] ?? "").localeCompare(String(a["접수일"] ?? "")) ||
  String(a["종목명"] ?? "").localeCompare(String(b["종목명"] ?? ""), "ko"),
);
const payload = {
  ...previous,
  generatedAt: kstTimestamp(),
  bgnDe,
  endDe,
  contractFallbackSource: "production-convex",
  excludedIncompleteContracts: contractRows.filter((row) => !Number.isFinite(row["계약금액"])).length,
  rows,
};
const json = JSON.stringify(payload, null, 2);
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(jsonPath, `${json}\n`, "utf8");
fs.writeFileSync(jsPath, `window.__DISCLOSURE_SIGNALS__ = ${json};\n`, "utf8");
console.log(`Convex contract fallback: ${contractRows.length} contract rows, ${rows.length} total rows`);
