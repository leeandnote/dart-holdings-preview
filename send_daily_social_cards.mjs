import { copyFile, mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { renderYouTubeShort, uploadYouTubeShort } from "./youtube_short.mjs";

const ROOT = process.cwd();
const CONVEX_URL = "https://gregarious-lemming-92.convex.cloud";
const ymd = (process.argv[2] || kstYmd()).replace(/\D/g, "").slice(0, 8);
const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const dotted = `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
const dryRun = process.argv.includes("--dry-run");
const keep = process.argv.includes("--keep");
const skipTelegram = process.argv.includes("--skip-telegram");
const channelOnly = process.argv.includes("--channel") || process.argv.includes("--channel-only");
const xOnly = process.argv.includes("--x-only");
const threadsOnly = process.argv.includes("--threads-only");
const instagramOnly = process.argv.includes("--instagram-only");
const youtubeOnly = process.argv.includes("--youtube-only");
const postX = process.argv.includes("--x") || process.argv.includes("--post-x") || xOnly;
const postThreads = process.argv.includes("--threads") || process.argv.includes("--post-threads") || threadsOnly;
const postInstagram = process.argv.includes("--instagram") || process.argv.includes("--post-instagram") || instagramOnly;
const postYouTube = process.argv.includes("--youtube") || process.argv.includes("--post-youtube") || youtubeOnly;
const showXCaptions = process.argv.includes("--show-x-captions");
const contractDataArg = process.argv.find((arg) => arg.startsWith("--contract-data="));
const executiveDataArg = process.argv.find((arg) => arg.startsWith("--executive-data="));
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyKinds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((kind) => kind.trim()).filter(Boolean)) : null;
const replyToArg = process.argv.find((arg) => arg.startsWith("--reply-to="));
const initialReplyTo = replyToArg ? replyToArg.slice("--reply-to=".length).trim() : "";
const xThread = process.argv.includes("--x-thread") || Boolean(initialReplyTo);
const xSeparate = process.argv.includes("--x-separate") || xThread;
const X_CONFIG_PATH = path.join(ROOT, "x_config.local.ps1");
const META_CONFIG_PATH = path.join(ROOT, "meta_config.local.ps1");
let xConfigCache = null;

function kstYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

async function convexQuery(queryPath, args = {}) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: queryPath, args, format: "json" }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "success") throw new Error(payload.errorMessage || `Convex query failed: ${queryPath}`);
  return payload.value || [];
}

function n(value) {
  if (value === null || value === undefined) return null;
  const num = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const num = n(value);
    if (num !== null) return num;
  }
  return null;
}

function pct(value) {
  const num = n(value);
  if (num === null) return "-";
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function sharesText(value) {
  const num = n(value);
  if (num === null) return "-";
  if (num === 0) return "0주";
  return `${num > 0 ? "+" : "-"}${Math.abs(Math.round(num)).toLocaleString("ko-KR")}주`;
}

function isNeutralOwnershipReason(reason) {
  const text = String(reason || "");
  return /담보|질권|계약변경|주식담보|대여|차입|반환|공동보유|특별관계/.test(text) && !/장내매수|장외매수|매수|취득|장내매도|장외매도|매도|처분/.test(text);
}

function isTradeLikeOwnershipReason(reason) {
  return /장내매수|장외매수|매수|취득|장내매도|장외매도|매도|처분/.test(String(reason || ""));
}

function moneyEok(value) {
  const num = n(value);
  if (num === null || num === 0) return "-";
  const eok = Math.round(Math.abs(num) / 100000000);
  return `${num > 0 ? "+" : "-"}${eok.toLocaleString("ko-KR")}억`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanReason(value) {
  return String(value || "기타 사유").replace(/\s+/g, " ").replace(/^- /, "").slice(0, 34);
}

function compactPoint(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/전환사채|CB|BW/i.test(text)) return "CB/BW";
  if (/장내매수|매수/.test(text)) return "매수";
  if (/장내매도|매도/.test(text)) return "매도";
  if (/담보|질권/.test(text)) return "담보";
  if (/신규/.test(text)) return "신규";
  if (/상속|증여/.test(text)) return "상속/증여";
  if (/특별관계|특수관계/.test(text)) return "특관계";
  if (/보유비율/.test(text)) return "비율변동";
  return text.length > 12 ? `${text.slice(0, 11)}…` : text;
}

function reporterMeta(row, kind) {
  if (kind === "executive") {
    if (row.plannedTrade) return `거래계획 · ${sharesText(row.shareDelta)}`;
    return row.reporterType || "";
  }
  return [row.reporterType, compactPoint(row.reason)].filter(Boolean).join(" · ");
}

function saneAmount(value) {
  const num = n(value);
  return num !== null && Math.abs(num) >= 1000000 ? num : null;
}

function saneRatio(value) {
  const num = n(value);
  return num !== null && num >= 0 && num <= 10000 ? num : null;
}

function contractMoneyEok(value) {
  const num = saneAmount(value);
  if (num === null) return "-";
  return `${Math.round(num / 100000000).toLocaleString("ko-KR")}억원`;
}

function contractRatioText(value) {
  const num = saneRatio(value);
  if (num === null) return "-";
  const rounded = Math.round(num * 10) / 10;
  return `${rounded.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function cleanContractText(value, max = 44) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function rowModel(row) {
  const prev = n(row.previousRate);
  const cur = n(row.currentRate);
  const delta = n(row.rateDelta);
  const reason = cleanReason(row.reason);
  const previousShares = firstNumber(row.previousShares, row.prevShares, row.previousStockCount, row.beforeShares);
  const currentShares = firstNumber(row.currentShares, row.curShares, row.currentStockCount, row.afterShares);
  let shareDelta = firstNumber(row.shareDelta, row.deltaShares, row.shareChange, row.changedShares, row.stockDelta);
  if (currentShares === 0 && cur !== null && cur > 0) {
    shareDelta = null;
  } else if (previousShares !== null && currentShares !== null) {
    shareDelta = currentShares - previousShares;
  }
  const value = n(row.buyTradeValue) ?? (isTradeLikeOwnershipReason(reason) && !isNeutralOwnershipReason(reason) ? n(row.tradeValue) : null) ?? 0;
  return {
    name: row.corpName || "-",
    code: row.stockCode || "-",
    market: row.market || "-",
    reporter: row.reporter || "-",
    reporterType: row.reporterType || "확인필요",
    prev,
    cur,
    delta,
    rateText: `${pct(prev)} → ${pct(cur)}`,
    deltaText: delta === null ? "-" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : ""}${pct(Math.abs(delta))}%p`,
    deltaClass: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    shareDelta,
    shareDeltaText: sharesText(shareDelta),
    value,
    reason,
    reportName: row.reportName || "",
    plannedTrade: Boolean(row.plannedTrade) || /거래계획보고서/.test(String(row.reportName || "")),
    receiptNo: row.receiptNo || "",
  };
}

function uniqueRows(rows, limit = 5) {
  const seen = new Set();
  const picked = [];
  for (const row of rows) {
    const key = `${row.code}:${row.reporter}`;
    if (seen.has(key) || row.name === "-") continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}

function scoreAbsShares(row) {
  return Math.abs(row.shareDelta ?? 0) + Math.abs(row.value ?? 0) / 10000 + Math.abs(row.delta ?? 0) * 1000;
}

function hasUsefulSignal(row) {
  return Math.abs(row.shareDelta ?? 0) > 0 || Math.abs(row.value ?? 0) > 0 || Math.abs(row.delta ?? 0) >= 0.05;
}

function isPriorityGlobalInstitution(row) {
  return /블랙록|blackrock|모건스탠리|morgan\s*stanley|jp\s*모건|제이피\s*모건|j\.?p\.?\s*morgan/i.test(`${row.reporter} ${row.reporterType}`);
}

function pickFive(rows) {
  const newEntries = rows.filter((r) => (r.prev ?? 0) < 5 && (r.cur ?? 0) >= 5).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const priorityInstitutions = rows.filter((r) => isPriorityGlobalInstitution(r) && hasUsefulSignal(r)).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const institutions = rows.filter((r) => /JP|J\.P|제이피|모건|블랙록|국민연금|연기금|자산운용|투자신탁|투자자문|Vanguard|BlackRock|Morgan|Capital|Fidelity|트러스톤|VIP|브이아이피/i.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const increases = rows.filter((r) => (r.delta ?? 0) > 0 || (r.shareDelta ?? 0) > 0).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const decreases = rows.filter((r) => (r.delta ?? 0) < 0 || (r.shareDelta ?? 0) < 0).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const flow = rows.filter((r) => Math.abs(r.value || 0) > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const priorityRows = [...priorityInstitutions.slice(0, 2), ...newEntries, ...institutions, ...increases, ...decreases, ...flow].filter(hasUsefulSignal);
  return uniqueRows(priorityRows.length ? priorityRows : rows, 5).map((row) => ({ ...row, topic: topicForFive(row) }));
}

function topicForFive(row) {
  if ((row.prev ?? 0) < 5 && (row.cur ?? 0) >= 5) return "신규 5%";
  if (/JP|J\.P|제이피|모건|블랙록|국민연금|연기금|자산운용|투자신탁|투자자문/i.test(`${row.reporter} ${row.reporterType}`)) return "기관";
  if ((row.delta ?? 0) > 0 || (row.shareDelta ?? 0) > 0) return "확대";
  if ((row.delta ?? 0) < 0 || (row.shareDelta ?? 0) < 0) return "축소";
  return "주요";
}

function pickExecutive(rows) {
  const plannedTrades = rows.filter((r) => r.plannedTrade).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const increases = rows.filter((r) => (r.delta ?? 0) > 0 || (r.shareDelta ?? 0) > 0).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const decreases = rows.filter((r) => (r.delta ?? 0) < 0 || (r.shareDelta ?? 0) < 0).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const insiders = rows.filter((r) => /오너|특수관계|대표|이사|상무|전무|사장|회장|주요주주|개인/i.test(`${r.reporter} ${r.reporterType}`)).sort((a, b) => scoreAbsShares(b) - scoreAbsShares(a));
  const flow = rows.filter((r) => Math.abs(r.value || 0) > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const priorityRows = [...plannedTrades, ...increases, ...decreases, ...insiders, ...flow].filter(hasUsefulSignal);
  return uniqueRows(priorityRows.length ? priorityRows : rows, 5).map((row) => ({ ...row, topic: topicForExecutive(row) }));
}

function topicForExecutive(row) {
  if (row.plannedTrade) return "거래계획";
  if ((row.delta ?? 0) > 0 || (row.shareDelta ?? 0) > 0) return "증가";
  if ((row.delta ?? 0) < 0 || (row.shareDelta ?? 0) < 0) return "감소";
  if (/주요주주/i.test(`${row.reporter} ${row.reporterType}`)) return "주요주주";
  return "임원";
}

async function loadExtraExecutiveRows() {
  const filePath = executiveDataArg
    ? path.resolve(executiveDataArg.slice("--executive-data=".length))
    : path.join(ROOT, "site", "data", "executive_overrides", `${ymd}.json`);
  if (!existsSync(filePath)) return [];
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(payload) ? payload : (payload.rows || []);
}

async function loadContractRows() {
  const filePath = contractDataArg ? path.resolve(contractDataArg.slice("--contract-data=".length)) : path.join(ROOT, "site", "data", "disclosure_signals.json");
  if (!existsSync(filePath)) return [];
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  return (payload.rows || []).filter((row) => {
    const type = String(row["공시유형"] || "");
    const date = String(row["접수일"] || "").replace(/\D/g, "").slice(0, 8);
    return type === "단일판매·공급계약" && date === ymd;
  });
}

function pickContracts(rows) {
  const valid = rows
    .map((row) => ({
      name: row["종목명"],
      code: row["종목코드"],
      market: row["시장"],
      amount: saneAmount(row["계약금액"]),
      ratio: saneRatio(row["매출대비비율"]),
      party: cleanContractText(row["계약상대방"] || "영업비밀 보호 비공개", 24),
      content: cleanContractText(row["계약내용"] || row["보고서명"], 42),
    }))
    .filter((row) => row.name && row.code && (row.amount !== null || row.ratio !== null));

  const seen = new Set();
  const unique = [];
  for (const row of valid.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))) {
    const key = `${row.code}:${row.party}:${row.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= 5) break;
  }
  return unique;
}

function cardHtml({ kind, title, subtitle, rows, total }) {
  const accent = kind === "executive" ? "#8c7bd8" : "#ff6b35";
  const soft = kind === "executive" ? "#f4f2ff" : "#fff2ed";
  const label = kind === "executive" ? "EXECUTIVE REPORT" : "5% REPORT";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1080px;height:1920px;background:#f7f5f2;font-family:"Noto Sans CJK KR",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}
    .card{position:relative;width:1080px;height:1920px;padding:214px 74px 168px;overflow:hidden;background:linear-gradient(180deg,#faf8f5 0%,#ffffff 54%,#f8fafc 100%)}
    .orb{position:absolute;right:-126px;top:252px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle at 38% 36%,${soft},${accent}66 52%,transparent 70%);opacity:.78}
    .orbit{position:absolute;right:26px;top:392px;width:600px;height:174px;border:2px solid ${accent}33;border-radius:50%;transform:rotate(-13deg)}
    .dots{position:absolute;inset:0;background-image:radial-gradient(#cbd5e1 1.2px,transparent 1.2px);background-size:34px 34px;opacity:.30}
    header{position:relative;z-index:2;margin-bottom:54px}.meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:34px}.date{font-size:35px;font-weight:900;color:${accent}}.brand{font-size:30px;font-weight:900;color:#57534e;letter-spacing:0}.kicker{display:inline-flex;padding:11px 17px;border:1px solid ${accent}55;border-radius:999px;background:${soft};color:${accent};font-size:23px;font-weight:900}.title{margin:23px 0 0;font-size:56px;line-height:1.12;letter-spacing:0;font-weight:950;color:#0f172a}.subtitle{margin-top:18px;font-size:23px;line-height:1.35;color:#647085;font-weight:780;max-width:none;white-space:nowrap}
    .panel{position:relative;z-index:2;border:1px solid #d8dee8;border-radius:28px;background:rgba(255,255,255,.95);overflow:hidden;box-shadow:0 28px 80px rgba(15,23,42,.09)}
    .panelHead{display:flex;align-items:center;justify-content:space-between;padding:25px 30px;border-bottom:1px solid #e5eaf0}.panelHead strong{font-size:28px}.panelHead span{font-size:20px;color:#64748b;font-weight:800}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th{height:64px;background:#f8fafc;color:#64748b;font-size:20px;font-weight:900;border-bottom:1px solid #e5eaf0}td{height:172px;padding:20px 18px;border-bottom:1px solid #edf1f5;text-align:center;vertical-align:middle;font-size:24px;line-height:1.28;font-weight:620;color:#172033;overflow:hidden}tr:last-child td{border-bottom:0}.name{display:block;font-size:31px;font-weight:950;color:${accent}}.sub{display:block;margin:8px auto 0;font-size:18px;font-weight:740;color:#738096}.reporter{display:block;max-width:100%;margin:0 auto;font-size:24px;font-weight:860;color:#111827}.reporter,.sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rateMain{font-size:31px;font-weight:940}.up{display:inline-block;margin-top:8px;color:#ef3b2d;font-size:22px;font-weight:920}.down{display:inline-block;margin-top:8px;color:#2563eb;font-size:22px;font-weight:920}.flat{display:inline-block;margin-top:8px;color:#64748b;font-size:22px;font-weight:900}.note{position:relative;z-index:2;margin:22px 0 0;color:#8b95a1;font-size:19px;line-height:1.55;font-weight:700}.source{position:relative;z-index:2;margin-top:18px;text-align:right;color:#a6adb8;font-size:17px;font-weight:800}
    col:nth-child(1){width:31%}col:nth-child(2){width:29%}col:nth-child(3){width:40%}
  </style></head><body><main class="card"><div class="dots"></div><div class="orb"></div><div class="orbit"></div><header><div class="meta"><div class="date">${dotted}</div><div class="brand">LEE &amp; NOTE</div></div><span class="kicker">${label}</span><h1 class="title">${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></header><section class="panel"><div class="panelHead"><strong>Daily DART 요약표</strong><span>총 ${total.toLocaleString("ko-KR")}건 중 핵심 ${rows.length}건</span></div><table><colgroup><col/><col/><col/></colgroup><thead><tr><th>종목</th><th>지분 변화</th><th>제출인</th></tr></thead><tbody>${rows.map((r)=>`<tr><td><span class="name">${esc(r.name)}</span><span class="sub">${esc(r.code)} · ${esc(r.market)}</span></td><td><strong class="rateMain">${esc(r.rateText)}</strong><br><span class="${r.deltaClass}">${esc(r.deltaText)}</span></td><td><span class="reporter">${esc(r.reporter)}</span><span class="sub">${esc(reporterMeta(r, kind))}</span></td></tr>`).join("")}</tbody></table></section><p class="note">공시 원문과 제출인 성격을 빠르게 비교하기 위한 요약 자료입니다. 특정 종목의 매수·매도 추천이 아닙니다.</p><div class="source">출처: DART 전자공시</div></main></body></html>`;
}

function contractCardHtml({ rows, total }) {
  const tableRows = rows.map((row) => `
    <tr>
      <td><strong class="stock">${esc(row.name)}</strong><span>${esc(row.code)} · ${esc(row.market)}</span></td>
      <td class="amount"><b>${esc(contractMoneyEok(row.amount))}</b><span>매출액 대비 ${esc(contractRatioText(row.ratio))}</span><i><em style="width:${Math.min(100, row.ratio || 0)}%"></em></i></td>
      <td><strong>${esc(row.party)}</strong><span>${esc(row.content)}</span></td>
    </tr>
  `).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1080px;height:1920px;background:#f8f6f3;font-family:"Noto Sans CJK KR",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101827}
    .card{position:relative;width:1080px;height:1920px;overflow:hidden;padding:214px 72px 168px;background:linear-gradient(180deg,#fbfaf8 0%,#fff 55%,#f7fafc 100%)}
    .dots{position:absolute;inset:0;background-image:radial-gradient(#d5dbe4 1.15px,transparent 1.15px);background-size:34px 34px;opacity:.24}
    .planet{position:absolute;right:-116px;top:250px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle at 35% 32%,#fff4ed 0%,#8fd8cc 48%,#5f9d97 82%);opacity:.72;box-shadow:0 36px 120px rgba(15,23,42,.10), inset -40px -50px 70px rgba(93,54,46,.14)}
    .orbit{position:absolute;right:28px;top:394px;width:610px;height:178px;border:2px solid rgba(15,159,143,.22);border-radius:50%;transform:rotate(-12deg)}
    header{position:relative;z-index:2;margin-bottom:54px}.meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:34px}.date{color:#0f9f8f;font-size:35px;font-weight:900}.brand{color:#5b5f67;font-size:30px;font-weight:900}
    .kicker{display:inline-flex;padding:11px 17px;border:1px solid rgba(15,159,143,.30);border-radius:999px;background:#e9fbf7;color:#0f9f8f;font-size:23px;font-weight:900}.title{margin:23px 0 0;font-size:56px;line-height:1.12;font-weight:950;letter-spacing:0;color:#0f172a}.subtitle{width:930px;margin:18px 0 0;color:#647085;font-size:23px;line-height:1.35;font-weight:780;white-space:nowrap}
    .panel{position:relative;z-index:2;border:1px solid #dbe2ec;border-radius:28px;background:rgba(255,255,255,.96);overflow:hidden;box-shadow:0 28px 90px rgba(15,23,42,.08)}.panelHead{display:flex;justify-content:space-between;align-items:center;padding:25px 30px;border-bottom:1px solid #e7ebf1}.panelHead strong{font-size:24px}.panelHead span{color:#647085;font-size:17px;font-weight:800}
    .panelHead strong{font-size:28px}.panelHead span{font-size:20px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th{height:64px;background:#f8fafc;color:#6b7688;font-size:20px;font-weight:900;border-bottom:1px solid #e5eaf0}td{height:172px;padding:20px 18px;text-align:center;vertical-align:middle;border-bottom:1px solid #eef2f6;font-size:24px;line-height:1.28;font-weight:640;overflow:hidden}tr:last-child td{border-bottom:0}.stock{display:block;color:#0f9f8f;font-size:31px;font-weight:950}td span{display:block;margin-top:8px;color:#778397;font-size:18px;font-weight:740;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}td b{font-size:29px;font-weight:930}.amount span{font-size:20px;color:#64748b}.panel td:nth-child(3){text-align:left}.panel td:nth-child(3) strong{display:block;color:#172033;font-size:24px;font-weight:880;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.panel td:nth-child(3) span{font-size:18px;line-height:1.38}i{display:block;width:150px;height:10px;margin:11px auto 0;border-radius:999px;background:#edf1f6;overflow:hidden}i em{display:block;height:100%;border-radius:999px;background:#0f9f8f}
    .note{position:absolute;left:72px;right:72px;bottom:236px;color:#8b95a1;font-size:17px;line-height:1.55;font-weight:700}.source{position:absolute;right:72px;bottom:186px;color:#a5adb8;font-size:15px;font-weight:800}
    col:nth-child(1){width:31%}col:nth-child(2){width:29%}col:nth-child(3){width:40%}
  </style></head><body><main class="card"><div class="dots"></div><div class="planet"></div><div class="orbit"></div><header><div class="meta"><div class="date">${dotted}</div><div class="brand">LEE &amp; NOTE</div></div><span class="kicker">CONTRACT REPORT</span><h1 class="title">${dotted} 주요 대형수주보고</h1><p class="subtitle">계약금액과 매출 대비 비중이 눈에 띄는 수주 공시를 정리했습니다.</p></header><section class="panel"><div class="panelHead"><strong>Daily DART 요약표</strong><span>총 ${total.toLocaleString("ko-KR")}건 중 핵심 ${rows.length}건</span></div><table><colgroup><col><col><col></colgroup><thead><tr><th>종목</th><th>계약금액<br>(매출액 대비)</th><th>계약상대방 / 내용</th></tr></thead><tbody>${tableRows}</tbody></table></section><p class="note">공시 원문과 제출인 성격을 빠르게 비교하기 위한 요약 자료입니다. 특정 종목의 매수·매도 추천이 아닙니다.</p><div class="source">출처: DART 전자공시</div></main></body></html>`;
}
function chromePath() {
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome or Edge was not found for PNG rendering.");
  return found;
}

async function renderPng(html, outDir, name) {
  const htmlPath = path.join(outDir, `${name}.html`);
  const pngPath = path.join(outDir, `${name}.png`);
  await writeFile(htmlPath, html, "utf8");
  const result = spawnSync(chromePath(), [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1080,1920",
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(pngPath)) throw new Error(`PNG render failed: ${result.stderr || result.stdout}`);
  return pngPath;
}

function convertToJpeg(sourcePath, targetPath) {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-i", sourcePath,
    "-frames:v", "1",
    "-q:v", "2",
    targetPath,
  ], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(targetPath)) {
    throw new Error(`Instagram JPEG conversion failed: ${result.stderr || result.stdout}`);
  }
}

async function loadTelegramConfig() {
  const configPath = path.join(ROOT, "telegram_config.local.ps1");
  const text = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const value = (key) => process.env[key] || text.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)`))?.[1] || "";
  const token = value("TELEGRAM_BOT_TOKEN").replace(/^bot/, "");
  const channelId = value("TELEGRAM_CHANNEL_ID");
  const chatId = channelOnly ? channelId : (channelId || value("TELEGRAM_CHAT_ID"));
  if (!token || !chatId) throw new Error(channelOnly ? "Telegram channel config is missing. Add TELEGRAM_CHANNEL_ID." : "Telegram config is missing.");
  return { token, chatId };
}

async function loadXConfig() {
  if (xConfigCache) return xConfigCache;
  const text = existsSync(X_CONFIG_PATH) ? await readFile(X_CONFIG_PATH, "utf8") : "";
  const value = (key) => process.env[key] || text.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)`))?.[1] || "";
  const accessToken = value("X_ACCESS_TOKEN") || value("X_BEARER_TOKEN");
  const refreshToken = value("X_REFRESH_TOKEN");
  const clientId = value("X_CLIENT_ID");
  const clientSecret = value("X_CLIENT_SECRET");
  const oauth1 = {
    consumerKey: value("X_API_KEY") || value("X_CONSUMER_KEY"),
    consumerSecret: value("X_API_KEY_SECRET") || value("X_CONSUMER_SECRET"),
    accessToken: value("X_OAUTH1_ACCESS_TOKEN"),
    accessTokenSecret: value("X_OAUTH1_ACCESS_TOKEN_SECRET"),
  };
  const hasOAuth1 = Object.values(oauth1).every(Boolean);
  if (!accessToken && !hasOAuth1) {
    throw new Error("X config is missing. Add OAuth 1.0a keys or an OAuth 2.0 user access token.");
  }
  xConfigCache = { accessToken, refreshToken, clientId, clientSecret, oauth1: hasOAuth1 ? oauth1 : null };
  return xConfigCache;
}

async function loadMetaConfig() {
  const text = existsSync(META_CONFIG_PATH) ? await readFile(META_CONFIG_PATH, "utf8") : "";
  const value = (key) => process.env[key] || text.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`))?.[1] || "";
  const accessToken = value("THREADS_ACCESS_TOKEN");
  const userId = value("THREADS_USER_ID") || "me";
  if (!accessToken) throw new Error("Threads config is missing. Add THREADS_ACCESS_TOKEN.");
  return { accessToken, userId };
}

async function loadInstagramConfig() {
  const text = existsSync(META_CONFIG_PATH) ? await readFile(META_CONFIG_PATH, "utf8") : "";
  const value = (key) => process.env[key] || text.match(new RegExp(`${key}\\s*=\\s*["']([^"']+)["']`))?.[1] || "";
  const accessToken = value("INSTAGRAM_ACCESS_TOKEN");
  const userId = value("INSTAGRAM_USER_ID");
  if (!accessToken || !userId) throw new Error("Instagram config is missing. Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID.");
  return { accessToken, userId };
}

function psQuote(value) {
  return String(value || "").replaceAll("`", "``").replaceAll('"', '`"');
}

async function saveXConfig(config) {
  const lines = [
    "# X API OAuth 2.0 tokens for Lee&Note social cards.",
    "# Keep this file local. It is ignored by git.",
    config.clientId ? `$env:X_CLIENT_ID = "${psQuote(config.clientId)}"` : "",
    config.clientSecret ? `$env:X_CLIENT_SECRET = "${psQuote(config.clientSecret)}"` : "",
    `$env:X_ACCESS_TOKEN = "${psQuote(config.accessToken)}"`,
    config.refreshToken ? `$env:X_REFRESH_TOKEN = "${psQuote(config.refreshToken)}"` : "",
    config.oauth1?.consumerKey ? `$env:X_API_KEY = "${psQuote(config.oauth1.consumerKey)}"` : "",
    config.oauth1?.consumerSecret ? `$env:X_API_KEY_SECRET = "${psQuote(config.oauth1.consumerSecret)}"` : "",
    config.oauth1?.accessToken ? `$env:X_OAUTH1_ACCESS_TOKEN = "${psQuote(config.oauth1.accessToken)}"` : "",
    config.oauth1?.accessTokenSecret ? `$env:X_OAUTH1_ACCESS_TOKEN_SECRET = "${psQuote(config.oauth1.accessTokenSecret)}"` : "",
  ].filter(Boolean);
  await writeFile(X_CONFIG_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function refreshXConfig(config) {
  if (!config.refreshToken || !config.clientId) {
    throw new Error("X access token expired. Add X_CLIENT_ID to x_config.local.ps1 so the refresh token can be used automatically.");
  }
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });
  if (config.clientSecret) {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  } else {
    params.set("client_id", config.clientId);
  }
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: params,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.detail || body.error || body.title || `HTTP ${response.status}`;
    throw new Error(`X token refresh failed: ${detail}`);
  }
  xConfigCache = {
    ...config,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || config.refreshToken,
  };
  await saveXConfig(xConfigCache);
  return xConfigCache;
}

async function sendMediaGroup(cards) {
  const { token, chatId } = await loadTelegramConfig();
  const selected = cards.slice(0, 10);
  if (!selected.length) return;
  const form = new FormData();
  form.set("chat_id", chatId);
  const media = [];
  for (const [index, card] of selected.entries()) {
    const field = `photo${index}`;
    form.set(field, new Blob([await readFile(card.file)], { type: "image/png" }), path.basename(card.file));
    media.push({
      type: "photo",
      media: `attach://${field}`,
      ...(index === 0 ? { caption: `Lee&Note ${dotted} 주요 DART 공시 요약표` } : {}),
    });
  }
  form.set("media", JSON.stringify(media));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: "POST", body: form });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.description || `Telegram sendMediaGroup HTTP ${response.status}`);
}

