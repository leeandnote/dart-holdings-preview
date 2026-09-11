import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "site", "data");
const convexUrl = "https://gregarious-lemming-92.convex.cloud";
const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const endDe = kst.toISOString().slice(0, 10).replaceAll("-", "");
const start = new Date(kst);
start.setUTCDate(start.getUTCDate() - 120);
const bgnDe = start.toISOString().slice(0, 10).replaceAll("-", "");

async function query(queryPath, args) {
  const response = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: queryPath, args, format: "json" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || queryPath);
  return payload.value;
}

const numberOrBlank = (value) => Number.isFinite(value) ? value : "";
const normalizedDate = (value) => {
  const text = String(value || "").replace(/\D/g, "");
  return /^\d{8}$/.test(text) ? text : "";
};
function mapRow(row) {
  const previousRate = row.previousRate ?? row.prevRate;
  const currentRate = row.currentRate ?? row.ratio;
  const previousShares = row.previousShares ?? row.prevShares ?? row.previousStockCount ?? row.beforeShares;
  const currentShares = row.currentShares ?? row.curShares ?? row.currentStockCount ?? row.afterShares;
  const shareDelta = row.shareDelta ?? row.deltaShares ?? row.shareChange ?? row.changedShares ?? row.stockDelta;
  const receiptDate = normalizedDate(row.reportDate || row.receiptDate);
  const obligationDate = normalizedDate(row.obligationDate) || receiptDate;
  return {
    "접수일": receiptDate,
    "보고의무발생일": obligationDate,
    "시장": row.market || "", "보고구분": row.reportName || "대량보유 공시",
    "종목명": row.corpName || "", "종목코드": row.stockCode || "", "보고자": row.reporter || "",
    "직전지분율": numberOrBlank(previousRate), "이번지분율": numberOrBlank(currentRate),
    "증감률": numberOrBlank(row.rateDelta ?? (Number.isFinite(previousRate) && Number.isFinite(currentRate) ? currentRate - previousRate : null)),
    "직전보유주식수": numberOrBlank(previousShares), "보유주식수": numberOrBlank(currentShares), "증감주식수": numberOrBlank(shareDelta),
    "보고사유": row.reason || "", "공시취득처분단가": numberOrBlank(row.buyUnitPrice), "공시단가기준금액": numberOrBlank(row.buyTradeValue),
    "보고의무발생일종가": numberOrBlank(row.eventClose), "보고의무발생일종가일자": row.eventCloseDate || "",
    "최근일종가": numberOrBlank(row.currentClose), "최근일종가일자": row.currentCloseDate || "", "단가출처": row.buyPriceLabel || row.priceSource || "Convex DB",
    "5퍼센트상향돌파": Number(previousRate) < 5 && Number(currentRate) >= 5 ? "Y" : "",
    "접수번호": row.receiptNo || "", DART_URL: row.url || (row.receiptNo ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.receiptNo}` : "#"),
  };
}

const live = await query("dart:listDailyReportItemsRange", { bgnDe, endDe, limit: 5000 });
if (!Array.isArray(live) || !live.length) throw new Error("Convex returned no 5% disclosure rows; refusing to replace fallback data.");
const oldPath = path.join(dataDir, "latest.json");
const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, "utf8").replace(/^\uFEFF/, "")) : {};
const mapped = live.map(mapRow);
const oldRows = Array.isArray(old.rows) ? old.rows.filter((row) => String(row["접수일"] || "") < bgnDe) : [];
const rows = [...mapped, ...oldRows].sort((a, b) => String(b["접수일"]).localeCompare(String(a["접수일"])) || String(b["접수번호"] || "").localeCompare(String(a["접수번호"] || "")));
const generatedAt = `${endDe.slice(0,4)}-${endDe.slice(4,6)}-${endDe.slice(6,8)} ${String(kst.getUTCHours()).padStart(2,"0")}:${String(kst.getUTCMinutes()).padStart(2,"0")}:${String(kst.getUTCSeconds()).padStart(2,"0")}`;
const payload = { ...old, generatedAt, generatedAtUtc: now.toISOString(), scope: "KOSPI/KOSDAQ Convex synchronized fallback", bgnDe, endDe, rows };
const json = JSON.stringify(payload);
fs.writeFileSync(oldPath, json, "utf8");
fs.writeFileSync(path.join(dataDir, "latest.js"), `window.__DART_DATA__ = ${json};\n`, "utf8");
console.log(`CONVEX_FALLBACK_ROWS=${mapped.length} range=${bgnDe}-${endDe}`);
