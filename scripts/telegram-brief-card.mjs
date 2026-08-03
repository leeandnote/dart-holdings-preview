import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

const reportDateArg = argValue("--date", "");
const outDir = path.resolve(argValue("--out-dir", path.join(root, ".cache", "telegram_reports")));
const siteUrl = argValue("--site-url", process.env.SITE_URL || "https://dart-holdings-preview.vercel.app/");
const send = process.argv.includes("--send");
const topN = Number(argValue("--top", argValue("--limit", "5")));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const number = Number(String(value).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

function getField(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return "";
}

function cleanDate(value) {
  return String(value || "").replace(/\D/g, "");
}

function dateText(value) {
  const text = cleanDate(value);
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : String(value || "");
}

function shortDateTitle(value) {
  const text = cleanDate(value);
  return text.length === 8 ? text.slice(2) : text;
}

function formatEok(value) {
  const raw = Number(value || 0);
  const rounded = Math.round(Math.abs(raw) / 100000000);
  const sign = raw > 0 ? "▲" : raw < 0 ? "▼" : "";
  return `${sign}${rounded.toLocaleString("ko-KR")}억원`;
}

function formatPct(value) {
  const number = parseNumber(value);
  return number === null ? "-" : `${number.toFixed(2)}%`;
}

function short(value, max = 22) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readEventPrices() {
  const filePath = path.join(root, "site", "data", "event_prices.js");
  if (!fs.existsSync(filePath)) return {};
  const text = readText(filePath).trim();
  const match = text.match(/window\.__EVENT_PRICES__\s*=\s*({[\s\S]*})\s*;?\s*$/);
  return match ? JSON.parse(match[1]) : {};
}

function readPriceChunk(code) {
  const filePath = path.join(root, "site", "data", "prices", `${code}.js`);
  if (!fs.existsSync(filePath)) return [];
  const text = readText(filePath);
  const match = text.match(/window\.__PRICE_CHUNKS__\[['"]\d+['"]\]\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function eventClose(eventPrices, row) {
  const code = String(getField(row, ["종목코드"]) || "").padStart(6, "0");
  const obligationDate = cleanDate(getField(row, ["보고의무발생일", "보고의무발생일자", "변동일"]));
  const direct = parseNumber(getField(row, ["보고의무발생일 종가", "지분변동일 종가"]));
  if (direct) return direct;
  const item = eventPrices[`${code}_${obligationDate}`] || eventPrices[`${code}-${obligationDate}`];
  return parseNumber(item?.close ?? item?.종가);
}

function estimatedAmount(row, eventPrices) {
  const close = eventClose(eventPrices, row);
  const shares = parseNumber(getField(row, ["증감주식수"]));
  if (!close || shares === null) return 0;
  return close * shares;
}

function normalizePricePoint(point) {
  if (Array.isArray(point)) {
    return { date: cleanDate(point[0]), close: parseNumber(point[4] ?? point[1]) };
  }
  return { date: cleanDate(point.date || point.Date || point.t), close: parseNumber(point.close ?? point.Close ?? point.c) };
}

function oneYearPrices(code, reportDate) {
  const end = cleanDate(reportDate);
  const endDate = end.length === 8 ? new Date(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T00:00:00+09:00`) : null;
  const startDate = endDate ? new Date(endDate.getTime() - 370 * 24 * 60 * 60 * 1000) : null;
  return readPriceChunk(code)
    .map(normalizePricePoint)
    .filter((point) => point.date && point.close !== null)
    .filter((point) => {
      if (!startDate || !endDate) return true;
      const date = new Date(`${point.date.slice(0, 4)}-${point.date.slice(4, 6)}-${point.date.slice(6, 8)}T00:00:00+09:00`);
      return date >= startDate && date <= endDate;
    });
}

function makeSparkline(points, obligationDate, amount) {
  if (points.length < 2) return `<span class="muted">-</span>`;
  const width = 150;
  const height = 34;
  const pad = 3;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const x = (index) => pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (close) => height - pad - ((close - min) / range) * (height - pad * 2);
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ");
  let markerIndex = points.findIndex((point) => String(point.date) >= cleanDate(obligationDate));
  if (markerIndex < 0) markerIndex = points.length - 1;
  const marker = points[markerIndex];
  const color = amount >= 0 ? "#e03131" : "#1f6feb";
  const lastY = y(points.at(-1).close).toFixed(1);
  return `
    <svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <line x1="${pad}" y1="${lastY}" x2="${width - pad}" y2="${lastY}" stroke="#b8c1ce" stroke-width="1" stroke-dasharray="3 4" />
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${x(markerIndex).toFixed(1)}" cy="${y(marker.close).toFixed(1)}" r="3.8" fill="#111827" stroke="#fff" stroke-width="1" />
    </svg>`;
}

function rowHtml(row, index) {
  const code = String(getField(row, ["종목코드"]) || "").padStart(6, "0");
  const corpName = getField(row, ["종목명"]);
  const market = getField(row, ["시장"]);
  const reporter = getField(row, ["보고자"]);
  const reason = getField(row, ["보고사유"]);
  const receiptDate = getField(row, ["접수일"]);
  const obligationDate = getField(row, ["보고의무발생일", "보고의무발생일자", "변동일"]);
  const amountClass = row.amount >= 0 ? "pos" : "neg";
  const prices = oneYearPrices(code, receiptDate || reportDate);

  return `
    <tr>
      <td class="rank">${index + 1}</td>
      <td>
        <div class="stock">${escapeHtml(short(corpName, 13))}</div>
        <div class="sub">${escapeHtml(code)} · ${escapeHtml(market)}</div>
      </td>
      <td>
        <div class="holder">${escapeHtml(short(reporter, 21))}</div>
        <div class="sub">${escapeHtml(short(reason, 28))}</div>
      </td>
      <td class="datepair">
        <b>${escapeHtml(dateText(obligationDate))}</b>
        <span>접수 ${escapeHtml(dateText(receiptDate))}</span>
      </td>
      <td class="amount ${amountClass}">${formatEok(row.amount)}</td>
      <td class="ratio">${formatPct(getField(row, ["직전지분율"]))} → ${formatPct(getField(row, ["이번지분율"]))}</td>
      <td>${makeSparkline(prices, obligationDate, row.amount)}</td>
    </tr>`;
}

function sectionHtml({ title, eyebrow, rows, accent }) {
  const body = rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="7" class="empty">해당 조건 없음</td></tr>`;
  return `
    <section class="section ${accent}">
      <div class="section-head">
        <div>
          <p>${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <span>${rows.length ? `Top ${rows.length}` : "-"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th style="width:150px">종목명</th>
            <th style="width:245px">주주/제출인</th>
            <th style="width:140px">보고의무발생일</th>
            <th style="width:135px;text-align:right">추정변동금액</th>
            <th style="width:150px;text-align:center">지분변동사항</th>
            <th style="width:165px">1년 추이</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

const latest = readJson(path.join(root, "site", "data", "latest.json"));
const eventPrices = readEventPrices();
const allRows = Array.isArray(latest.rows) ? latest.rows : [];
const reportDate = reportDateArg || allRows.map((row) => cleanDate(getField(row, ["접수일"]))).filter(Boolean).sort().at(-1);
const rows = allRows
  .filter((row) => cleanDate(getField(row, ["접수일"])) === cleanDate(reportDate))
  .map((row) => ({ ...row, amount: estimatedAmount(row, eventPrices) }));

const buyRows = rows
  .filter((row) => row.amount > 0)
  .sort((a, b) => b.amount - a.amount)
  .slice(0, topN);

const sellRows = rows
  .filter((row) => row.amount < 0)
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  .slice(0, topN);

const newFiveRows = rows
  .filter((row) => {
    const previous = parseNumber(getField(row, ["직전지분율"]));
    const current = parseNumber(getField(row, ["이번지분율"]));
    const crossed = String(getField(row, ["5퍼센트상향돌파"])) === "Y";
    return crossed || (previous !== null && current !== null && previous < 5 && current >= 5);
  })
  .sort((a, b) => parseNumber(getField(b, ["이번지분율"])) - parseNumber(getField(a, ["이번지분율"])))
  .slice(0, topN);

const logoPath = path.join(root, "site", "assets", "leeandnote-mark.png");
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: Pretendard;
    src: url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2") format("woff2");
    font-weight: 400;
  }
  @font-face {
    font-family: Pretendard;
    src: url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2") format("woff2");
    font-weight: 700;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f5f8; color: #101828; font-family: Pretendard, Arial, sans-serif; }
  .sheet { width: 1280px; height: 1280px; padding: 38px 54px 34px; background: #fff; }
  .topline { height: 8px; background: linear-gradient(90deg, #FA4905 0%, #FA4905 38%, #111827 38%, #111827 100%); margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; color: #FA4905; font-size: 13px; font-weight: 800; letter-spacing: .08em; }
  .brand img { width: 34px; height: 34px; border-radius: 50%; }
  h1 { margin: 12px 0 8px; font-size: 34px; line-height: 1.08; letter-spacing: 0; }
  .subtitle { color: #667085; font-size: 16px; font-weight: 700; }
  .intro { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 20px; }
  .note { color: #98a2b3; font-size: 12px; font-weight: 700; text-align: right; }
  .section { border-top: 4px solid #111827; margin-top: 18px; }
  .section.buy { border-top-color: #FA4905; }
  .section.sell { border-top-color: #1f6feb; }
  .section.new5 { border-top-color: #111827; }
  .section-head { display: flex; justify-content: space-between; align-items: end; padding: 12px 0 8px; border-bottom: 1px solid #111827; }
  .section-head p { margin: 0 0 4px; color: #FA4905; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
  .section-head h2 { margin: 0; font-size: 21px; letter-spacing: 0; }
  .section-head span { color: #667085; font-size: 12px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th { padding: 8px 10px; border-bottom: 1px solid #d9e0ea; color: #475467; font-size: 11px; font-weight: 800; text-align: left; }
  tbody td { height: 46px; padding: 6px 10px; border-bottom: 1px solid #e4e9f1; vertical-align: middle; font-size: 14px; font-weight: 800; }
  .rank { color: #667085; text-align: center; }
  .stock, .holder { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .sub { margin-top: 2px; color: #667085; font-size: 10.5px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .datepair b { display: block; font-size: 12px; }
  .datepair span { display: block; margin-top: 2px; color: #667085; font-size: 10.5px; font-weight: 700; }
  .amount { text-align: right; font-size: 15px; white-space: nowrap; }
  .pos { color: #e03131; }
  .neg { color: #1f6feb; }
  .ratio { text-align: center; white-space: nowrap; font-size: 14px; }
  .spark { display: block; }
  .muted, .empty { color: #98a2b3; font-size: 12px; font-weight: 700; }
  .empty { height: 44px; text-align: center; }
  .foot { display: flex; justify-content: space-between; gap: 20px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #d9e0ea; color: #667085; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
  <main class="sheet">
    <div class="topline"></div>
    <div class="intro">
      <div>
        <div class="brand"><img src="${pathToFileURL(logoPath).href}" alt="">LEE&NOTE DISCLOSURE BRIEF</div>
        <h1>${shortDateTitle(reportDate)} 리앤노트 대량보유 변동 브리프</h1>
        <div class="subtitle">접수일 ${dateText(reportDate)} · DART 대량보유 공시를 매수·매도·신규 5% 진입으로 재분류</div>
      </div>
      <div class="note">보고의무발생일 기준 가격·지분 변동을 함께 표시합니다.</div>
    </div>
    ${sectionHtml({ title: "매수성 변동 Top", eyebrow: "ESTIMATED BUY FLOW", rows: buyRows, accent: "buy" })}
    ${sectionHtml({ title: "매도성 변동 Top", eyebrow: "ESTIMATED SELL FLOW", rows: sellRows, accent: "sell" })}
    ${sectionHtml({ title: "신규 5% 진입", eyebrow: "NEW 5% THRESHOLD", rows: newFiveRows, accent: "new5" })}
    <div class="foot">
      <span>자료: DART 대량보유상황보고서, 가격 캐시. 추정변동금액은 보고의무발생일 종가와 증감주식수 기반입니다.</span>
      <span>${escapeHtml(siteUrl.replace(/\/$/, ""))}</span>
    </div>
  </main>
</body>
</html>`;

fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, `leeandnote_brief_${reportDate}.html`);
const imagePath = path.join(outDir, `leeandnote_brief_${reportDate}.png`);
fs.writeFileSync(htmlPath, html, "utf8");

const bundledModules = "C:\\Users\\user\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const requireFromBundle = fs.existsSync(bundledModules)
  ? createRequire(path.join(bundledModules, "package.json"))
  : createRequire(import.meta.url);
const { chromium } = requireFromBundle("playwright");
const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-gpu", "--disable-dev-shm-usage"] });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1280 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.screenshot({ path: imagePath, fullPage: false });
} finally {
  await browser.close();
}

if (send) {
  const rawToken = argValue("--bot-token", process.env.TELEGRAM_BOT_TOKEN || "");
  const token = rawToken.startsWith("bot") ? rawToken : `bot${rawToken}`;
  const chatId = argValue("--chat-id", process.env.TELEGRAM_CHAT_ID || "@leeandnote");
  if (!rawToken || !chatId) throw new Error("Telegram bot token or chat id is missing.");

  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", `[${shortDateTitle(reportDate)} 리앤노트 대량보유 변동 브리프]\n매수·매도·신규 5% 진입 핵심 표 이미지입니다.\n${siteUrl.replace(/\/$/, "")}`);
  form.set("photo", new Blob([fs.readFileSync(imagePath)], { type: "image/png" }), path.basename(imagePath));

  const res = await fetch(`https://api.telegram.org/${token}/sendPhoto`, { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(JSON.stringify(json));
}

console.log(JSON.stringify({ reportDate: dateText(reportDate), imagePath, htmlPath, sent: send }, null, 2));