async function xFetch(pathname, options = {}, retry = true) {
  let config = await loadXConfig();
  const response = await fetch(`https://api.x.com${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && retry) {
    config = await refreshXConfig(config);
    return xFetch(pathname, options, false);
  }
  if (!response.ok || body.errors?.length) {
    const detail = body.errors?.map((error) => error.detail || error.title || JSON.stringify(error)).join("; ") || body.detail || body.title || body.reason || `HTTP ${response.status}`;
    throw new Error(`X API failed ${pathname}: ${detail}`);
  }
  return body;
}

function oauthPercent(value) {
  return encodeURIComponent(String(value))
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

function oauth1Header(method, url, extraParams = {}) {
  const config = xConfigCache?.oauth1;
  if (!config) throw new Error("X OAuth 1.0a keys are missing.");
  const oauthParams = {
    oauth_consumer_key: config.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: config.accessToken,
    oauth_version: "1.0",
  };
  const parsed = new URL(url);
  const signatureParams = [
    ...Object.entries(oauthParams),
    ...[...parsed.searchParams.entries()],
    ...Object.entries(extraParams),
  ]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? String(aValue).localeCompare(String(bValue)) : aKey.localeCompare(bKey))
    .map(([key, value]) => `${oauthPercent(key)}=${oauthPercent(value)}`)
    .join("&");
  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const signatureBase = [method.toUpperCase(), oauthPercent(baseUrl), oauthPercent(signatureParams)].join("&");
  const signingKey = `${oauthPercent(config.consumerSecret)}&${oauthPercent(config.accessTokenSecret)}`;
  oauthParams.oauth_signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  return `OAuth ${Object.entries(oauthParams)
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
    .map(([key, value]) => `${oauthPercent(key)}="${oauthPercent(value)}"`)
    .join(", ")}`;
}

async function xOAuth1Fetch(url, options = {}) {
  const method = options.method || "GET";
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: oauth1Header(method, url, options.oauthParams || {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.errors?.length) {
    const detail = body.errors?.map((error) => error.message || error.detail || error.title || JSON.stringify(error)).join("; ") || body.detail || body.title || body.error || body.reason || `HTTP ${response.status}`;
    throw new Error(`X OAuth 1.0a API failed ${url}: ${detail}`);
  }
  return body;
}

async function uploadXImage(filePath) {
  await loadXConfig();
  if (xConfigCache?.oauth1) return uploadXImageOAuth1(filePath);
  const bytes = await readFile(filePath);
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error(`X image is larger than 5MB: ${path.basename(filePath)} ${(bytes.length / 1024 / 1024).toFixed(2)}MB`);
  }
  const payload = {
    media: bytes.toString("base64"),
    media_category: "tweet_image",
  };
  const body = await xFetch("/2/media/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const id = body.data?.id || body.data?.media_id_string || body.data?.media_key;
  if (!id) throw new Error(`X media upload did not return an id for ${path.basename(filePath)}`);
  return String(id);
}

async function uploadXImageOAuth1(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error(`X image is larger than 5MB: ${path.basename(filePath)} ${(bytes.length / 1024 / 1024).toFixed(2)}MB`);
  }
  const form = new FormData();
  form.set("media_category", "tweet_image");
  form.set("media", new Blob([bytes], { type: "image/png" }), path.basename(filePath));
  const body = await xOAuth1Fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    body: form,
  });
  const id = body.media_id_string || body.media_id || body.data?.id;
  if (!id) throw new Error(`X OAuth 1.0a media upload did not return an id for ${path.basename(filePath)}`);
  return String(id);
}

async function createXPost({ text, mediaId, mediaIds, replyTo }) {
  const ids = (mediaIds || [mediaId]).filter(Boolean).map(String);
  await loadXConfig();
  if (xConfigCache?.oauth1) {
    const payload = {
      text,
      media: { media_ids: ids },
    };
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
    const body = await xOAuth1Fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const id = body.data?.id;
    if (!id) throw new Error("X OAuth 1.0a post creation did not return a post id.");
    return String(id);
  }
  const payload = {
    text,
    media: { media_ids: ids },
  };
  if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
  const body = await xFetch("/2/tweets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const id = body.data?.id;
  if (!id) throw new Error("X post creation did not return a post id.");
  return String(id);
}

function namesPhrase(rows, limit = 3) {
  const names = [...new Set(rows.map((row) => row.name).filter(Boolean))].slice(0, limit);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")}, ${names.at(-1)}`;
}

function xCaption(kind, rows = []) {
  const title = kind === "five"
    ? "주요 5%보고공시"
    : kind === "executive"
      ? "주요 임원보고공시"
      : "주요 대형수주보고";
  const names = namesPhrase(rows);
  return `${dotted} ${title}\n${names ? `${names} 등` : "주요 공시 종목"}`;
}

function shortLabel(kind) {
  if (kind === "five") return "5%보고";
  if (kind === "executive") return "임원보고";
  return "대형수주";
}

function xBundleCaption(cards = []) {
  const lines = cards.map((card) => {
    const names = namesPhrase(card.rows);
    return `${shortLabel(card.kind)} · ${names ? `${names} 등` : "주요 공시 종목"}`;
  });
  return [`${dotted} 주요 DART 공시 요약`, "", ...lines].join("\n");
}

async function postXThread(cards) {
  if (!cards.length) return [];
  if (!xSeparate) {
    const mediaIds = [];
    for (const card of cards.slice(0, 4)) {
      mediaIds.push(await uploadXImage(card.file));
    }
    const postId = await createXPost({ text: xBundleCaption(cards.slice(0, 4)), mediaIds });
    return [{ kind: "bundle", postId, mediaIds }];
  }
  const posted = [];
  let replyTo = initialReplyTo;
  for (const card of cards) {
    const mediaId = await uploadXImage(card.file);
    const postId = await createXPost({ text: xCaption(card.kind, card.rows), mediaId, replyTo: xThread ? replyTo : "" });
    posted.push({ kind: card.kind, postId, mediaId });
    if (xThread) replyTo = postId;
  }
  return posted;
}

async function threadsFetch(pathname, params = {}) {
  const { accessToken } = await loadMetaConfig();
  const response = await fetch(`https://graph.threads.net/v1.0${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const detail = [
      body.error?.message,
      body.error?.error_user_msg,
      body.error?.error_data ? JSON.stringify(body.error.error_data) : "",
      body.error?.code ? `code=${body.error.code}` : "",
      body.error?.error_subcode ? `subcode=${body.error.error_subcode}` : "",
    ].filter(Boolean).join("; ") || body.error_message || `HTTP ${response.status}`;
    throw new Error(`Threads API failed ${pathname}: ${detail}`);
  }
  return String(body.id);
}

function deployPublicDist() {
  const pnpmCommand = process.env.LEEANDNOTE_PNPM || "pnpm";
  const result = spawnSync(pnpmCommand, ["dlx", "wrangler", "pages", "deploy", "public_dist", "--project-name", "leeandnote", "--branch", "main"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`Temporary social image deploy failed: ${result.stderr || result.stdout}`);
}

async function waitForPublicUrl(url, label) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.ok) return;
    if (attempt === 8) throw new Error(`Temporary ${label} image is unavailable: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
}

async function postThreadsCarousel(cards) {
  if (cards.length < 2) throw new Error("Threads carousel requires at least two cards.");
  const publicDist = path.join(ROOT, "public_dist");
  if (!existsSync(publicDist)) throw new Error("public_dist is missing. Build the site before Threads publishing.");
  const publicKey = `${ymd}-${crypto.randomBytes(8).toString("hex")}`;
  const publicDir = path.join(publicDist, "social-temp", publicKey);
  await mkdir(publicDir, { recursive: true });
  const urls = [];
  try {
    for (const [index, card] of cards.slice(0, 3).entries()) {
      const fileName = `${index + 1}-${card.kind}.png`;
      await copyFile(card.file, path.join(publicDir, fileName));
      urls.push(`https://leeandnote.com/social-temp/${publicKey}/${fileName}`);
    }
    deployPublicDist();
    for (const url of urls) await waitForPublicUrl(url, "Threads");
    const children = [];
    for (const [index, imageUrl] of urls.entries()) {
      const childId = await threadsFetch("/me/threads", {
        media_type: "IMAGE",
        image_url: imageUrl,
        is_carousel_item: "true",
        alt_text: `${dotted} 리앤노트 DART 공시 요약 ${index + 1}`,
      });
      await waitForThreadsContainer(childId);
      children.push(childId);
    }
    const containerId = await threadsFetch("/me/threads", {
      media_type: "CAROUSEL",
      children: children.join(","),
      text: xBundleCaption(cards.slice(0, 3)),
    });
    const postId = await threadsFetch("/me/threads_publish", { creation_id: containerId });
    return { postId, cards: urls.length };
  } finally {
    await rm(publicDir, { recursive: true, force: true });
    deployPublicDist();
  }
}

async function waitForThreadsContainer(containerId) {
  const { accessToken } = await loadMetaConfig();
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const url = new URL(`https://graph.threads.net/v1.0/${containerId}`);
    url.searchParams.set("fields", "status,error_message");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    if (response.ok && ["FINISHED", "PUBLISHED"].includes(body.status)) return;
    if (body.status === "ERROR" || body.status === "EXPIRED") {
      throw new Error(`Threads media processing failed: ${body.error_message || body.status}`);
    }
    if (attempt === 20) throw new Error(`Threads media processing timed out: ${body.status || response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function instagramFetch(pathname, params = {}) {
  const { accessToken } = await loadInstagramConfig();
  const response = await fetch(`https://graph.instagram.com/v24.0${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: accessToken }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const detail = body.error?.message || `HTTP ${response.status}`;
    throw new Error(`Instagram API failed ${pathname}: ${detail}`);
  }
  return String(body.id);
}

async function waitForInstagramContainer(containerId) {
  const { accessToken } = await loadInstagramConfig();
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const query = new URLSearchParams({ fields: "status_code,status", access_token: accessToken });
    const response = await fetch(`https://graph.instagram.com/v24.0/${containerId}?${query}`);
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.status_code === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(body.status_code)) {
      throw new Error(`Instagram media processing failed: ${body.status || body.status_code}`);
    }
    if (attempt === 20) throw new Error(`Instagram media processing timed out: ${body.status_code || response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function postInstagramCarousel(cards) {
  if (cards.length < 2) throw new Error("Instagram carousel requires at least two cards.");
  const { userId } = await loadInstagramConfig();
  const publicDist = path.join(ROOT, "public_dist");
  if (!existsSync(publicDist)) throw new Error("public_dist is missing. Build the site before Instagram publishing.");
  const publicKey = `${ymd}-instagram-${crypto.randomBytes(8).toString("hex")}`;
  const publicDir = path.join(publicDist, "social-temp", publicKey);
  await mkdir(publicDir, { recursive: true });
  const urls = [];
  try {
    for (const [index, card] of cards.slice(0, 3).entries()) {
      const fileName = `${index + 1}-${card.kind}.jpg`;
      convertToJpeg(card.file, path.join(publicDir, fileName));
      urls.push(`https://leeandnote.com/social-temp/${publicKey}/${fileName}`);
    }
    deployPublicDist();
    for (const url of urls) await waitForPublicUrl(url, "Instagram");
    const children = [];
    for (const imageUrl of urls) {
      const childId = await instagramFetch(`/${userId}/media`, {
        image_url: imageUrl,
        is_carousel_item: "true",
      });
      await waitForInstagramContainer(childId);
      children.push(childId);
    }
    const containerId = await instagramFetch(`/${userId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: xBundleCaption(cards.slice(0, 3)),
    });
    await waitForInstagramContainer(containerId);
    const postId = await instagramFetch(`/${userId}/media_publish`, { creation_id: containerId });
    return { postId, cards: urls.length };
  } finally {
    await rm(publicDir, { recursive: true, force: true });
    deployPublicDist();
  }
}

async function main() {
  const [fiveRaw, execRaw, extraExecRaw, contractRaw] = await Promise.all([
    convexQuery("dart:listDailyReportItems", { reportDate: ymd, limit: 500 }),
    convexQuery("dart:listExecutiveDailyReportItems", { reportDate: ymd, limit: 500 }),
    loadExtraExecutiveRows(),
    loadContractRows(),
  ]);
  const fiveRows = pickFive(fiveRaw.map(rowModel));
  const mergedExecRaw = [...extraExecRaw, ...execRaw];
  const execRows = pickExecutive(mergedExecRaw.map(rowModel));
  const contractRows = pickContracts(contractRaw);
  if (contractRaw.length > 0 && contractRows.length === 0) {
    throw new Error(`${iso} contract disclosures exist, but every row is missing contract amount/ratio. Social publishing stopped.`);
  }
  if (fiveRows.length === 0 && execRows.length === 0 && contractRows.length === 0) throw new Error(`${iso} card source rows are empty.`);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "leeandnote-social-"));
  const sent = [];
  const cards = [];
  try {
    if (fiveRows.length) {
      const png = await renderPng(cardHtml({ kind: "five", title: `${dotted} 주요 5%보고공시`, subtitle: "신규 5% 진입, 기관성 제출인, 지분 확대·축소 흐름을 압축 정리했습니다.", rows: fiveRows, total: fiveRaw.length }), tempDir, `leeandnote-5percent-${iso}`);
      sent.push(png);
      cards.push({ kind: "five", file: png, rows: fiveRows });
    }
    if (execRows.length) {
      const png = await renderPng(cardHtml({ kind: "executive", title: `${dotted} 주요 임원보고공시`, subtitle: "임원·주요주주의 보유비율과 보유주식수 변동 중 눈에 띄는 흐름을 정리했습니다.", rows: execRows, total: mergedExecRaw.length }), tempDir, `leeandnote-executive-${iso}`);
      sent.push(png);
      cards.push({ kind: "executive", file: png, rows: execRows });
    }
    if (contractRows.length) {
      const png = await renderPng(contractCardHtml({ rows: contractRows, total: contractRaw.length }), tempDir, `leeandnote-contract-${iso}`);
      sent.push(png);
      cards.push({ kind: "contracts", file: png, rows: contractRows });
    }
    const targetCards = onlyKinds ? cards.filter((card) => onlyKinds.has(card.kind)) : cards;
    if (!dryRun && !skipTelegram && !xOnly && !threadsOnly && !instagramOnly && !youtubeOnly) await sendMediaGroup(targetCards);
    const xPosts = postX && !dryRun ? await postXThread(targetCards) : [];
    const threadsPost = postThreads && !dryRun ? await postThreadsCarousel(targetCards) : null;
    const instagramPost = postInstagram && !dryRun ? await postInstagramCarousel(targetCards) : null;
    let youtubePost = null;
    let youtubeVideo = null;
    if (postYouTube) {
      youtubeVideo = path.join(tempDir, `leeandnote-dart-${iso}.mp4`);
      renderYouTubeShort(targetCards, youtubeVideo);
      if (postYouTube && !dryRun) {
        youtubePost = await uploadYouTubeShort({
          file: youtubeVideo,
          title: `${dotted} 주요 DART 공시 요약 #Shorts`,
          description: [
            `${dotted} 주요 5%보고·임원보고·대형수주 공시를 한눈에 정리했습니다.`,
            "공시 원문과 상세 데이터: https://leeandnote.com",
            "본 영상은 정보 제공 목적이며 투자 권유가 아닙니다.",
            "#주식 #공시 #DART #대형수주 #지분변동 #Shorts",
          ].join("\n\n"),
          tags: ["주식", "공시", "DART", "5%보고", "임원보고", "대형수주", "기업공시", "Shorts"],
        });
      }
    }
    console.log(JSON.stringify({
      reportDate: ymd,
      dryRun,
      telegramSent: dryRun || skipTelegram || xOnly || threadsOnly || instagramOnly ? 0 : sent.length,
      xRequested: postX,
      xPosts,
      threadsRequested: postThreads,
      threadsPost,
      instagramRequested: postInstagram,
      instagramPost,
      youtubeRequested: postYouTube,
      youtubePost,
      youtubeVideo: keep ? youtubeVideo : undefined,
      xCaptions: showXCaptions
        ? (xSeparate
          ? targetCards.map((card) => ({ kind: card.kind, text: xCaption(card.kind, card.rows) }))
          : [{ kind: "bundle", text: xBundleCaption(targetCards.slice(0, 4)) }])
        : undefined,
      files: keep ? sent : [],
    }, null, 2));
  } finally {
    if (!keep) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});







