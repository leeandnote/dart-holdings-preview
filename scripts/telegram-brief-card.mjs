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
const limit = Number(argValue("--limit", "10"));

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

function dateText(value) {
  const text = String(value || "").replace(/\D/g, "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}

function shortDateTitle(value) {
  const text = String(value || "").replace(/\D/g, "");
  return text.length === 8 ? text.slice(2) : text.replaceAll("-", "").slice(2);
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
  const code = String(row["종목코드"] || "").padStart(6, "0");
  const obligationDate = String(row["보고의무발생일"] || "");
  const direct = parseNumber(row["보고의무발생일 종가"]);
  if (direct) return direct;
  const item = eventPrices[`${code}_${obligationDate}`] || eventPrices[`${code}-${obligationDate}`];
  return parseNumber(item?.close ?? item?.종가);
}

function estimatedAmount(row, eventPrices) {
  const close = eventClose(eventPrices, row);
  const shares = parseNumber(row["증감주식수"]);
  if (!close || shares === null) return 0;
  return close * shares;
}

function normalizePricePoint(point) {
  if (Array.isArray(point)) {
    return {
      date: String(point[0] || "").replace(/\D/g, ""),
      close: parseNumber(point[4] ?? point[1]),
    };
  }
  return {
    date: String(point.date || point.Date || point.t || "").replace(/\D/g, ""),
    close: parseNumber(point.close ?? point.Close ?? point.c),
  };
}

function oneYearPrices(code, reportDate) {
  const end = String(reportDate || "");
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
  if (points.length < 2) return `<span class="muted">가격 이력 없음</span>`;
  const width = 210;
  const height = 52;
  const pad = 4;
  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const x = (index) => pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (close) => height - pad - ((close - min) / range) * (height - pad * 2);
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ");
  let markerIndex = points.findIndex((point) => String(point.date) >= String(obligationDate || ""));
  if (markerIndex < 0) markerIndex = points.length - 1;
  const marker = points[markerIndex];
  const color = amount >= 0 ? "#e03131" : "#1f6feb";
  const lastY = y(points.at(-1).close).toFixed(1);
  return `
    <svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="1년 가격 추이">
      <line x1="${pad}" y1="${lastY}" x2="${width - pad}" y2="${lastY}" stroke="#b8c1ce" stroke-width="1" stroke-dasharray="3 4" />
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${x(markerIndex).toFixed(1)}" cy="${y(marker.close).toFixed(1)}" r="4.5" fill="#111827" stroke="#fff" stroke-width="1.4" />
    </svg>`;
}

const latest = readJson(path.join(root, "site", "data", "latest.json"));
const eventPrices = readEventPrices();
const allRows = Array.isArray(latest.rows) ? latest.rows : [];
const reportDate = reportDateArg || allRows.map((row) => String(row["접수일"] || "")).sort().at(-1);
const rows = allRows
  .filter((row) => String(row["접수일"] || "") === String(reportDate))
  .map((row) => ({ ...row, amount: estimatedAmount(row, eventPrices) }))
  .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

const topRows = rows.slice(0, limit);
const buyTotal = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
const sellTotal = rows.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);

const logoPath = path.join(root, "site", "assets", "leeandnote-mark.png");
const tableRows = topRows
  .map((row, index) => {
    const code = String(row["종목코드"] || "").padStart(6, "0");
    const amountClass = row.amount >= 0 ? "pos" : "neg";
    const prices = oneYearPrices(code, reportDate);
    return `
      <tr>
        <td class="rank">${index + 1}</td>
        <td>
          <div class="stock">${escapeHtml(short(row["종목명"], 14))}</div>
          <div class="sub">${escapeHtml(code)} · ${escapeHtml(row["시장"] || "")}</div>
        </td>
        <td>
          <div class="holder">${escapeHtml(short(row["보고자"], 23))}</div>
          <div class="sub">${escapeHtml(short(row["보고사유"], 32))}</div>
        </td>
        <td class="amount ${amountClass}">${formatEok(row.amount)}</td>
        <td class="ratio">${formatPct(row["직전지분율"])} → ${formatPct(row["이번지분율"])}</td>
        <td>${makeSparkline(prices, row["보고의무발생일"], row.amount)}</td>
      </tr>`;
  })
  .join("");

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
  body {
    margin: 0;
    background: #f3f5f8;
    color: #111827;
    font-family: Pretendard, Arial, sans-serif;
  }
  .sheet {
    width: 1280px;
    height: 980px;
    padding: 42px 54px 34px;
    background: #ffffff;
  }
  .topline {
    height: 8px;
    background: linear-gradient(90deg, #FA4905 0%, #FA4905 42%, #111827 42%, #111827 100%);
    margin-bottom: 26px;
  }
  .header {
    display: grid;
    grid-template-columns: 1fr 410px;
    gap: 30px;
    align-items: start;
    margin-bottom: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #FA4905;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .brand img {
    width: 34px;
    height: 34px;
    border-radius: 50%;
  }
  h1 {
    margin: 14px 0 10px;
    font-size: 36px;
    line-height: 1.08;
    letter-spacing: 0;
  }
  .subtitle {
    color: #667085;
    font-size: 17px;
    font-weight: 600;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .metric {
    border: 1px solid #d8dee8;
    border-top: 4px solid #111827;
    padding: 14px 14px 15px;
    min-height: 88px;
  }
  .metric.buy { border-top-color: #FA4905; }
  .metric.sell { border-top-color: #1f6feb; }
  .metric small {
    display: block;
    color: #667085;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 13px;
  }
  .metric b {
    display: block;
    font-size: 23px;
    line-height: 1.1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border-top: 2px solid #111827;
  }
  thead th {
    padding: 13px 12px;
    border-bottom: 1px solid #111827;
    color: #111827;
    font-size: 13px;
    font-weight: 800;
    text-align: left;
  }
  tbody td {
    height: 62px;
    padding: 8px 12px;
    border-bottom: 1px solid #d9e0ea;
    vertical-align: middle;
    font-size: 16px;
    font-weight: 700;
  }
  .rank {
    color: #667085;
    font-size: 15px;
    font-weight: 800;
    text-align: center;
  }
  .stock,
  .holder {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .sub {
    margin-top: 4px;
    color: #667085;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .amount {
    text-align: right;
    font-size: 18px;
  }
  .pos { color: #e03131; }
  .neg { color: #1f6feb; }
  .ratio {
    text-align: center;
    font-size: 16px;
    white-space: nowrap;
  }
  .spark {
    display: block;
  }
  .muted {
    color: #98a2b3;
    font-size: 13px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #d9e0ea;
    color: #667085;
    font-size: 12px;
    font-weight: 700;
  }
</style>
</head>
<body>
  <main class="sheet">
    <div class="topline"></div>
    <section class="header">
      <div>
        <div class="brand"><img src="${pathToFileURL(logoPath).href}" alt="">LEE&NOTE DISCLOSURE BRIEF</div>
        <h1>${shortDateTitle(reportDate)} 리앤노트 일일 공시 업데이트</h1>
        <div class="subtitle">접수일 ${dateText(reportDate)} · 대량보유 공시 ${rows.length.toLocaleString("ko-KR")}건 · 추정 변동금액 절대값 기준 주요 종목</div>
      </div>
      <div class="metrics">
        <div class="metric"><small>DISCLOSURES</small><b>${rows.length.toLocaleString("ko-KR")}건</b></div>
        <div class="metric buy"><small>EST. BUY</small><b>${formatEok(buyTotal)}</b></div>
        <div class="metric sell"><small>EST. SELL</small><b>${formatEok(sellTotal)}</b></div>
      </div>
    </section>
    <table>
      <thead>
        <tr>
          <th style="width:42px">#</th>
          <th style="width:170px">종목명</th>
          <th style="width:245px">주주/제출인</th>
          <th style="width:150px;text-align:right">추정변동금액</th>
          <th style="width:175px;text-align:center">지분변동사항</th>
          <th style="width:230px">1년 선형 추이</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
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
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--disable-gpu", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 }, deviceScaleFactor: 1 });
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
  form.set("caption", `[${shortDateTitle(reportDate)} 리앤노트 일일 공시 업데이트]\n주요 지분변동 표 이미지입니다.\n${siteUrl.replace(/\/$/, "")}`);
  form.set("photo", new Blob([fs.readFileSync(imagePath)], { type: "image/png" }), path.basename(imagePath));

  const res = await fetch(`https://api.telegram.org/${token}/sendPhoto`, { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(JSON.stringify(json));
}

console.log(JSON.stringify({ reportDate: dateText(reportDate), imagePath, htmlPath, sent: send }, null, 2));
