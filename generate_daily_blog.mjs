import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("site");
const CONVEX_URL = "https://gregarious-lemming-92.convex.cloud";
const ADSENSE = "ca-pub-5230074340613849";

const ymd = process.argv[2] || "20260824";
const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const dotted = `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;

async function convexQuery(queryPath, args = {}) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: queryPath, args, format: "json" }),
  });
  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(payload.errorMessage || `Convex query failed: ${queryPath}`);
  }
  return payload.value || [];
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function n(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === "N/A" || cleaned === "확인불가" || cleaned === "원문 확인 필요") return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(value);
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

function topicParticle(value) {
  const text = String(value || "");
  const char = text[text.length - 1];
  if (!char) return "은";
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "는";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

function moneyEok(value) {
  const num = n(value);
  if (num === null || num === 0) return "-";
  const eok = Math.round(Math.abs(num) / 100000000);
  return `${num > 0 ? "+" : "-"}${eok.toLocaleString("ko-KR")}억 원`;
}

function plainMoneyEok(value) {
  const num = n(value);
  if (num === null || num === 0) return "-";
  return `${Math.round(Math.abs(num) / 100000000).toLocaleString("ko-KR")}억 원`;
}

function saneContractAmount(value) {
  const num = n(value);
  if (num === null || num <= 0 || num < 1000000) return null;
  return num;
}

function normalizeContractRecentSales(amount, ratio, rawRecentSales) {
  const recent = saneContractAmount(rawRecentSales);
  const inferred = amount !== null && amount > 0 && ratio !== null && ratio > 0 ? amount / (ratio / 100) : null;
  if (inferred !== null) {
    if (recent === null) return inferred;
    const gap = Math.abs(recent - inferred) / Math.max(inferred, 1);
    return gap > 0.15 ? inferred : recent;
  }
  return amount === null ? null : recent;
}

function ratioText(value) {
  const num = n(value);
  if (num === null) return "-";
  const rounded = Math.round(num * 10) / 10;
  return `${rounded.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
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

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csvTable(rows) {
  const header = [
    "종목명",
    "종목코드",
    "시장",
    "주주/제출인",
    "제출인성격",
    "직전보유비율",
    "이번보유비율",
    "지분율증감",
    "지분변동주식수",
    "보고사유",
    "지분변동금액",
    "원문URL",
  ];
  const body = rows.map((row) => [
    row.name,
    row.code,
    row.market,
    row.reporter,
    row.reporterType,
    pct(row.prev),
    pct(row.cur),
    row.deltaText,
    row.shareDeltaText,
    row.reason,
    moneyEok(row.value),
    row.url,
  ]);
  return [header, ...body].map((cols) => cols.map(csvEscape).join(",")).join("\n");
}

function cleanReason(value) {
  return String(value || "기타 사유").replace(/\s+/g, " ").replace(/^- /, "").slice(0, 42);
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
    shareDeltaClass: shareDelta > 0 ? "up" : shareDelta < 0 ? "down" : "flat",
    previousShares,
    currentShares,
    sharesText: previousShares !== null || currentShares !== null
      ? `${previousShares === null ? "-" : `${Math.round(previousShares).toLocaleString("ko-KR")}주`} → ${currentShares === null ? "-" : `${Math.round(currentShares).toLocaleString("ko-KR")}주`}`
      : "-",
    reason,
    url: row.url || "#",
    value,
    receiptNo: row.receiptNo || "",
  };
}

function tableRows(rows) {
  return rows.slice(0, 8).map((item) => `
    <tr>
      <td><strong>${esc(item.name)}</strong><br><small>${esc(item.code)} · ${esc(item.market)}</small></td>
      <td>${esc(item.reporter)}<br><small>${esc(item.reporterType)}</small></td>
      <td><strong>${esc(item.rateText)}</strong><br><span class="${item.deltaClass}">${esc(item.deltaText)}</span></td>
      <td>${esc(item.reason)}</td>
    </tr>`).join("");
}

