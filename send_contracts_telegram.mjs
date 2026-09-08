import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const dateArg = args.find((arg) => /^\d{8}$/.test(arg));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function saneAmount(value) {
  const amount = n(value);
  if (!Number.isFinite(amount) || amount < 1000000) return null;
  return amount;
}

function saneRatio(value) {
  const ratio = n(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 10000) return null;
  return ratio;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isContract(row) {
  return row["공시유형"] === "단일판매·공급계약" && /단일판매|공급계약/.test(String(row["보고서명"] || ""));
}

function formatDate(yyyymmdd) {
  const text = String(yyyymmdd || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}
function nowKstText() {
  const text = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return `${text.replace(",", "")} KST`;
}

function money(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100000000) return `${Math.round(value / 100000000).toLocaleString("ko-KR")}억원`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function normalize(row) {
  return {
    date: String(row["접수일"] || ""),
    corpName: clean(row["종목명"]),
    stockCode: clean(row["종목코드"]),
    market: clean(row["시장"]),
    reportName: clean(row["보고서명"]),
    amount: saneAmount(row["계약금액"]),
    salesRatio: saneRatio(row["매출대비비율"]),
    counterparty: clean(row["계약상대방"]) || "영업비밀 보호 비공개",
    content: clean(row["계약내용"]),
    startDate: clean(row["계약시작일"]),
    endDate: clean(row["계약종료일"]),
    receiptNo: clean(row["접수번호"]),
    url: row.DART_URL || (row["접수번호"] ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row["접수번호"]}` : ""),
    correction: /기재정정|정정/.test(String(row["보고서명"] || "")),
  };
}

function loadTelegramConfig() {
  const text = fs.readFileSync(path.join(ROOT, "telegram_config.local.ps1"), "utf8");
  const token = text.match(/TELEGRAM_BOT_TOKEN\s*=\s*["']([^"']+)/)?.[1]?.replace(/^bot/, "");
  const chatId = text.match(/TELEGRAM_CHAT_ID\s*=\s*["']([^"']+)/)?.[1];
  if (!token || !chatId) throw new Error("Telegram config is missing.");
  return { token, chatId };
}

function sentCachePath() {
  return path.join(ROOT, ".cache", "contracts_telegram_sent.json");
}

function readSentSet() {
  try {
    return new Set(JSON.parse(fs.readFileSync(sentCachePath(), "utf8")));
  } catch {
    return new Set();
  }
}

function writeSentSet(set) {
  fs.mkdirSync(path.dirname(sentCachePath()), { recursive: true });
  fs.writeFileSync(sentCachePath(), JSON.stringify(Array.from(set).slice(-1000), null, 2), "utf8");
}

function pickRows(rows) {
  const valid = rows.filter((row) => row.amount || row.salesRatio);
  const byReceipt = new Map();
  for (const row of valid) {
    const key = row.receiptNo || `${row.date}:${row.stockCode}:${row.amount}`;
    const prev = byReceipt.get(key);
    if (!prev || (row.amount || 0) > (prev.amount || 0)) byReceipt.set(key, row);
  }
  return Array.from(byReceipt.values()).sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 7);
}

function buildMessage(date, rows, _total) {
  const lines = [];
  const titleName = rows.length > 1 ? `${rows[0]?.corpName || "공시"}등` : rows[0]?.corpName || "공시";
  lines.push(`<b>[대형수주보고공시 - ${escapeHtml(titleName)}]</b>`);
  lines.push(escapeHtml(nowKstText()));
  lines.push("");
  rows.forEach((row) => {
    if (rows.length > 1) lines.push(`<b>${escapeHtml(row.corpName)}</b>`);
    lines.push(`<b>계약금액:</b> ${escapeHtml(money(row.amount))}`);
    lines.push(`<b>매출액 대비:</b> ${escapeHtml(pct(row.salesRatio))}`);
    lines.push(`<b>계약상대방:</b> ${escapeHtml(row.counterparty || "영업비밀 보호 비공개")}`);
    lines.push(`<b>계약기간:</b> ${escapeHtml(`${formatDate(row.startDate)} ~ ${formatDate(row.endDate)}`)}`);
    lines.push(`<b>내용:</b> ${escapeHtml(row.content || row.reportName || "확인불가")}`);
    lines.push(`${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)} · <a href="${escapeHtml(row.url)}">원문 보기</a>`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

async function sendTelegram(message) {
  const { token, chatId } = loadTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram HTTP ${response.status}`);
  return body.result?.message_id;
}

async function main() {
  const data = readJson(path.join(ROOT, "site", "data", "disclosure_signals.json"));
  const rows = (data.rows || []).filter(isContract).map(normalize).filter((row) => row.corpName && row.stockCode);
  const date = dateArg || rows.map((row) => row.date).filter(Boolean).sort().at(-1);
  if (!date) throw new Error("No contract disclosure date found.");
  const normalizedDate = String(date).replace(/\D/g, "").slice(0, 8);
  if (normalizedDate < "20260902") {
    console.log(JSON.stringify({ sent: false, reason: "contract_alerts_start_from_20260902", date }, null, 2));
    return;
  }
  const dateRows = rows.filter((row) => String(row.date).replace(/\D/g, "").slice(0, 8) === normalizedDate);
  const picked = pickRows(dateRows);
  if (!picked.length) throw new Error(`${date} contract rows are empty or invalid.`);
  const message = buildMessage(date, picked, dateRows.length);
  if (dryRun) {
    console.log(message);
    return;
  }
  const sent = readSentSet();
  const keys = picked.map((row) => row.receiptNo || `${row.date}:${row.stockCode}:${row.amount}`);
  if (!force && keys.every((key) => sent.has(key))) {
    console.log(JSON.stringify({ sent: false, reason: "already_sent", date, rows: picked.length }, null, 2));
    return;
  }
  const telegramMessageId = await sendTelegram(message);
  keys.forEach((key) => sent.add(key));
  writeSentSet(sent);
  console.log(JSON.stringify({ sent: true, date, rows: picked.length, telegramMessageId }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});