function cardSvg({ title, tag, rows, fileName }) {
  const displayRows = rows.slice(0, 8);
  const rowHeight = Math.max(96, Math.floor(900 / Math.max(1, displayRows.length)));
  const html = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <rect width="1080" height="1920" fill="#f8f8f7"/>
    <foreignObject x="86" y="92" width="908" height="1720">
      <div xmlns="http://www.w3.org/1999/xhtml" class="card">
        <style>
          .card{font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#333}
          .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:58px}
          .date{color:#ff4d0d;font-size:36px;font-weight:800;letter-spacing:-.02em}
          .logo{color:#666;font-size:30px;font-weight:800;letter-spacing:-.04em}
          h1{margin:0 0 8px;font-size:48px;line-height:1.18;letter-spacing:-.04em;color:#444}
          h2{margin:0 0 62px;font-size:46px;line-height:1.15;letter-spacing:-.04em;color:#777}
          table{width:100%;border-collapse:collapse;table-layout:fixed;background:white;border:1px solid #cfcfcf}
          th,td{border:1px solid #cfcfcf;text-align:center;vertical-align:middle}
          th{height:68px;background:#ecebea;color:#444;font-size:21px;font-weight:800}
          td{height:${rowHeight}px;padding:10px 12px;font-size:20px;line-height:1.28;font-weight:650}
          td:nth-child(1){width:24%}td:nth-child(2){width:29%}td:nth-child(3){width:22%}td:nth-child(4){width:25%}
          small{display:block;margin-top:6px;color:#777;font-size:16px;font-weight:700;line-height:1.2}
          .up{color:#ff3b30}.down{color:#1f6feb}.flat{color:#777}
          .source{margin-top:38px;text-align:right;color:#aaa;font-size:15px;font-weight:700}
        </style>
        <div class="top"><div class="date">${dotted}</div><div class="logo">LEE &amp; NOTE</div></div>
        <h1>${esc(title)}</h1>
        <h2>#${esc(tag)}</h2>
        <table>
          <thead><tr><th>종목</th><th>주주/제출인</th><th>직전→이번<br/><small>(단위:%)</small></th><th>보고사유</th></tr></thead>
          <tbody>${tableRows(displayRows)}</tbody>
        </table>
        <div class="source">출처: DART 전자공시</div>
      </div>
    </foreignObject>
  </svg>`;
  return { fileName, html };
}

function htmlHead({ title, description, canonical, image }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="google-adsense-account" content="${ADSENSE}">
  <meta name="naver-site-verification" content="98320b375ec48f676f3586776324282d722d905a">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="LEE&NOTE">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/favicon-32.png" sizes="32x32">
  <link rel="stylesheet" href="/styles.css">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>
</head>`;
}

function blogCss() {
  return `<style>
    body.blogBody{margin:0;background:#f6f7f9;color:#111827;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .blogShell{max-width:980px;margin:0 auto;padding:38px 20px 80px}
    body.blogBody .topbar{position:sticky;top:0;z-index:40}
    body.blogBody .siteNav .navLink{font-weight:800}
    body.blogBody .siteNav .navLink.active{font-weight:900}
    .blogHero{padding:38px 0 26px;border-bottom:1px solid #dfe5ec}
    .blogHero p{margin:0 0 10px;color:#ff4d0d;font-size:12px;font-weight:850}.blogHero h1{margin:0;font-size:42px;line-height:1.22;letter-spacing:-.04em}
    .blogHero .lead{max-width:720px;margin-top:16px;color:#5b6470;font-size:17px;line-height:1.72;font-weight:550}
    .insightTabs{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 0}.insightTabs a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #e3e8ef;border-radius:999px;background:white;color:#333b47;padding:9px 13px;text-decoration:none;font-size:13px;font-weight:850}.insightTabs a.active{border-color:#ffb399;background:#fff3ed;color:#ff4d0d}.insightTabs a:hover{border-color:#ffb399;color:#ff4d0d}
    .categoryBar{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0 30px}.categoryBar a{border:1px solid #e3e8ef;border-radius:999px;padding:9px 15px;background:white;color:#333b47;text-decoration:none;font-size:14px;font-weight:750}.categoryBar a.active{border-color:#ffd8cc;background:#fffaf8;color:#f0521d;font-weight:800}.categoryBar a:hover{border-color:#ffb399;color:#ff4d0d}
    .insightGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:22px}.insightCard{display:grid;grid-template-rows:auto 1fr;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;background:white;color:#111827;text-decoration:none;box-shadow:0 18px 50px rgba(15,23,42,.06);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}.insightCard:hover{transform:translateY(-3px);border-color:#ffb399;box-shadow:0 24px 70px rgba(255,85,32,.10)}.insightThumb{position:relative;min-height:220px;background:#f8fafc;overflow:hidden}.orbThumb{position:relative;display:block;width:100%;height:100%;min-height:220px;background:radial-gradient(circle at 72% 44%,rgba(255,102,45,.23),rgba(255,102,45,.06) 32%,transparent 58%),linear-gradient(135deg,#fffaf7,#f7f9fc 58%,#eef2f7)}.orbThumb:before{content:"";position:absolute;inset:34px 36px;border-radius:28px;background:linear-gradient(135deg,rgba(255,255,255,.78),rgba(255,255,255,.25));border:1px solid rgba(226,232,240,.75)}.orbThumb:after{content:"";position:absolute;right:52px;top:46px;width:154px;height:154px;border-radius:50%;background:linear-gradient(145deg,rgba(255,113,56,.72),rgba(188,93,72,.50));box-shadow:0 34px 70px rgba(255,85,32,.18)}.orbThumb .orbit{position:absolute;right:28px;top:76px;width:250px;height:110px;border:1px solid rgba(255,113,56,.18);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(-16deg)}.orbThumb .stars{position:absolute;left:44px;top:40px;right:44px;bottom:36px;background-image:radial-gradient(circle,rgba(17,24,39,.17) 1px,transparent 1.4px);background-size:28px 28px;opacity:.26}.orbThumb .label{position:absolute;left:56px;bottom:52px;color:#111827;font-size:15px;font-weight:900;letter-spacing:-.02em}.orbThumb .label small{display:block;margin-top:4px;color:#7b8490;font-size:11px;font-weight:800}.orbThumb.executive{background:radial-gradient(circle at 72% 44%,rgba(63,131,248,.18),rgba(255,102,45,.06) 35%,transparent 60%),linear-gradient(135deg,#fffaf7,#f8fafc 60%,#eef4ff)}.orbThumb.executive:after{background:linear-gradient(145deg,rgba(255,113,56,.42),rgba(57,111,210,.36))}.orbThumb.contract{background:radial-gradient(circle at 72% 44%,rgba(15,159,143,.22),rgba(15,159,143,.06) 35%,transparent 60%),linear-gradient(135deg,#fffaf7,#f8fafc 60%,#edf8f6)}.orbThumb.contract:after{background:linear-gradient(145deg,rgba(164,229,218,.70),rgba(70,148,142,.52));box-shadow:0 34px 70px rgba(15,159,143,.16)}.orbThumb.contract .orbit{border-color:rgba(15,159,143,.20);border-left-color:transparent;border-bottom-color:transparent}.insightContent{padding:22px}.insightContent small{color:#ff4d0d;font-weight:900}.insightContent h2{margin:10px 0 10px;font-size:24px;line-height:1.32;letter-spacing:-.035em}.insightContent p{margin:0;color:#667085;font-size:15px;line-height:1.65;font-weight:560}
    .postList{display:grid;gap:14px;margin-top:26px}.postCard{display:block;border:1px solid #e3e8ef;border-radius:18px;padding:22px;background:white;color:#111827;text-decoration:none}.postCard small{color:#ff4d0d;font-weight:850}.postCard h2{margin:8px 0 8px;font-size:24px}.postCard p{margin:0;color:#667085;line-height:1.65}
    article{margin-top:26px}.articleMeta{color:#64748b;font-size:13px;font-weight:760}.articleBody{display:grid;gap:24px;margin-top:24px}.articleBody p{margin:0;color:#333b47;font-size:16px;line-height:1.82;font-weight:520}.articleBody p strong{font-weight:720;color:#111827}.articleBody .key{color:#111827;font-weight:700;text-decoration:none}.articleBody .softKey{color:#111827;font-weight:680;background:transparent}.summaryBox{border:1px solid #e3e8ef;border-radius:18px;background:#fff;padding:18px 20px;color:#333b47;line-height:1.78}.summaryBox strong{color:#111827;font-weight:760}.articleBody h2{margin:26px 0 0;padding-left:12px;border-left:4px solid #ff4d0d;font-size:23px;line-height:1.35;letter-spacing:-.03em}.blogVisual{display:block;width:min(100%,520px);margin:8px auto;border-radius:18px;box-shadow:0 24px 70px rgba(16,24,39,.10)}
    .postMeta{display:flex;align-items:center;gap:8px;margin-bottom:14px}.postBadge{display:inline-flex;align-items:center;border:1px solid #ffd8cc;border-radius:999px;background:#fffaf8;color:#f0521d;padding:4px 9px;font-size:12px;font-weight:800}.postDate{color:#7b8490;font-size:12px;font-weight:760}
    .mobileCardWrap{display:flex;justify-content:center;margin:12px 0 8px}.mobileCardTable{width:min(100%,430px);aspect-ratio:9/16;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e3e8ef;border-radius:18px;background:white;box-shadow:0 16px 44px rgba(15,23,42,.08)}.mobileCardHead{padding:14px 16px;border-bottom:1px solid #edf1f5;background:#fafafa}.mobileCardHead span{display:inline-flex;border:1px solid #ffd8cc;border-radius:999px;background:#fff0eb;color:#ff5520;padding:4px 8px;font-size:11px;font-weight:900}.mobileCardHead h3{margin:7px 0 0;color:#111827;font-size:17px;line-height:1.35;letter-spacing:-.02em}.mobileCardCols,.mobileCardRow{display:grid;grid-template-columns:1.02fr 1.08fr 1fr;gap:8px;align-items:center}.mobileCardCols{padding:9px 13px;border-bottom:1px solid #edf1f5;background:#fbfcfd;color:#7b8490;font-size:11px;font-weight:850}.mobileCardCols span:last-child{text-align:right}.mobileCardRows{display:flex;flex:1;flex-direction:column;font-size:12px}.mobileCardRow{flex:1;min-height:0;padding:8px 13px;border-bottom:1px solid #edf1f5}.mobileCardRow:last-child{border-bottom:0}.mobileCardName strong,.mobileCardHolder strong,.mobileCardHolder small,.mobileCardRate strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mobileCardName strong{font-size:13px;color:#111827}.mobileCardName small{display:block;margin-top:3px;color:#8b95a1;font-size:10px;font-weight:800}.mobileCardHolder strong{color:#343d49;font-size:11px;font-weight:850}.mobileCardHolder small{margin-top:3px;color:#8b95a1;font-size:10px;font-weight:750}.mobileCardRate{text-align:right}.mobileCardRate strong{color:#222b36;font-size:11px}.up{color:#ff3b30}.down{color:#1f6feb}.flat{color:#7b8490}.mobileCardDelta{display:block;margin-top:3px;font-size:10px;font-weight:900}
    .articleTableWrap{width:100%;max-width:100%;margin:10px auto 4px;overflow-x:auto;overflow-y:hidden;border:1px solid #e3e8ef;border-radius:16px;background:white;box-shadow:0 16px 42px rgba(15,23,42,.05);scrollbar-color:#a0a7b2 #f1f5f9;scrollbar-width:thin}.articleTable{width:100%;min-width:0;border-collapse:collapse;table-layout:fixed;font-size:14px;word-break:keep-all}.articleTable th{padding:11px 10px;border-top:1px solid #edf1f5;border-bottom:1px solid #dfe5ec;background:#fbfcfd;color:#667085;text-align:center;font-size:12px;font-weight:780;white-space:nowrap}.articleTable td{padding:14px 12px;border-bottom:1px solid #edf1f5;color:#333b47;text-align:center;vertical-align:middle;line-height:1.5;font-weight:500}.articleTable tr:last-child td{border-bottom:0}.ownershipArticleTable th:nth-child(1),.ownershipArticleTable td:nth-child(1){width:16%}.ownershipArticleTable th:nth-child(2),.ownershipArticleTable td:nth-child(2){width:18%}.ownershipArticleTable th:nth-child(3),.ownershipArticleTable td:nth-child(3){width:15%}.ownershipArticleTable th:nth-child(4),.ownershipArticleTable td:nth-child(4){width:15%}.ownershipArticleTable th:nth-child(5),.ownershipArticleTable td:nth-child(5){width:36%}.contractArticleTable th:nth-child(1),.contractArticleTable td:nth-child(1){width:16%}.contractArticleTable th:nth-child(2),.contractArticleTable td:nth-child(2){width:15%}.contractArticleTable th:nth-child(3),.contractArticleTable td:nth-child(3){width:17%}.contractArticleTable th:nth-child(4),.contractArticleTable td:nth-child(4){width:34%}.contractArticleTable th:nth-child(5),.contractArticleTable td:nth-child(5){width:18%}.articleTable .stock strong,.articleTable .rate strong,.articleTable .money strong,.articleTable .shares strong{display:block;color:#111827;font-weight:720}.articleTable .holder strong{display:block;color:#1f2937;font-weight:620}.articleTable .stock small,.articleTable .holder small,.articleTable .money small{display:block;margin-top:4px;color:#7b8490;font-size:12px;font-weight:540}.articleTable .stock,.articleTable .holder,.articleTable .rate,.articleTable .money,.articleTable .shares{white-space:nowrap}.articleTable .reason{text-align:left}.articleTable .reason b{display:block;color:#1f2937;font-size:13px;font-weight:650}.articleTable .reason span{display:block;margin-top:3px;color:#5b6470;font-weight:500;white-space:normal;overflow:visible;text-overflow:clip}.articleTable .rate,.articleTable .money,.articleTable .shares{text-align:center}.articleTable .rate strong{font-size:14px}.articleTable .rate span,.articleTable .shares span{display:block;margin-top:4px;font-size:12px;font-weight:700}.articleTable .subLink,.articleTable .dartLink{display:block;margin-top:4px;color:#7b8490;text-decoration:none;font-size:11px;font-weight:650;white-space:nowrap}.articleTable .subLink:hover,.articleTable .dartLink:hover{color:#ff5520;text-decoration:underline}.miniRatioBar{display:block;width:74px;height:6px;margin:6px auto 3px;border-radius:999px;background:#edf1f5;overflow:hidden}.miniRatioBar i{display:block;height:100%;border-radius:inherit;background:#ff5520}.articleTableNote{margin:10px 4px 0;color:#8a94a3;font-size:12px;line-height:1.65;text-align:left}.articleTableNote.outside{margin:-10px 0 8px;color:#8b95a1;font-size:12px}
    .downloadRow{display:none}.downloadBtn{display:none}
    .reviewList{display:grid;gap:12px;margin-top:0}.reviewItem{border:1px solid #e3e8ef;border-radius:16px;background:white;padding:16px 18px;box-shadow:0 12px 32px rgba(15,23,42,.04)}.reviewItem h3{margin:0 0 7px;color:#111827;font-size:17px;line-height:1.35;letter-spacing:-.02em}.reviewItem .reviewMeta{margin:0 0 7px;color:#ff5520;font-size:12px;font-weight:900}.reviewItem p{margin:0;color:#4b5563;font-size:14px;line-height:1.75;font-weight:550}
    .pointBox{padding:17px 18px;border:1px solid #e3e8ef;border-radius:16px;background:#fbfcfd;color:#4b5563;font-size:14px;line-height:1.75}.pointBox strong{color:#111827}.pointBox ul{margin:8px 0 0;padding-left:18px}.pointBox li+li{margin-top:6px}
    .blogCta{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:14px 0 4px;padding:20px;border:1px solid #ffd8cc;border-radius:20px;background:linear-gradient(135deg,#fff7f3,#ffece5);box-shadow:0 14px 42px rgba(250,73,5,.08)}.blogCta strong{display:block;color:#111827;font-size:16px}.blogCta p{margin-top:5px;color:#5b6470;font-size:13px;line-height:1.6}.blogCta a{flex:0 0 auto;border-radius:13px;background:#ff5520;color:white;padding:12px 16px;text-decoration:none;font-size:13px;font-weight:900;box-shadow:0 10px 24px rgba(255,85,32,.18)}
    .note{padding:18px 20px;border-left:4px solid #ff4d0d;background:#fff7f3;color:#4b5563;border-radius:12px;font-size:14px;line-height:1.7}
    footer.blogFoot{margin-top:64px;padding-top:24px;border-top:1px solid #dfe5ec;color:#7b8490;font-size:12px;line-height:1.7}.statusNotice{margin:0 0 22px;padding:16px 18px;border:1px solid #d8e1eb;border-radius:16px;background:#fff;color:#4b5563;font-size:14px;line-height:1.72;box-shadow:0 10px 28px rgba(15,23,42,.04)}.statusNotice strong{color:#111827;font-weight:760}.statusNotice em{color:#f0521d;font-style:normal;font-weight:760}
    @media(max-width:720px){.insightGrid{grid-template-columns:1fr}.insightThumb{min-height:180px}.articleTable{width:840px;min-width:840px}}
    @media(max-width:560px){.blogShell{padding:28px 16px 64px}.blogHero{padding-top:28px}.blogHero h1{font-size:29px}.blogHero .lead,.articleBody p{font-size:15px}.postCard h2,.insightContent h2{font-size:21px}.blogCta{align-items:stretch;flex-direction:column}.blogCta a{text-align:center}.mobileCardTable{width:100%}}

    /* blog mobile readability overrides */
    @media(max-width:760px){
      body.blogBody{background:#f7f8fa;-webkit-text-size-adjust:100%}
      body.blogBody .topbar{min-height:58px;padding:9px 14px;gap:10px;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
      body.blogBody .brandHome{flex:0 0 auto}
      body.blogBody .brandMark{width:30px;height:30px}
      body.blogBody .brandLogo{width:116px;height:auto;max-width:116px}
      body.blogBody .siteNav{display:flex;flex:0 0 auto;gap:6px;margin-left:4px;overflow:visible}
      body.blogBody .siteNav .navLink{min-height:34px;padding:7px 10px;border-radius:10px;font-size:13px;line-height:1;white-space:nowrap}
      .blogShell{width:100%;max-width:none;padding:24px 16px 64px;box-sizing:border-box}
      .blogHero{padding:28px 0 20px}
      .blogHero p{font-size:11px;margin-bottom:8px}
      .blogHero h1{max-width:100%;font-size:clamp(28px,8vw,34px);line-height:1.24;letter-spacing:-.035em;word-break:keep-all;overflow-wrap:break-word}
      .blogHero .lead{margin-top:12px;font-size:15px;line-height:1.68;word-break:keep-all}
      .postMeta{gap:7px;margin-bottom:12px;flex-wrap:wrap}
      .postBadge,.postDate{font-size:11px}
      .insightTabs,.categoryBar{display:flex;flex-wrap:nowrap;gap:8px;margin-top:18px;margin-left:-16px;margin-right:-16px;padding:0 16px 3px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .insightTabs::-webkit-scrollbar,.categoryBar::-webkit-scrollbar{display:none}
      .insightTabs a,.categoryBar a{flex:0 0 auto;padding:8px 12px;font-size:13px}
      .insightGrid{grid-template-columns:1fr;gap:16px;margin-top:18px}
      .insightCard{border-radius:18px;box-shadow:0 12px 34px rgba(15,23,42,.055)}
      .insightThumb,.orbThumb{min-height:150px}
      .orbThumb:before{inset:22px 24px;border-radius:22px}
      .orbThumb:after{right:30px;top:30px;width:112px;height:112px}
      .orbThumb .orbit{right:12px;top:54px;width:190px;height:82px}
      .orbThumb .stars{left:24px;top:24px;right:24px;bottom:24px;background-size:23px 23px}
      .orbThumb .label{left:28px;bottom:30px;font-size:13px}
      .insightContent{padding:18px}
      .insightContent h2{font-size:20px;line-height:1.34;word-break:keep-all}
      .insightContent p{font-size:14px;line-height:1.62}
      article{margin-top:14px}
      .articleBody{gap:20px;margin-top:22px}
      .articleBody p{font-size:15px;line-height:1.78;word-break:keep-all;overflow-wrap:break-word}
      .articleBody h2{margin-top:22px;font-size:20px;line-height:1.36;padding-left:10px}
      .summaryBox,.pointBox,.reviewItem,.note,.statusNotice{border-radius:15px;padding:15px 16px;font-size:14px;line-height:1.72;word-break:keep-all}
      .reviewItem h3{font-size:16px}
      .reviewItem p{font-size:14px;line-height:1.68}
      .mobileCardWrap{margin:6px -2px 4px}
      .mobileCardTable{width:100%;max-width:390px;border-radius:16px}
      .articleTableWrap{position:relative;width:calc(100vw - 32px);max-width:calc(100vw - 32px);margin:8px auto 2px;border-radius:14px;box-shadow:0 10px 26px rgba(15,23,42,.045);-webkit-overflow-scrolling:touch}
      .articleTable{width:840px;min-width:840px;font-size:13px}
      .articleTable th{padding:10px 10px;font-size:11px}
      .articleTable td{padding:13px 12px;line-height:1.48}
      .articleTable .reason span{font-size:12px;line-height:1.52}
      .articleTable .stock small,.articleTable .holder small,.articleTable .money small{font-size:11px}
      .downloadRow,.downloadBtn{display:none!important}
      .blogCta{display:grid;gap:14px;padding:17px 16px;border-radius:17px}
      .blogCta a{width:100%;box-sizing:border-box;text-align:center}
      footer.blogFoot{margin-top:44px;font-size:11px}
    }
  </style>`;
}

function pageNav(active = "") {
  const blogActive = active === "blog" ? " active" : "";
  return `<header class="topbar">
  <a class="brandHome" href="/" aria-label="리앤노트 홈">
    <img class="brandMark" src="/assets/leeandnote-mark.png" alt="">
    <img class="brandLogo" src="/assets/leeandnote-logo.png" alt="LEE&NOTE">
  </a>
  <nav class="siteNav" aria-label="주요 카테고리">
    <a class="navLink" href="/5percent"><span class="navIcon disclosureIcon"></span>5%보고</a>
    <a class="navLink" href="/executives"><span class="navIcon disclosureIcon"></span>임원보고</a>
    <a class="navLink" href="/contracts"><span class="navIcon disclosureIcon"></span>대형수주보고</a>
    <a class="navLink${blogActive}" href="/blog/"${blogActive ? ' aria-current="page"' : ""}><span class="navIcon disclosureIcon"></span>블로그</a>
  </nav>
</header>`;
}

function mobileCardTable({ title, badge, rows }) {
  const displayRows = rows.slice(0, 8);
  return `<div class="mobileCardWrap">
    <div class="mobileCardTable" role="img" aria-label="${esc(title)}">
      <div class="mobileCardHead">
        <span>${esc(badge)}</span>
        <h3>${esc(title)}</h3>
      </div>
      <div class="mobileCardCols">
        <span>종목</span>
        <span>주주/제출인</span>
        <span>보유비율</span>
      </div>
      <div class="mobileCardRows">
        ${displayRows.map((row) => `
        <div class="mobileCardRow">
          <div class="mobileCardName"><strong>${esc(row.name)}</strong><small>${esc(row.code)} · ${esc(row.market)}</small></div>
          <div class="mobileCardHolder"><strong>${esc(row.reporter)}</strong><small>${esc(row.reporterType)}</small></div>
          <div class="mobileCardRate"><strong>${esc(row.rateText)}</strong><span class="mobileCardDelta ${row.deltaClass}">${esc(row.deltaText)}</span></div>
        </div>`).join("")}
      </div>
    </div>
  </div>`;
}

function downloadLinks() {
  return ``;
}

function articleDataTable({ title, badge, rows }) {
  const displayRows = rows.slice(0, Math.min(rows.length, 10));
  if (!displayRows.length) return `<p>조건에 맞는 표 데이터가 없습니다.</p>`;
  return `<div class="articleTableWrap">
    <table class="articleTable ownershipArticleTable">
      <thead>
        <tr>
          <th>종목</th>
          <th>주주/제출인</th>
          <th>직전 → 이번</th>
          <th>지분변동주식수</th>
          <th>보고사유</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((row) => `
        <tr>
          <td class="stock"><strong>${esc(row.name)}</strong><small>${esc(row.code)} · ${esc(row.market)}</small></td>
          <td class="holder"><strong>${esc(row.reporter)}</strong><small>${esc(row.reporterType)}</small></td>
          <td class="rate"><strong>${esc(row.rateText)}</strong><span class="${row.deltaClass}">${esc(row.deltaText)}</span></td>
          <td class="shares"><strong class="${row.shareDeltaClass}">${esc(row.shareDeltaText)}</strong></td>
          <td class="reason"><span>${esc(row.reason)}</span><a class="subLink" href="${esc(row.url)}" target="_blank" rel="noopener">원문보기</a></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

async function loadContractBlogItems() {
  const filePath = path.join(ROOT, "data", "disclosure_signals.json");
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8"));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    return rows
      .filter((row) => String(row["공시유형"] || "") === "단일판매·공급계약" && String(row["접수일"] || "").replace(/\D/g, "").slice(0, 8) === ymd)
      .map((row) => {
        const amount = saneContractAmount(row["계약금액"]);
        const ratio = n(row["매출대비비율"]);
        return {
          name: row["종목명"] || "-",
          code: row["종목코드"] || "-",
          market: row["시장"] || "-",
          amount,
          recentSales: normalizeContractRecentSales(amount, ratio, row["최근매출액"]),
          ratio,
          party: String(row["계약상대방"] || "영업비밀 보호 비공개").replace(/\s+/g, " ").trim(),
          period: String(row["계약기간"] || "").replace(/\s+/g, " ").trim(),
          content: String(row["계약내용"] || row["보고서명"] || "").replace(/\s+/g, " ").trim(),
          url: row.DART_URL || "#",
        };
      })
      .filter((row) => row.name !== "-" && (row.amount !== null || row.ratio !== null))
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  } catch {
    return [];
  }
}

function contractArticleTable(rows) {
  const displayRows = rows.slice(0, 5);
  if (!displayRows.length) return `<p>조건에 맞는 대형수주 공시가 없습니다.</p>`;
  return `<div class="articleTableWrap">
    <table class="articleTable contractArticleTable">
      <thead>
        <tr>
          <th>종목</th>
          <th>계약금액</th>
          <th>매출액 대비</th>
          <th>계약상대방 / 내용</th>
          <th>계약기간</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((row) => `
        <tr>
          <td class="stock"><strong>${esc(row.name)}</strong><small>${esc(row.code)} · ${esc(row.market)}</small></td>
          <td class="money"><strong>${esc(plainMoneyEok(row.amount))}</strong><a class="subLink" href="${esc(row.url)}" target="_blank" rel="noopener">원문보기</a></td>
          <td class="rate"><strong>${esc(ratioText(row.ratio))}</strong><span class="miniRatioBar"><i style="width:${Math.max(0, Math.min(100, row.ratio || 0))}%"></i></span><span>${row.recentSales ? `최근 매출 ${esc(plainMoneyEok(row.recentSales))}` : ""}</span></td>
          <td class="reason"><b>${esc(row.party)}</b><span>${esc(row.content)}</span></td>
          <td>${esc(row.period || "-")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function contractInsightText(rows) {
  const topAmount = rows[0];
  const topRatio = rows.slice().sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))[0];
  const parts = [];
  if (topAmount) parts.push(`계약금액 기준으로는 <strong>${esc(topAmount.name)}</strong>의 ${esc(plainMoneyEok(topAmount.amount))} 규모 공시가 가장 컸습니다.`);
  if (topRatio && topRatio !== topAmount) parts.push(`매출액 대비 비중은 <strong>${esc(topRatio.name)}</strong>가 ${esc(ratioText(topRatio.ratio))}로 눈에 띕니다.`);
  parts.push("수주 공시는 금액보다도 계약기간, 발주처 성격, 기존 매출 대비 비중을 함께 봐야 실제 실적 반영 속도를 가늠할 수 있습니다.");
  return `<p>${parts.join(" ")}</p>`;
}

function reviewSentence(row, mode) {
  const rate = `${row.rateText}${row.delta && row.delta !== 0 ? ` (${row.deltaText})` : ""}`;
  const reporter = `${row.reporter}${row.reporterType ? ` · ${row.reporterType}` : ""}`;
  if (mode === "entry") {
    if ((row.prev ?? 0) < 5 && (row.cur ?? 0) >= 5) {
      return `${row.reporter}가 보유비율을 ${pct(row.prev)}%에서 ${pct(row.cur)}%로 높이며 5% 보고 대상에 새로 포함됐습니다. 제출인 성격은 ${row.reporterType}이고, 보고사유는 '${row.reason}'입니다.`;
    }
    if ((row.delta ?? 0) > 0) {
      return `${reporter}가 보유비율을 ${rate}로 확대했습니다. 기존 주요주주의 지분 변화가 확인된 공시로, 같은 제출인의 후속 보고 여부를 함께 볼 만합니다.`;
    }
    return `${reporter}의 보유비율은 ${rate}로 집계됐습니다. 지분율 변화 폭은 크지 않지만, 보고사유와 제출인 성격을 함께 확인할 필요가 있습니다.`;
  }
  const moneyText = moneyEok(row.value);
  const movement = row.value > 0
    ? `${moneyText} 규모의 자금 유입으로 분류됩니다`
    : row.value < 0
      ? `${moneyText} 규모의 자금 유출로 분류됩니다`
      : "뚜렷한 금액 변화는 제한적인 공시입니다";
  return `${reporter} 제출 공시에서 ${movement}. 보유비율은 ${rate}이고, 보고사유는 '${row.reason}'입니다. 지분변동금액이 큰 공시는 지분율 변화 폭과 실제 주식 수 변동을 같이 확인하는 편이 좋습니다.`;
}

function reviewSentenceHtml(row, mode) {
  const rate = esc(row.rateText);
  const delta = row.delta && row.delta !== 0 ? ` (${esc(row.deltaText)})` : "";
  const reporterType = row.reporterType && row.reporterType !== "확인필요" ? ` · ${esc(row.reporterType)}` : "";
  if (mode === "entry") {
    if ((row.prev ?? 0) < 5 && (row.cur ?? 0) >= 5) {
      return `${esc(row.name)}는 ${esc(row.reporter)}${reporterType}가 새로 5% 보고 대상에 올라온 공시입니다. 다만 신규 진입이라도 장내 매집, 전환사채, 제3자배정, 공동보유 변경처럼 배경이 다를 수 있어 보고사유를 먼저 구분해 볼 필요가 있습니다.`;
    }
    if ((row.delta ?? 0) > 0) {
      return `${esc(row.name)}는 ${esc(row.reporter)}${reporterType}의 보유비율이 ${rate}${delta}로 높아진 사례입니다. 지분 확대 자체보다 제출인 성격과 반복 보고 여부가 더 중요한 관찰 지점입니다.`;
    }
    return `${esc(row.name)}는 보유비율 ${rate}${delta}로 집계됐습니다. 숫자 변화가 작아 보이더라도 특수관계자 편입·제외, 담보계약, 공동보유 변화가 섞여 있을 수 있습니다.`;
  }
  if ((row.delta ?? 0) < 0) {
    return `${esc(row.name)}는 보유비율이 ${rate}${delta}로 낮아진 공시입니다. 단순 매도인지, 계약 만료·담보 변동·공동보유 해소인지에 따라 해석이 달라질 수 있습니다.`;
  }
  return `${esc(row.name)}는 ${esc(row.reporter)}${reporterType} 제출 공시입니다. 보유비율은 ${rate}${delta}이고, 핵심은 숫자보다 보고사유와 제출인 성격의 조합입니다.`;
}

function reviewList(rows, mode) {
  const selected = rows.slice(0, Math.min(rows.length, 7));
  if (!selected.length) return `<p>조건에 맞는 리뷰 대상 공시가 아직 없습니다.</p>`;
  return `<div class="reviewList">${selected.map((row) => `
    <section class="reviewItem">
      <div class="reviewMeta">${esc(row.code)} · ${esc(row.market)} · ${esc(row.deltaText)}</div>
      <h3>${esc(row.name)}</h3>
      <p>${esc(reviewSentence(row, mode))}</p>
    </section>`).join("")}</div>`;
}

function proseReview(rows, mode) {
  const selected = rows.slice(0, Math.min(rows.length, 5));
  if (!selected.length) return `<p>조건에 맞는 공시가 없어 해당 테마는 본문에서 제외했습니다.</p>`;
  const names = selected.map((row) => esc(row.name)).join(", ");
  const reporterTypes = [...new Set(selected.map((row) => row.reporterType).filter((v) => v && v !== "확인필요"))].slice(0, 3).join(", ");
  if (mode === "entry") {
    return `<p>이 구간에서는 ${names} 등이 눈에 띕니다. 신규 5% 진입은 관심 신호가 될 수 있지만, 곧바로 매수 신호로 단정하기보다는 <strong>누가</strong> 들어왔는지와 <strong>어떤 방식</strong>으로 지분이 늘었는지를 나눠 봐야 합니다.</p>
<p>${reporterTypes ? `제출인 성격은 ${esc(reporterTypes)} 등이 섞여 있습니다. ` : ""}기관성 자금은 중장기 관점의 편입일 수 있고, 오너·특수관계자 공시는 지배구조 안정이나 승계 흐름과 연결될 수 있습니다. 반대로 전환사채·유상증자·장외거래 기반의 신규 보고는 시장에서 직접 사들인 물량과 성격이 다릅니다.</p>`;
  }
  return `<p>${names} 등은 지분율 또는 금액 변화가 확인된 공시입니다. 변동 폭이 크더라도 그 자체가 방향성을 보장하지는 않습니다. 공개매수 후속 절차, 담보계약 변경, 공동보유 관계 정리처럼 주가 수급과 직접 연결되지 않는 사유도 함께 섞일 수 있습니다.</p>
<p>따라서 이 구간은 순위보다 <strong>변동 사유의 질</strong>을 보는 편이 좋습니다. 반복 매수·장내매수·신규 편입은 추적 가치가 높고, 담보·증여·특수관계자 변동은 실제 유통 물량 변화가 제한적일 수 있습니다.</p>`;
}

function themeSection(theme, index) {
  return `
      <h2>${index}. ${esc(theme.heading)}</h2>
      <p>${esc(theme.intro)}</p>
      ${articleDataTable({ title: "", badge: theme.badge, rows: theme.rows })}
      <p class="articleTableNote outside">지분변동주식수는 직전·이번 보고서의 보유수량 차이입니다. 수량을 확인할 수 없는 항목은 -로 표시합니다.</p>
      ${proseReview(theme.rows, theme.mode)}`;
}

function pointItems(rows) {
  return rows.slice(0, 2).map((row) => `<li><strong>${esc(row.name)}:</strong> ${esc(row.reporter)} 제출 공시. 보유비율 ${esc(row.rateText)} (${esc(row.deltaText)}), 보고사유는 ${esc(row.reason)}입니다.</li>`).join("");
}

function introSummary({ items, newEntries, increases, decreases, flow, insiders }) {
  const topEntry = newEntries[0];
  const topIncrease = increases[0];
  const topDecrease = decreases[0];
  const topFlow = flow[0];
  const insiderCount = insiders.length;
  const parts = [];
  parts.push(`오늘 접수된 5%보고공시는 총 <strong>${items.length.toLocaleString("ko-KR")}건</strong>입니다.`);
  if (topEntry) parts.push(`신규 5% 진입에서는 <strong>${esc(topEntry.name)}</strong>의 변화가 먼저 눈에 띕니다.`);
  if (topIncrease) parts.push(`지분율 확대 쪽은 <strong>${esc(topIncrease.name)}</strong>이 ${esc(topIncrease.deltaText)}로 가장 큰 폭을 보였습니다.`);
  if (topDecrease) parts.push(`반대로 하락 공시는 <strong>${esc(topDecrease.name)}</strong>이 ${esc(topDecrease.deltaText)}로 상위에 올랐습니다.`);
  if (topFlow) parts.push(`금액 기준으로는 <strong>${esc(topFlow.name)}</strong> 공시가 상대적으로 컸습니다.`);
  if (insiderCount) parts.push(`오너·특수관계자 성격의 보고도 <strong>${insiderCount.toLocaleString("ko-KR")}건</strong> 확인돼 지배구조와 주요주주 흐름을 함께 볼 필요가 있습니다.`);
  return `<div class="summaryBox">${parts.join(" ")}</div>`;
}

async function main() {
  const raw = await convexQuery("dart:listDailyReportItems", { reportDate: ymd, limit: 300 });
  const items = raw.map(rowModel).filter((row) => row.name !== "-");
  const newEntries = items.filter((row) => (row.prev ?? 0) < 5 && (row.cur ?? 0) >= 5).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  const increases = items.filter((row) => (row.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const decreases = items.filter((row) => (row.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  const flow = items.filter((row) => Math.abs(row.value || 0) > 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const jpMorgan = items.filter((row) => /j\.?\s*p\.?\s*morgan|jpmorgan|제이피모간|제이피모건/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const morganStanley = items.filter((row) => /morgan\s*stanley|모건스탠리/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const blackRock = items.filter((row) => /black\s*rock|blackrock|블랙록/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const pension = items.filter((row) => /국민연금|연기금|공무원연금|사학연금|우정사업본부/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const bigManagers = items.filter((row) => /자산운용|투자신탁|투자자문|blackrock|fidelity|capital|vanguard|미래에셋|삼성자산|kb자산|신한자산|한국투자밸류|vip|브이아이피|트러스톤|베어링/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const globalAndPension = [...new Map([...jpMorgan, ...morganStanley, ...blackRock, ...pension].map((row) => [row.receiptNo + row.reporter, row])).values()]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const insiders = items.filter((row) => /오너|특수관계|최대주주|대표|임원|개인/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const primaryRows = newEntries.length ? newEntries : increases;
  const themes = [
    {
      slug: "new-entry",
      tag: newEntries.length ? "신규5%진입" : "주요5%보고",
      badge: newEntries.length ? "신규 5% 진입" : "주요 5%보고",
      heading: "신규 5% 진입 및 지분 확대 종목",
      intro: "새롭게 5% 보고 대상에 포함됐거나 기존 보유비율을 확대한 종목을 먼저 확인합니다.",
      rows: primaryRows,
      mode: "entry",
    },
    {
      slug: "increase",
      tag: "지분율증가",
      badge: "지분율 증가",
      heading: "보유비율이 증가한 종목",
      intro: "직전 보고 대비 이번 보고에서 보유비율이 높아진 공시만 모았습니다.",
      rows: increases,
      mode: "entry",
    },
    {
      slug: "decrease",
      tag: "지분율하락",
      badge: "지분율 하락",
      heading: "보유비율이 하락한 종목",
      intro: "매도·처분, 담보 변경, 특수관계자 변동 등으로 보유비율이 낮아진 공시를 따로 정리했습니다.",
      rows: decreases,
      mode: "flow",
    },
    {
      slug: "flow",
      tag: "지분변동금액TOP",
      badge: "지분변동금액 상위",
      heading: "금액 기준으로 눈에 띄는 공시",
      intro: "유효한 지분변동금액이 산출된 공시만 추려 실제 규모감을 함께 확인합니다.",
      rows: flow,
      mode: "flow",
    },
    {
      slug: "global-pension",
      tag: "주요기관",
      badge: "주요 기관",
      heading: "JP모건·모건스탠리·블랙록·연기금 주요 공시",
      intro: "당일 공시 중 글로벌 금융기관과 연기금 계열 제출인이 확인되는 종목을 별도로 모았습니다.",
      rows: globalAndPension,
      mode: "flow",
    },
    {
      slug: "jp-morgan",
      tag: "JP모건",
      badge: "JP모건",
      heading: "JP모건 관련 공시",
      intro: "JP모건 계열 제출인이 등장한 공시를 별도로 모았습니다.",
      rows: jpMorgan,
      mode: "flow",
    },
    {
      slug: "pension",
      tag: "연기금",
      badge: "연기금",
      heading: "연기금 및 공적 성격 자금 공시",
      intro: "국민연금 등 장기 자금 성격의 제출인이 확인되는 공시를 따로 정리했습니다.",
      rows: pension,
      mode: "flow",
    },
    {
      slug: "asset-manager",
      tag: "대형자산운용사",
      badge: "자산운용사",
      heading: "대형 자산운용사가 움직인 종목",
      intro: "자산운용사, 투자신탁, 글로벌 운용사 등 기관성 제출인이 등장한 공시를 모았습니다.",
      rows: bigManagers,
      mode: "flow",
    },
    {
      slug: "insider",
      tag: "오너특수관계",
      badge: "오너·특수관계",
      heading: "오너·특수관계자 지분 변동",
      intro: "오너, 최대주주, 특수관계자 성격의 제출인이 보고한 지분 변동을 별도로 확인합니다.",
      rows: insiders,
      mode: "flow",
    },
  ].filter((theme) => theme.rows.length);

  const assetDir = path.join(ROOT, "assets", "blog");
  await mkdir(assetDir, { recursive: true });
  for (const theme of themes) {
    theme.svgFile = `dart-5percent-${ymd}-${theme.slug}.svg`;
    theme.csvFile = `dart-5percent-${ymd}-${theme.slug}.csv`;
    const card = cardSvg({
      title: "Daily Dart 전자공시 요약표",
      tag: theme.tag,
      rows: theme.rows,
      fileName: theme.svgFile,
    });
    await writeFile(path.join(assetDir, theme.svgFile), card.html, "utf8");
    await writeFile(path.join(assetDir, theme.csvFile), "\uFEFF" + csvTable(theme.rows), "utf8");
  }

  const indexDir = path.join(ROOT, "blog");
  const categoryDir = path.join(indexDir, "5percent");
  const postDir = path.join(categoryDir, iso);
  await mkdir(postDir, { recursive: true });

  const postTitle = `${dotted} - 5%보고공시 요약 노트`;
  const postDescription = `${dotted} DART 5%보고공시에서 신규 진입, 지분율 증감, 주요 제출인 흐름을 정리했습니다.`;
  const postUrl = `https://leeandnote.com/blog/5percent/${iso}`;
  const imageUrl = `https://leeandnote.com/assets/blog/${themes[0]?.svgFile || `dart-5percent-${ymd}-new-entry.svg`}`;

  const leadNames = primaryRows.slice(0, 3).map((r) => r.name).join(", ");
  const themeSections = themes.map((theme, index) => themeSection(theme, index + 1)).join("\n");
  const dailySummary = introSummary({ items, newEntries, increases, decreases, flow, insiders });

  await writeFile(path.join(postDir, "index.html"), `${htmlHead({ title: postTitle, description: postDescription, canonical: postUrl, image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <article>
    <header class="blogHero">
      <div class="postMeta"><span class="postBadge">5%보고공시</span><span class="postDate">· ${dotted}</span></div>
      <h1>${postTitle}</h1>
      <div class="lead">오늘 접수된 DART 5%보고공시를 기준으로 신규 진입, 지분율 증감, 주요 제출인 흐름을 정리했습니다.</div>
      <nav class="insightTabs" aria-label="블로그 공시 주제">
        <a href="/blog/">전체</a>
        <a class="active" href="/blog/5percent/">5%보고</a>
        <a href="/blog/executives/">임원보고</a>
        <a href="/blog/contracts/">대형수주</a>
      </nav>
    </header>
    <section class="articleBody">
      <p class="articleMeta">요약 기준: ${iso} 접수 공시 · 총 ${items.length.toLocaleString("ko-KR")}건 · <a href="/editorial-policy.html">LEE&amp;NOTE 편집·검수 기준</a></p>
      ${dailySummary}
      <p>${newEntries.length ? `오늘 신규 5% 보고 대상으로 확인된 주요 종목은 <strong>${esc(leadNames)}</strong> 등입니다.` : `오늘은 신규 진입보다 기존 주요주주의 지분 변동 공시가 중심이었습니다.`} 아래에서는 <span class="softKey">신규 진입</span>, <span class="softKey">지분율 증가와 하락</span>, <span class="softKey">지분변동금액</span>, <span class="softKey">오너·특수관계자 흐름</span>을 나눠 살펴봅니다.</p>
      ${themeSections}
      <div class="blogCta">
        <div>
          <strong>실시간 DART 5%보고 공시 확인하기</strong>
          <p>주요주주의 지분 변동과 가격 흐름을 대시보드에서 바로 확인해보세요.</p>
        </div>
        <a href="/5percent">5% 스캐너 보기 →</a>
      </div>
      <div class="note">본 글은 DART 공시와 공개 가격 데이터를 바탕으로 정리한 정보 제공 콘텐츠입니다. 특정 종목의 매수·매도 추천이 아니며, 투자 판단 전 원문 공시와 시장 상황을 함께 확인해 주세요.</div>
    </section>
  </article>
  <footer class="blogFoot">출처: DART 전자공시 · LEE&NOTE 데이터 레이더</footer>
</main>
</body>
</html>
`, "utf8");

  if (!items.length) {
    await rm(postDir, { recursive: true, force: true });
    console.log(`Skipped empty 5% blog post: ${postUrl}`);
  }
  const indexTitle = "리앤노트 블로그 | DART 공시 해설과 데이터 요약";
  const indexDesc = "5%보고공시, 임원보고공시 등 DART 공시 데이터를 블로그 글과 9:16 요약 이미지로 정리합니다.";
  const insightCategories = `<div class="categoryBar" aria-label="블로그 카테고리">
    <a class="active" href="/blog/">전체</a>
    <a href="/blog/5percent/">5%보고</a>
    <a href="/blog/executives/">임원보고</a>
    <a href="/blog/contracts/">대형수주</a>
  </div>`;
  await writeFile(path.join(indexDir, "index.html"), `${htmlHead({ title: indexTitle, description: indexDesc, canonical: "https://leeandnote.com/blog/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>리앤노트가 전하는 DART전자공시 인사이트</h1>
    <div class="lead">5%보고, 임원보고, 대형수주 공시를 읽기 쉬운 요약 노트와 데이터 표로 정리합니다.</div>
  </section>
  ${insightCategories}
  <section class="insightGrid" aria-label="공시 인사이트 목록">
    <a class="insightCard" href="/blog/5percent/${iso}/">
      <div class="insightThumb"><div class="orbThumb"><span class="stars"></span><span class="orbit"></span><span class="label">5% REPORT<small>${dotted} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>5%보고 · ${dotted}</small>
        <h2>${postTitle}</h2>
        <p>${postDescription}</p>
      </div>
    </a>
    <a class="insightCard" href="/blog/executives/${iso}/">
      <div class="insightThumb"><div class="orbThumb executive"><span class="stars"></span><span class="orbit"></span><span class="label">EXECUTIVE REPORT<small>${dotted} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>임원보고 · ${dotted}</small>
        <h2>${dotted} - 임원보고공시 요약 노트</h2>
        <p>임원과 주요주주의 소유상황 변동 공시를 보고자, 보유비율, 보유주식수 변화 중심으로 정리했습니다.</p>
      </div>
    </a>
  </section>
  <footer class="blogFoot">본 서비스는 DART 공시와 공개 가격 데이터를 기반으로 한 정보 제공 서비스이며, 특정 종목의 매수·매도 추천이 아닙니다.</footer>
</main>
</body>
</html>
`, "utf8");

  await writeFile(path.join(categoryDir, "index.html"), `${htmlHead({ title: "5%보고공시 블로그 | 리앤노트", description: "DART 5%보고공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/5percent/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>5%보고 인사이트</h1>
    <div class="lead">신규 5% 진입, 지분율 급변, 주요 제출인 변화를 날짜별 요약 노트로 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a class="active" href="/blog/5percent/">5%보고</a>
    <a href="/blog/executives/">임원보고</a>
    <a href="/blog/contracts/">대형수주</a>
  </div>
  <section class="insightGrid" aria-label="5%보고 인사이트 목록">
    <a class="insightCard" href="/blog/5percent/${iso}/">
      <div class="insightThumb"><div class="orbThumb"><span class="stars"></span><span class="orbit"></span><span class="label">5% REPORT<small>${dotted} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>${dotted}</small>
        <h2>${postTitle}</h2>
        <p>${postDescription}</p>
      </div>
    </a>
  </section>
</main>
</body>
</html>
`, "utf8");

  const execRaw = await convexQuery("dart:listExecutiveDailyReportItems", { reportDate: ymd, limit: 300 });
  const execItems = execRaw.map(rowModel).filter((row) => row.name !== "-");
  const execIncreases = execItems.filter((row) => (row.delta ?? 0) > 0 || (row.shareDelta ?? 0) > 0).sort((a, b) => Math.abs(b.shareDelta ?? 0) - Math.abs(a.shareDelta ?? 0));
  const execDecreases = execItems.filter((row) => (row.delta ?? 0) < 0 || (row.shareDelta ?? 0) < 0).sort((a, b) => Math.abs(b.shareDelta ?? 0) - Math.abs(a.shareDelta ?? 0));
  const execFlow = execItems.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const execInsiders = execItems.filter((row) => /오너|특수관계|대표|이사|상무|전무|사장|회장|주요주주|개인/i.test(`${row.reporter} ${row.reporterType}`)).sort((a, b) => Math.abs(b.shareDelta ?? 0) - Math.abs(a.shareDelta ?? 0));
  const execThemes = [
    {
      slug: "increase",
      tag: "임원보유증가",
      badge: "보유 증가",
      heading: "보유주식수 또는 보유비율이 증가한 임원보고",
      intro: "당일 임원보고 중 보유주식수나 보유비율이 증가한 공시를 먼저 확인합니다.",
      rows: execIncreases,
      mode: "entry",
    },
    {
      slug: "decrease",
      tag: "임원보유감소",
      badge: "보유 감소",
      heading: "보유주식수 또는 보유비율이 감소한 임원보고",
      intro: "주요주주와 임원의 보유주식수 감소 또는 지분율 하락이 확인되는 공시를 모았습니다.",
      rows: execDecreases,
      mode: "flow",
    },
    {
      slug: "flow",
      tag: "임원변동금액",
      badge: "변동금액",
      heading: "변동금액 기준 주요 임원보고",
      intro: "비율 변화가 작더라도 실제 주식수나 금액 변화가 큰 공시를 함께 봅니다.",
      rows: execFlow,
      mode: "flow",
    },
    {
      slug: "insider",
      tag: "임원특수관계",
      badge: "임원·특수관계",
      heading: "임원·특수관계자 주요 소유상황 변동",
      intro: "대표이사, 임원, 주요주주 및 특수관계자 성격의 보고를 별도로 정리했습니다.",
      rows: execInsiders,
      mode: "flow",
    },
  ].filter((theme) => theme.rows.length);

  for (const theme of execThemes) {
    theme.svgFile = `dart-executive-${ymd}-${theme.slug}.svg`;
    theme.csvFile = `dart-executive-${ymd}-${theme.slug}.csv`;
    const card = cardSvg({
      title: "Daily Dart 임원보고 요약표",
      tag: theme.tag,
      rows: theme.rows,
      fileName: theme.svgFile,
    });
    await writeFile(path.join(assetDir, theme.svgFile), card.html, "utf8");
    await writeFile(path.join(assetDir, theme.csvFile), "\uFEFF" + csvTable(theme.rows), "utf8");
  }

  const execCategoryDir = path.join(indexDir, "executives");
  const execPostDir = path.join(execCategoryDir, iso);
  await mkdir(execPostDir, { recursive: true });
  const execPostTitle = `${dotted} - 임원보고공시 요약 노트`;
  const execPostDescription = `${dotted} DART 임원보고공시에서 임원·주요주주의 보유주식수와 보유비율 변동을 정리했습니다.`;
  const execPostUrl = `https://leeandnote.com/blog/executives/${iso}`;
  const execLeadNames = (execIncreases.length ? execIncreases : execItems).slice(0, 3).map((r) => r.name).join(", ");
  const execSummary = `<div class="summaryBox">오늘 접수된 임원보고공시는 총 <strong>${execItems.length.toLocaleString("ko-KR")}건</strong>입니다.${execLeadNames ? ` 주요 확인 종목은 <strong>${esc(execLeadNames)}</strong> 등입니다.` : ""} 비율 변화가 작게 보이는 공시는 실제 보유주식수 변동을 함께 확인하는 편이 좋습니다.</div>`;
  const execThemeSections = execThemes.length
    ? execThemes.map((theme, index) => themeSection(theme, index + 1)).join("\n")
    : `<p>오늘 기준으로 블로그 표에 표시할 임원보고 데이터가 아직 충분하지 않습니다.</p>`;

  await writeFile(path.join(execPostDir, "index.html"), `${htmlHead({ title: execPostTitle, description: execPostDescription, canonical: execPostUrl, image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <article>
    <header class="blogHero">
      <div class="postMeta"><span class="postBadge">임원보고공시</span><span class="postDate">· ${dotted}</span></div>
      <h1>${execPostTitle}</h1>
      <div class="lead">오늘 접수된 DART 임원보고공시를 기준으로 보고자, 보유비율, 보유주식수 변화를 정리했습니다.</div>
      <nav class="insightTabs" aria-label="블로그 공시 주제">
        <a href="/blog/">전체</a>
        <a href="/blog/5percent/">5%보고</a>
        <a class="active" href="/blog/executives/">임원보고</a>
        <a href="/blog/contracts/">대형수주</a>
      </nav>
    </header>
    <section class="articleBody">
      <p class="articleMeta">요약 기준: ${iso} 접수 공시 · 총 ${execItems.length.toLocaleString("ko-KR")}건 · <a href="/editorial-policy.html">LEE&amp;NOTE 편집·검수 기준</a></p>
      ${execSummary}
      <p>임원보고는 지분율이 0.00%처럼 작게 보이더라도 실제 보유주식수 변화가 의미 있는 경우가 있습니다. 아래에서는 <span class="softKey">보유 증가</span>, <span class="softKey">보유 감소</span>, <span class="softKey">변동금액</span> 흐름을 나눠 살펴봅니다.</p>
      ${execThemeSections}
      <div class="blogCta">
        <div>
          <strong>실시간 임원보고 공시 확인하기</strong>
          <p>임원과 주요주주의 소유상황 변동을 대시보드에서 바로 확인해보세요.</p>
        </div>
        <a href="/executives">임원보고 스캐너 보기 →</a>
      </div>
      <div class="note">본 글은 DART 공시와 공개 가격 데이터를 바탕으로 정리한 정보 제공 콘텐츠입니다. 특정 종목의 매수·매도 추천이 아니며, 투자 판단 전 원문 공시와 시장 상황을 함께 확인해 주세요.</div>
    </section>
  </article>
  <footer class="blogFoot">출처: DART 전자공시 · LEE&NOTE 데이터 레이더</footer>
</main>
</body>
</html>
`, "utf8");

  if (!execItems.length) {
    await rm(execPostDir, { recursive: true, force: true });
    console.log(`Skipped empty executives blog post: ${execPostUrl}`);
  }

  await writeFile(path.join(execCategoryDir, "index.html"), `${htmlHead({ title: "임원보고공시 블로그 | 리앤노트", description: "DART 임원보고공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/executives/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>임원보고 인사이트</h1>
    <div class="lead">임원·주요주주의 소유상황 변동을 날짜별 요약 노트로 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a href="/blog/5percent/">5%보고</a>
    <a class="active" href="/blog/executives/">임원보고</a>
    <a href="/blog/contracts/">대형수주</a>
  </div>
  <section class="insightGrid" aria-label="임원보고 인사이트 목록">
    <a class="insightCard" href="/blog/executives/${iso}/">
      <div class="insightThumb"><div class="orbThumb executive"><span class="stars"></span><span class="orbit"></span><span class="label">EXECUTIVE REPORT<small>${dotted} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>${dotted}</small>
        <h2>${execPostTitle}</h2>
        <p>${execPostDescription}</p>
      </div>
    </a>
  </section>
</main>
</body>
</html>
`, "utf8");

  const contractItems = await loadContractBlogItems();
  const contractCategoryDir = path.join(indexDir, "contracts");
  const contractPostDir = path.join(contractCategoryDir, iso);
  await mkdir(contractPostDir, { recursive: true });
  const contractPostTitle = `${dotted} - 대형수주보고 요약 노트`;
  const contractPostDescription = `${dotted} DART 단일판매·공급계약 공시에서 계약금액, 매출액 대비 비중, 계약상대방과 기간을 정리했습니다.`;
  const contractPostUrl = `https://leeandnote.com/blog/contracts/${iso}`;
  const contractLeadNames = contractItems.slice(0, 3).map((r) => r.name).join(", ");

  await writeFile(path.join(contractPostDir, "index.html"), `${htmlHead({ title: contractPostTitle, description: contractPostDescription, canonical: contractPostUrl, image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <article>
    <header class="blogHero">
      <div class="postMeta"><span class="postBadge">대형수주보고</span><span class="postDate">· ${dotted}</span></div>
      <h1>${contractPostTitle}</h1>
      <div class="lead">오늘 접수된 DART 단일판매·공급계약 공시를 기준으로 계약금액과 매출액 대비 비중이 큰 수주 흐름을 정리했습니다.</div>
      <nav class="insightTabs" aria-label="블로그 공시 주제">
        <a href="/blog/">전체</a>
        <a href="/blog/5percent/">5%보고</a>
        <a href="/blog/executives/">임원보고</a>
        <a class="active" href="/blog/contracts/">대형수주</a>
      </nav>
    </header>
    <section class="articleBody">
      <p class="articleMeta">요약 기준: ${iso} 접수 공시 · 총 ${contractItems.length.toLocaleString("ko-KR")}건 · <a href="/editorial-policy.html">LEE&amp;NOTE 편집·검수 기준</a></p>
      <div class="summaryBox">오늘 접수된 대형수주 공시는 총 <strong>${contractItems.length.toLocaleString("ko-KR")}건</strong>입니다.${contractLeadNames ? ` 주요 확인 종목은 <strong>${esc(contractLeadNames)}</strong> 등입니다.` : ""} 계약금액뿐 아니라 매출액 대비 비중과 계약기간을 함께 보는 것이 중요합니다.</div>
      ${contractInsightText(contractItems)}
      <h2>주요 대형수주 공시</h2>
      <p>금액 규모와 매출액 대비 비중이 함께 확인되는 공시만 추려 살펴봅니다. 같은 금액이라도 계약기간이 길면 연간 실적 기여도는 낮아질 수 있습니다.</p>
      ${contractArticleTable(contractItems)}
      <div class="blogCta">
        <div>
          <strong>실시간 대형수주 공시 확인하기</strong>
          <p>단일판매·공급계약 공시를 계약금액, 매출액 대비, 기간 기준으로 확인해보세요.</p>
        </div>
        <a href="/contracts">대형수주 스캐너 보기 →</a>
      </div>
      <div class="note">본 글은 DART 공시와 공개 데이터를 바탕으로 정리한 정보 제공 콘텐츠입니다. 특정 종목의 매수·매도 추천이 아니며, 투자 판단 전 원문 공시와 계약 조건을 함께 확인해 주세요.</div>
    </section>
  </article>
  <footer class="blogFoot">출처: DART 전자공시 · LEE&NOTE 데이터 레이더</footer>
</main>
</body>
</html>
`, "utf8");

  if (!contractItems.length) {
    await rm(contractPostDir, { recursive: true, force: true });
    console.log(`Skipped empty contracts blog post: ${contractPostUrl}`);
  }

  await writeFile(path.join(contractCategoryDir, "index.html"), `${htmlHead({ title: "대형수주보고 블로그 | 리앤노트", description: "DART 단일판매·공급계약 공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/contracts/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>대형수주 인사이트</h1>
    <div class="lead">단일판매·공급계약 공시를 계약금액, 매출액 대비 비중, 계약기간 기준으로 날짜별 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a href="/blog/5percent/">5%보고</a>
    <a href="/blog/executives/">임원보고</a>
    <a class="active" href="/blog/contracts/">대형수주</a>
  </div>
  <section class="insightGrid" aria-label="대형수주 인사이트 목록">
    <a class="insightCard" href="/blog/contracts/${iso}/">
      <div class="insightThumb"><div class="orbThumb contract"><span class="stars"></span><span class="orbit"></span><span class="label">CONTRACT REPORT<small>${dotted} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>${dotted}</small>
        <h2>${contractPostTitle}</h2>
        <p>${contractPostDescription}</p>
      </div>
    </a>
  </section>
</main>
</body>
</html>
`, "utf8");

  const redirectsPath = path.join(ROOT, "_redirects");
  let redirects = await readFile(redirectsPath, "utf8");
  redirects = redirects.replace(/^\/blog\.html \/ 302\r?\n/m, "");
  if (!redirects.includes("/blog /blog/ 301")) redirects = `/blog /blog/ 301\n${redirects}`;
  redirects = redirects.replace(/^\/blog\.html \/blog 301\r?\n/m, "");
  if (!redirects.includes("/blog.html /blog/ 301")) redirects = `/blog.html /blog/ 301\n${redirects}`;
  await writeFile(redirectsPath, redirects, "utf8");

  const robotsPath = path.join(ROOT, "robots.txt");
  let robots = await readFile(robotsPath, "utf8");
  robots = robots.replace(/^Disallow: \/blog\.html\r?\n/m, "");
  await writeFile(robotsPath, robots, "utf8");

  const urls = [
    ["https://leeandnote.com/", "1.0", "daily"],
    ["https://leeandnote.com/5percent", "0.9", "daily"],
    ["https://leeandnote.com/executives", "0.9", "daily"],
    ["https://leeandnote.com/blog/", "0.8", "daily"],
    ["https://leeandnote.com/blog/5percent/", "0.8", "daily"],
    [`https://leeandnote.com/blog/5percent/${iso}/`, "0.7", "weekly"],
    ["https://leeandnote.com/blog/executives/", "0.8", "daily"],
    [`https://leeandnote.com/blog/executives/${iso}/`, "0.7", "weekly"],
    ["https://leeandnote.com/disclaimer.html", "0.4", "monthly"],
    ["https://leeandnote.com/privacy.html", "0.4", "monthly"],
    ["https://leeandnote.com/terms.html", "0.3", "monthly"],
    ["https://leeandnote.com/contact.html", "0.3", "monthly"],
    ["https://leeandnote.com/about.html", "0.6", "monthly"],
    ["https://leeandnote.com/editorial-policy.html", "0.6", "monthly"],
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([loc, priority, changefreq]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${iso}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
  await writeFile(path.join(ROOT, "sitemap.xml"), sitemap, "utf8");
  const dateDirPattern = /^\d{4}-\d{2}-\d{2}$/;
  async function hasPublishedRows(dir, kind) {
    try {
      const html = await readFile(path.join(dir, "index.html"), "utf8");
      const zeroCountPattern = kind === "executives" ? /총\s*0건/ : /총\s*0건/;
      return !zeroCountPattern.test(html);
    } catch {
      return false;
    }
  }

  async function listPostDates(dir, kind) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const dates = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !dateDirPattern.test(entry.name)) continue;
        const postDirForDate = path.join(dir, entry.name);
        if (await hasPublishedRows(postDirForDate, kind)) {
          dates.push(entry.name);
        }
      }
      return dates.sort().reverse();
    } catch {
      return [];
    }
  }

function addIsoDays(isoDate, days) {
  const d = new Date(isoDate + "T12:00:00+09:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

  function dottedDate(date) {
    return date.replaceAll("-", ".");
  }

  function insightCard({ kind, date }) {
    const isExecutive = kind === "executives";
    const isContract = kind === "contracts";
    const dottedItem = dottedDate(date);
    const href = isContract ? `/blog/contracts/${date}/` : isExecutive ? `/blog/executives/${date}/` : `/blog/5percent/${date}/`;
    const label = isContract ? "대형수주" : isExecutive ? "임원보고" : "5%보고";
    const title = isContract ? `${dottedItem} - 대형수주보고 요약 노트` : isExecutive ? `${dottedItem} - 임원보고공시 요약 노트` : `${dottedItem} - 5%보고공시 요약 노트`;
    const desc = isContract
      ? "DART 단일판매·공급계약 공시에서 계약금액, 매출액 대비 비중, 계약기간을 정리했습니다."
      : isExecutive
        ? "임원과 주요주주의 소유상황 변동을 보고자, 보유비율, 보유주식수 중심으로 정리했습니다."
        : "DART 5%보고공시에서 신규 진입, 지분율 증감, 주요 제출인 흐름을 정리했습니다.";
    const thumbClass = isContract ? " contract" : isExecutive ? " executive" : "";
    const thumbLabel = isContract ? "CONTRACT REPORT" : isExecutive ? "EXECUTIVE REPORT" : "5% REPORT";
    return `<a class="insightCard" href="${href}">
      <div class="insightThumb"><div class="orbThumb${thumbClass}"><span class="stars"></span><span class="orbit"></span><span class="label">${thumbLabel}<small>${dottedItem} DART NOTE</small></span></div></div>
      <div class="insightContent">
        <small>${label} · ${dottedItem}</small>
        <h2>${title}</h2>
        <p>${desc}</p>
      </div>
    </a>`;
  }

  const fivePostDates = await listPostDates(categoryDir, "5percent");
  const execPostDates = await listPostDates(execCategoryDir, "executives");
  const contractPostDates = await listPostDates(contractCategoryDir, "contracts");
  const allPostCards = [
    ...fivePostDates.map((date) => ({ kind: "5percent", date })),
    ...execPostDates.map((date) => ({ kind: "executives", date })),
    ...contractPostDates.map((date) => ({ kind: "contracts", date })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind))
    .map(insightCard)
    .join("\n");
  const fivePostCards = fivePostDates.map((date) => insightCard({ kind: "5percent", date })).join("\n");
  const execPostCards = execPostDates.map((date) => insightCard({ kind: "executives", date })).join("\n");
  const contractPostCards = contractPostDates.map((date) => insightCard({ kind: "contracts", date })).join("\n");
  const latestFivePostDate = fivePostDates[0] || "";
  const fiveNoReportStart = latestFivePostDate ? addIsoDays(latestFivePostDate, 1) : "";
  const fiveStatusNotice = latestFivePostDate && latestFivePostDate < iso
    ? `<div class="statusNotice"><strong>5%보고 최신 점검:</strong> 최근 5%보고공시 요약 노트는 <em>${dottedDate(latestFivePostDate)}</em>까지 발행됐습니다. ${fiveNoReportStart && fiveNoReportStart <= iso ? `<em>${dottedDate(fiveNoReportStart)}~${dotted}</em> 구간은 운영 DB 기준 5%보고공시 접수 0건으로 확인되어 빈 글은 발행하지 않았습니다.` : ""}</div>`
    : latestFivePostDate
      ? `<div class="statusNotice"><strong>5%보고 최신 점검:</strong> 운영 DB 기준 최신 5%보고공시 요약 노트는 <em>${dottedDate(latestFivePostDate)}</em>입니다.</div>`
      : `<div class="statusNotice"><strong>5%보고 최신 점검:</strong> 아직 발행 가능한 5%보고공시가 확인되지 않았습니다.</div>`;

  await writeFile(path.join(indexDir, "index.html"), `${htmlHead({ title: indexTitle, description: indexDesc, canonical: "https://leeandnote.com/blog/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>리앤노트가 전하는 DART전자공시 인사이트</h1>
    <div class="lead">5%보고, 임원보고, 대형수주 공시를 읽기 쉬운 요약 노트와 데이터 표로 정리합니다.</div>
  </section>
  ${insightCategories}
  <section class="insightGrid" aria-label="공시 인사이트 목록">
    ${allPostCards || "<p>아직 발행된 인사이트가 없습니다.</p>"}
  </section>
  <footer class="blogFoot">본 서비스는 DART 공시와 공개 가격 데이터를 기반으로 한 정보 제공 서비스이며, 특정 종목의 매수·매도 추천이 아닙니다.</footer>
</main>
</body>
</html>
`, "utf8");

  await writeFile(path.join(categoryDir, "index.html"), `${htmlHead({ title: "5%보고공시 블로그 | 리앤노트", description: "DART 5%보고공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/5percent/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>5%보고 인사이트</h1>
    <div class="lead">신규 5% 진입, 지분율 급변, 주요 제출인 변화를 날짜별 요약 노트로 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a class="active" href="/blog/5percent/">5%보고</a>
    <a href="/blog/executives/">임원보고</a>
    <a href="/blog/contracts/">대형수주</a>
  </div>
  ${fiveStatusNotice}
  <section class="insightGrid" aria-label="5%보고 인사이트 목록">
    ${fivePostCards || "<p>아직 발행된 5%보고 인사이트가 없습니다.</p>"}
  </section>
</main>
</body>
</html>
`, "utf8");

  await writeFile(path.join(execCategoryDir, "index.html"), `${htmlHead({ title: "임원보고공시 블로그 | 리앤노트", description: "DART 임원보고공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/executives/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>임원보고 인사이트</h1>
    <div class="lead">임원·주요주주의 소유상황 변동을 날짜별 요약 노트로 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a href="/blog/5percent/">5%보고</a>
    <a class="active" href="/blog/executives/">임원보고</a>
    <a href="/blog/contracts/">대형수주</a>
  </div>
  <section class="insightGrid" aria-label="임원보고 인사이트 목록">
    ${execPostCards || "<p>아직 발행된 임원보고 인사이트가 없습니다.</p>"}
  </section>
</main>
</body>
</html>
`, "utf8");

  await writeFile(path.join(contractCategoryDir, "index.html"), `${htmlHead({ title: "대형수주보고 블로그 | 리앤노트", description: "DART 단일판매·공급계약 공시를 일자별로 정리한 리앤노트 블로그 카테고리입니다.", canonical: "https://leeandnote.com/blog/contracts/", image: imageUrl })}
<body class="blogBody">
${blogCss()}
${pageNav("blog")}
<main class="blogShell">
  <section class="blogHero">
    <p>LEE&NOTE INSIGHT</p>
    <h1>대형수주 인사이트</h1>
    <div class="lead">단일판매·공급계약 공시를 계약금액, 매출액 대비 비중, 계약기간 기준으로 날짜별 축적합니다.</div>
  </section>
  <div class="categoryBar" aria-label="블로그 카테고리">
    <a href="/blog/">전체</a>
    <a href="/blog/5percent/">5%보고</a>
    <a href="/blog/executives/">임원보고</a>
    <a class="active" href="/blog/contracts/">대형수주</a>
  </div>
  <section class="insightGrid" aria-label="대형수주 인사이트 목록">
    ${contractPostCards || "<p>아직 발행된 대형수주 인사이트가 없습니다.</p>"}
  </section>
</main>
</body>
</html>
`, "utf8");

  const accumulatedUrls = [
    ["https://leeandnote.com/", "1.0", "daily"],
    ["https://leeandnote.com/5percent", "0.9", "daily"],
    ["https://leeandnote.com/executives", "0.9", "daily"],
    ["https://leeandnote.com/blog/", "0.8", "daily"],
    ["https://leeandnote.com/blog/5percent/", "0.8", "daily"],
    ...fivePostDates.map((date) => [`https://leeandnote.com/blog/5percent/${date}/`, "0.7", "weekly"]),
    ["https://leeandnote.com/blog/executives/", "0.8", "daily"],
    ...execPostDates.map((date) => [`https://leeandnote.com/blog/executives/${date}/`, "0.7", "weekly"]),
    ["https://leeandnote.com/blog/contracts/", "0.8", "daily"],
    ...contractPostDates.map((date) => [`https://leeandnote.com/blog/contracts/${date}/`, "0.7", "weekly"]),
    ["https://leeandnote.com/disclaimer.html", "0.4", "monthly"],
    ["https://leeandnote.com/privacy.html", "0.4", "monthly"],
    ["https://leeandnote.com/terms.html", "0.3", "monthly"],
    ["https://leeandnote.com/contact.html", "0.3", "monthly"],
    ["https://leeandnote.com/about.html", "0.6", "monthly"],
    ["https://leeandnote.com/editorial-policy.html", "0.6", "monthly"],
  ];
  const accumulatedSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${accumulatedUrls.map(([loc, priority, changefreq]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${iso}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
  await writeFile(path.join(ROOT, "sitemap.xml"), accumulatedSitemap, "utf8");

  console.log(`Generated blog post: ${postUrl}`);
  console.log(`Rows used: ${items.length}, new entries: ${newEntries.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});





