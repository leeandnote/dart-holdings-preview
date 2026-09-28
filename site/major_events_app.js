const majorEventColumns = [
  { key: "stock", label: "종목" },
  { key: "date", label: "접수일" },
  { key: "type", label: "유형구분" },
  { key: "event", label: "주요 사건 / 내용" },
  { key: "metric", label: "핵심 지표 / 수치" },
  { key: "price", label: "최근일 종가" },
];
const majorEventState = {
  rows: [], search: "", market: "all", type: "all", from: "", to: "",
  sort: "date", page: 1, pageSize: 10,
  visibleColumns: new Set(majorEventColumns.map((column) => column.key)),
};

const majorEventEl = (id) => document.getElementById(id);
const majorEventCompactDate = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const majorEventDisplayDate = (value, separator = ".") => {
  const date = majorEventCompactDate(value);
  return date.length === 8 ? [date.slice(0, 4), date.slice(4, 6), date.slice(6, 8)].join(separator) : "-";
};
const majorEventEscape = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const majorEventNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const compactText = (value) => String(value || "").replace(/\s+/g, " ").trim();

function cleanMajorEventTitle(reportName, summary) {
  const source = compactText(reportName);
  const parenthetical = source.match(/투자판단\s*관련\s*주요경영사항\s*\(([^)]+)\)/i)?.[1];
  const cleaned = (parenthetical || source)
    .replace(/^\[(?:기재|첨부|본문)?정정\]\s*/u, "")
    .replace(/투자판단\s*관련\s*주요경영사항/giu, "")
    .replace(/^\s*[-:：·]\s*/u, "")
    .trim();
  if (cleaned) return cleaned;
  const summaryText = compactText(summary);
  const labeledTitle = summaryText.match(/(?:^|\s)(?:1\.\s*)?제목\s*[:：]?\s*(.{2,90}?)(?=\s*(?:2\.|주요내용|사실발생|$))/u)?.[1];
  if (labeledTitle) return compactText(labeledTitle);
  const fallback = summaryText
    .replace(/^\s*\/?\s*\(\d{4}[.-]\d{2}[.-]\d{2}\)\s*/u, "")
    .replace(/^\s*(?:1\.\s*)?제목\s*[:：]?\s*/u, "")
    .replace(/^\s*[-:：·/]\s*/u, "");
  return fallback.split(/[.!?。/]/u)[0].trim() || "주요경영사항";
}

function classifyMajorEvent(text) {
  if (/마일스톤|기술료|기술수출|license|licensing|royalt/i.test(text)) return "milestone";
  if (/임상|IND|시험계획|품목허가|신약|FDA|식약처/i.test(text)) return "clinical";
  if (/단일판매|공급계약|수주|낙찰|계약체결|공사금액|사업비/i.test(text)) return "contract";
  if (/소송|판결|중재|분쟁|가처분|손해배상/i.test(text)) return "litigation";
  return "other";
}

function extractKrwAmount(row, text) {
  const structured = majorEventNumber(row["계약금액"]);
  if (structured && structured > 0) return structured;
  const eok = text.match(/(?:약\s*)?([\d,]+(?:\.\d+)?)\s*억\s*원/u);
  if (eok) return Number(eok[1].replaceAll(",", "")) * 100000000;
  const won = text.match(/(?:금액|계약금액|공사금액|예정금액|수령액)[^\d]{0,18}([\d,]{7,})\s*원/u);
  return won ? Number(won[1].replaceAll(",", "")) : null;
}

function extractRatio(row, text) {
  const structured = majorEventNumber(row["매출대비비율"]);
  if (structured !== null) return structured;
  const matched = text.match(/(?:매출액|최근\s*매출액)[^%]{0,28}?([\d,]+(?:\.\d+)?)\s*%/u)
    || text.match(/([\d,]+(?:\.\d+)?)\s*%\s*(?:에\s*)?해당/u);
  return matched ? Number(matched[1].replaceAll(",", "")) : null;
}

function extractForeignAmount(text) {
  const usdM = text.match(/(?:USD|US\$|\$)\s*([\d,.]+)\s*(?:M|million)/i);
  if (usdM) return { label: `$${usdM[1]}M`, value: Number(usdM[1].replaceAll(",", "")) * 1000000 };
  const millionDollar = text.match(/([\d,.]+)\s*만\s*달러/u);
  if (millionDollar) return { label: `$${(Number(millionDollar[1].replaceAll(",", "")) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`, value: Number(millionDollar[1].replaceAll(",", "")) * 10000 };
  const usd = text.match(/(?:USD|US\$|\$)\s*([\d,]+)/i);
  return usd ? { label: `$${usd[1]}`, value: Number(usd[1].replaceAll(",", "")) } : null;
}

function extractClinicalStage(text) {
  const country = text.match(/미국|한국|국내|유럽|중국|일본|글로벌/u)?.[0] || "";
  const phase = text.match(/(?:임상\s*)?(?:제\s*)?([1-4](?:\/[1-4])?[abc]?)\s*상/iu)?.[1];
  if (phase) return `${country ? `${country} ` : ""}${phase}상`;
  if (/IND/i.test(text)) return `${country ? `${country} ` : ""}IND`;
  return "";
}

function extractStatus(text, type) {
  if (/변경\s*승인\s*신청|변경승인신청/u.test(text)) return "변경승인 신청";
  if (/시험계획[^.]{0,20}승인|IND[^.]{0,14}승인/i.test(text)) return "IND 승인";
  if (/시험계획[^.]{0,20}신청|IND[^.]{0,14}신청/i.test(text)) return "IND 신청";
  if (/마일스톤[^.]{0,22}(?:수령|지급)/u.test(text)) return "마일스톤 수령";
  if (/낙찰자?\s*선정|공동\s*낙찰/u.test(text)) return "낙찰자 선정";
  if (/계약\s*체결|수주/u.test(text)) return "계약 체결";
  if (type === "litigation") return "소송 진행";
  return "주요사항 공시";
}

function typeMeta(type) {
  return {
    contract: { label: "단일판매·수주", short: "계약" },
    clinical: { label: "임상/IND", short: "임상" },
    milestone: { label: "기술수출/마일스톤", short: "기술료" },
    litigation: { label: "소송/분쟁", short: "소송" },
    other: { label: "기타 주요경영사항", short: "기타" },
  }[type];
}

function eventSecondary(row, text) {
  const structured = compactText(row["계약상대방"] || row["계약내용"]);
  if (structured) return structured;
  const counterparty = text.match(/(?:계약상대방|상대방|발주처|파트너)\s*[:：]?\s*([^,.;|]{2,54})/u)?.[1];
  const indication = text.match(/(?:적응증|대상질환)\s*[:：]?\s*([^,.;|]{2,54})/u)?.[1];
  const fallback = compactText(text)
    .replace(/\[(?:기재|첨부|본문)?정정\]\s*/gu, "")
    .replace(/투자판단\s*관련\s*주요경영사항(?:\s*\([^)]+\))?/giu, "")
    .replace(/^\s*\/?\s*\(\d{4}[.-]\d{2}[.-]\d{2}\)\s*/u, "")
    .replace(/^\s*(?:1\.\s*)?제목\s*[:：]?\s*/u, "")
    .replace(/^\s*[-:：·/]\s*/u, "");
  return compactText(counterparty || indication || fallback).slice(0, 82);
}

function latestMajorEventPrice(stockCode) {
  const current = window.__CURRENT_PRICES__?.[stockCode] || {};
  const close = majorEventNumber(current.close);
  const changeRate = majorEventNumber(current.changeRate ?? current.changePct);
  return {
    close,
    changeRate,
    date: String(current.date || ""),
  };
}

function normalizeMajorEvent(row) {
  const reportName = compactText(row["보고서명"]);
  const summary = compactText(row["주요내용"] || reportName);
  const combined = compactText(`${reportName} ${summary} ${row["계약상대방"] || ""} ${row["계약내용"] || ""}`);
  const type = classifyMajorEvent(combined);
  return {
    date: majorEventCompactDate(row["접수일"]),
    market: String(row["시장"] || ""),
    corpName: String(row["종목명"] || ""),
    stockCode: String(row["종목코드"] || ""),
    reportName,
    title: cleanMajorEventTitle(reportName, summary),
    summary,
    secondary: eventSecondary(row, combined),
    receiptNo: String(row["접수번호"] || ""),
    url: String(row.DART_URL || "#"),
    type,
    amount: extractKrwAmount(row, combined),
    ratio: extractRatio(row, combined),
    foreignAmount: extractForeignAmount(combined),
    clinicalStage: extractClinicalStage(combined),
    status: extractStatus(combined, type),
    price: latestMajorEventPrice(String(row["종목코드"] || "")),
  };
}

function filteredMajorEvents() {
  const query = majorEventState.search.trim().toLowerCase();
  const from = majorEventCompactDate(majorEventState.from);
  const to = majorEventCompactDate(majorEventState.to);
  const rows = majorEventState.rows.filter((row) => {
    if (majorEventState.market !== "all" && row.market !== majorEventState.market) return false;
    if (majorEventState.type !== "all" && row.type !== majorEventState.type) return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    if (query && !`${row.corpName} ${row.stockCode} ${row.reportName} ${row.summary} ${row.secondary} ${typeMeta(row.type).label}`.toLowerCase().includes(query)) return false;
    return true;
  });
  return rows.sort((a, b) => {
    if (majorEventState.sort === "amount") return (b.amount || -1) - (a.amount || -1) || b.date.localeCompare(a.date);
    if (majorEventState.sort === "ratio") return (b.ratio || -1) - (a.ratio || -1) || b.date.localeCompare(a.date);
    if (majorEventState.sort === "price") return (b.price.close || -1) - (a.price.close || -1) || b.date.localeCompare(a.date);
    if (majorEventState.sort === "corpName") return a.corpName.localeCompare(b.corpName, "ko") || b.date.localeCompare(a.date);
    return b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo);
  });
}

function formatEok(value) {
  if (!Number.isFinite(value)) return "-";
  const eok = value / 100000000;
  return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: eok >= 100 ? 0 : 1 })}억 원`;
}

function formatPrice(value) {
  return Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}원` : "-";
}

function renderStockLogo(row) {
  return window.StockLogo?.render({ stockCode: row.stockCode, stockName: row.corpName })
    || `<span class="stockLogoComponent"><span class="stockLogoFallback">${majorEventEscape(Array.from(row.corpName || "?")[0] || "?")}</span></span>`;
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.stockCode}:${row.receiptNo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCurationItem(row, metric, meta) {
  return `<div class="majorCurationItem">
    <span class="majorCurationRank">${meta.rank}</span>
    <span class="majorCurationName"><strong>${majorEventEscape(row.corpName)}</strong><em title="${majorEventEscape(row.title)}">${majorEventEscape(row.title)}</em></span>
    <span class="majorCurationMetric"><strong>${majorEventEscape(metric)}</strong><em>${majorEventEscape(meta.sub)}</em></span>
  </div>`;
}

function renderMajorEventCuration() {
  const all = majorEventState.rows;
  const contracts = uniqueRows(all.filter((row) => row.type === "contract" && Number.isFinite(row.amount)).sort((a, b) => b.amount - a.amount)).slice(0, 3);
  const ratios = uniqueRows(all.filter((row) => row.type === "contract" && Number.isFinite(row.ratio)).sort((a, b) => b.ratio - a.ratio)).slice(0, 3);
  const pipeline = uniqueRows(all.filter((row) => row.type === "clinical" || row.type === "milestone").sort((a, b) => b.date.localeCompare(a.date) || (b.amount || 0) - (a.amount || 0))).slice(0, 3);
  const panels = [
    {
      tone: "contract", tag: "계약", title: "#단일 수주/계약 규모 TOP", caption: "단일 계약금액 상위 순",
      rows: contracts, metric: (row) => `▲ ${formatEok(row.amount)}`, sub: (row) => row.secondary || row.status,
    },
    {
      tone: "ratio", tag: "비중", title: "#매출액 대비 계약 비중 TOP", caption: "최근 매출액 대비 비중 상위 순",
      rows: ratios, metric: (row) => `▲ ${row.ratio.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`, sub: (row) => formatEok(row.amount),
    },
    {
      tone: "pipeline", tag: "파이프라인", title: "#임상·기술수출 이슈", caption: "IND 신청·승인 및 외화 마일스톤",
      rows: pipeline,
      metric: (row) => row.foreignAmount?.label || (row.amount ? `▲ ${formatEok(row.amount)}` : row.clinicalStage || row.status),
      sub: (row) => row.type === "clinical" ? row.status : (row.clinicalStage || row.status),
    },
  ];
  majorEventEl("majorEventCuration").innerHTML = `<div class="majorCurationHead"><div><h2>핵심 변동 큐레이션</h2><p>금액, 매출 비중, 임상·기술수출 핵심 이슈를 유형별로 정리합니다.</p></div></div>
    <div class="majorCurationGrid">${panels.map((panel) => `<article class="majorCurationCard ${panel.tone}">
      <div class="majorCurationCardHead"><span>${panel.tag}</span><h3>${panel.title}</h3></div>
      <p>${panel.caption}</p>
      <div class="majorCurationList">${panel.rows.length ? panel.rows.map((row, index) => renderCurationItem(row, panel.metric(row), { rank: index + 1, sub: panel.sub(row) })).join("") : '<div class="majorCurationEmpty">분류 가능한 공시가 없습니다.</div>'}</div>
    </article>`).join("")}</div>`;
}

function renderMajorMetric(row) {
  if (row.type === "contract") {
    return `<div class="majorMetricValue"><strong>${Number.isFinite(row.amount) ? formatEok(row.amount) : row.status}</strong><em>${Number.isFinite(row.ratio) ? `매출 대비 ${row.ratio.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "금액·비중 원문 확인"}</em></div>`;
  }
  if (row.type === "clinical") {
    return `<div class="majorMetricValue"><strong>${majorEventEscape(row.clinicalStage ? `${row.clinicalStage} · ${row.status}` : row.status)}</strong><em>임상 진행 단계</em></div>`;
  }
  if (row.type === "milestone") {
    const main = row.amount ? `▲ 약 ${formatEok(row.amount)}` : (row.foreignAmount?.label || row.status);
    return `<div class="majorMetricValue"><strong>${majorEventEscape(main.replace(/^▲\s*/u, ""))}</strong><em>${majorEventEscape(row.foreignAmount?.label || "기술료·마일스톤")}</em></div>`;
  }
  return `<div class="majorMetricValue"><strong>${majorEventEscape(row.status)}</strong><em>${majorEventEscape(typeMeta(row.type).label)}</em></div>`;
}

function renderPriceCell(row) {
  const change = row.price.changeRate;
  const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const changeText = Number.isFinite(change) ? `${change > 0 ? "▲" : change < 0 ? "▼" : ""}${Math.abs(change).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%` : "등락률 확인 중";
  return `<div class="majorPrice"><strong>${formatPrice(row.price.close)}</strong><em class="${changeClass}">${changeText}</em></div>`;
}

function visibleMajorEventColumns() {
  const columns = majorEventColumns.filter((column) => majorEventState.visibleColumns.has(column.key));
  return columns.length ? columns : majorEventColumns;
}

function renderMajorEventCell(row, key) {
  if (key === "stock") return `<div class="majorStockCell">${renderStockLogo(row)}<span><strong title="${majorEventEscape(row.corpName)}">${majorEventEscape(row.corpName)}</strong><em>${majorEventEscape(row.stockCode)} · ${majorEventEscape(row.market)}</em></span></div>`;
  if (key === "date") return `<div class="majorDateCell"><strong>${majorEventDisplayDate(row.date, "-")}</strong><a href="${majorEventEscape(row.url)}" target="_blank" rel="noopener noreferrer">원문보기</a></div>`;
  if (key === "type") return `<span class="majorTypeBadge ${row.type}">${majorEventEscape(typeMeta(row.type).label)}</span>`;
  if (key === "event") return `<div class="majorEventContent"><strong title="${majorEventEscape(row.title)}">${majorEventEscape(row.title)}</strong><em title="${majorEventEscape(row.secondary)}">${majorEventEscape(row.secondary)}</em></div>`;
  if (key === "metric") return renderMajorMetric(row);
  if (key === "price") return renderPriceCell(row);
  return "-";
}

function renderMajorEventPagination(totalRows, totalPages) {
  const start = totalRows ? (majorEventState.page - 1) * majorEventState.pageSize + 1 : 0;
  const end = Math.min(totalRows, majorEventState.page * majorEventState.pageSize);
  const first = Math.max(1, Math.min(majorEventState.page - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  const pages = [];
  for (let page = first; page <= last; page += 1) pages.push(page);
  return `<nav class="pagination" aria-label="투자판단 테이블 페이지 이동"><span class="pageSummary">${start.toLocaleString("ko-KR")}-${end.toLocaleString("ko-KR")} / ${totalRows.toLocaleString("ko-KR")}건</span><div class="pageControls"><button class="pageButton" data-major-event-page="${majorEventState.page - 1}" ${majorEventState.page <= 1 ? "disabled" : ""}>이전</button>${pages.map((page) => `<button class="pageButton ${page === majorEventState.page ? "active" : ""}" data-major-event-page="${page}">${page}</button>`).join("")}<button class="pageButton" data-major-event-page="${majorEventState.page + 1}" ${majorEventState.page >= totalPages ? "disabled" : ""}>다음</button></div></nav>`;
}

function renderMajorEvents() {
  const rows = filteredMajorEvents();
  const target = majorEventEl("majorEventList");
  if (!rows.length) {
    target.innerHTML = '<div class="emptyState">조건에 맞는 투자판단 관련 주요경영사항 공시가 없습니다.</div>';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / majorEventState.pageSize));
  majorEventState.page = Math.min(Math.max(1, majorEventState.page), totalPages);
  const start = (majorEventState.page - 1) * majorEventState.pageSize;
  const pageRows = rows.slice(start, start + majorEventState.pageSize);
  const columns = visibleMajorEventColumns();
  target.innerHTML = `<div class="contractTableWrap"><table class="majorEventTable"><colgroup>${columns.map((column) => `<col class="majorCol-${column.key}">`).join("")}</colgroup><thead><tr>${columns.map((column) => `<th>${majorEventEscape(column.label)}</th>`).join("")}</tr></thead><tbody>${pageRows.map((row) => `<tr>${columns.map((column) => `<td class="majorCol-${column.key}">${renderMajorEventCell(row, column.key)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${renderMajorEventPagination(rows.length, totalPages)}`;
  target.querySelectorAll("[data-major-event-page]").forEach((button) => button.addEventListener("click", () => {
    const page = Number(button.dataset.majorEventPage);
    if (!Number.isFinite(page) || page < 1 || page > totalPages) return;
    majorEventState.page = page;
    renderMajorEvents();
  }));
}

function setupMajorEventColumns() {
  const panel = majorEventEl("majorEventColumnPanel");
  if (!panel) return;
  panel.innerHTML = majorEventColumns.map((column) => `<label><input type="checkbox" value="${column.key}" ${majorEventState.visibleColumns.has(column.key) ? "checked" : ""}> <span>${majorEventEscape(column.label)}</span></label>`).join("");
  panel.querySelectorAll("input").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const checked = Array.from(panel.querySelectorAll("input:checked")).map((item) => item.value);
    if (!checked.length) {
      checkbox.checked = true;
      return;
    }
    majorEventState.visibleColumns = new Set(checked);
    majorEventState.page = 1;
    renderMajorEvents();
  }));
}

function setMajorEventModal(id, open) {
  majorEventEl(id)?.classList.toggle("hidden", !open);
}

function plainMajorEventCell(row, key) {
  if (key === "stock") return `${row.corpName}\n${row.stockCode} · ${row.market}`;
  if (key === "date") return majorEventDisplayDate(row.date, "-");
  if (key === "type") return typeMeta(row.type).label;
  if (key === "event") return `${row.title}\n${row.secondary}`;
  if (key === "metric") {
    if (row.type === "contract") return `${formatEok(row.amount)}\n${Number.isFinite(row.ratio) ? `매출 대비 ${row.ratio}%` : row.status}`;
    if (row.type === "clinical") return `${row.clinicalStage || "-"}\n${row.status}`;
    if (row.type === "milestone") return `${row.amount ? formatEok(row.amount) : row.foreignAmount?.label || "-"}\n${row.foreignAmount?.label || row.status}`;
    return row.status;
  }
  if (key === "price") return `${formatPrice(row.price.close)}\n${Number.isFinite(row.price.changeRate) ? `${row.price.changeRate}%` : "-"}`;
  return "-";
}

function downloadMajorEventBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadMajorEventsExcel() {
  const rows = filteredMajorEvents();
  const columns = visibleMajorEventColumns();
  const header = columns.map((column) => column.label).concat("DART_URL");
  const body = rows.map((row) => columns.map((column) => plainMajorEventCell(row, column.key)).concat(row.url));
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header.map((item) => `<th>${majorEventEscape(item)}</th>`).join("")}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((item) => `<td>${majorEventEscape(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  downloadMajorEventBlob(new Blob(["\ufeff" + html], { type:"application/vnd.ms-excel;charset=utf-8" }), `투자판단공시_${majorEventDisplayDate(majorEventState.rows[0]?.date, "")}_${rows.length}건.xls`);
}

function downloadMajorEventsImage() {
  const rows = filteredMajorEvents();
  const start = (majorEventState.page - 1) * majorEventState.pageSize;
  const pageRows = rows.slice(start, start + majorEventState.pageSize);
  const width = 1320;
  const rowHeight = 58;
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = width * scale;
  canvas.height = (120 + pageRows.length * rowHeight) * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, canvas.height / scale);
  ctx.fillStyle = "#111827";
  ctx.font = "800 24px Pretendard, Arial, sans-serif";
  ctx.fillText("투자판단 관련 주요경영사항", 28, 38);
  ctx.fillStyle = "#1e2530";
  ctx.fillRect(28, 60, width - 56, 42);
  ctx.fillStyle = "#fff";
  ctx.font = "800 12px Pretendard, Arial, sans-serif";
  ["종목", "접수일", "유형", "주요 사건", "핵심 지표", "최근일 종가"].forEach((label, index) => ctx.fillText(label, [48,240,370,510,910,1140][index], 86));
  pageRows.forEach((row, index) => {
    const y = 102 + index * rowHeight;
    ctx.fillStyle = index % 2 ? "#fff" : "#fafbfc";
    ctx.fillRect(28, y, width - 56, rowHeight);
    ctx.fillStyle = "#111827";
    ctx.font = "800 12px Pretendard, Arial, sans-serif";
    [row.corpName, majorEventDisplayDate(row.date, "-"), typeMeta(row.type).label, row.title, plainMajorEventCell(row, "metric").split("\n")[0], formatPrice(row.price.close)].forEach((text, cellIndex) => {
      const x = [48,240,370,510,910,1140][cellIndex];
      const max = [170,110,120,370,200,140][cellIndex];
      let output = String(text || "-");
      while (output.length > 1 && ctx.measureText(output + "…").width > max) output = output.slice(0, -1);
      ctx.fillText(output + (output !== text ? "…" : ""), x, y + 34);
    });
  });
  canvas.toBlob((blob) => blob && downloadMajorEventBlob(blob, `투자판단공시_${majorEventState.page}페이지.png`), "image/png");
}

function initializeMajorEvents() {
  const payload = window.__DISCLOSURE_SIGNALS__ || {};
  majorEventState.rows = (payload.rows || [])
    .filter((row) => row["공시유형"] === "투자판단관련주요경영사항")
    .map(normalizeMajorEvent)
    .sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo));
  const first = majorEventState.rows.at(-1)?.date;
  const last = majorEventState.rows[0]?.date;
  majorEventEl("majorEventPeriod").textContent = first && last ? `수록기간 ${majorEventDisplayDate(first)} ~ ${majorEventDisplayDate(last)} · ${majorEventState.rows.length.toLocaleString("ko-KR")}건` : "수집된 공시가 없습니다.";
  majorEventEl("majorEventSearch").addEventListener("input", (event) => { majorEventState.search = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventMarket").addEventListener("change", (event) => { majorEventState.market = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventType").addEventListener("change", (event) => { majorEventState.type = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventFrom").addEventListener("change", (event) => { majorEventState.from = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventTo").addEventListener("change", (event) => { majorEventState.to = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventSort").addEventListener("change", (event) => { majorEventState.sort = event.target.value; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventPageSize").addEventListener("change", (event) => { majorEventState.pageSize = Number(event.target.value) || 10; majorEventState.page = 1; renderMajorEvents(); });
  majorEventEl("majorEventFilterBtn").addEventListener("click", () => setMajorEventModal("majorEventFilterModal", true));
  majorEventEl("majorEventColumnsBtn").addEventListener("click", () => setMajorEventModal("majorEventColumnsModal", true));
  majorEventEl("majorEventXlsBtn").addEventListener("click", downloadMajorEventsExcel);
  majorEventEl("majorEventImgBtn").addEventListener("click", downloadMajorEventsImage);
  document.querySelectorAll("[data-major-event-close]").forEach((button) => button.addEventListener("click", () => setMajorEventModal(button.dataset.majorEventClose, false)));
  document.querySelectorAll(".modalOverlay").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); }));
  setupMajorEventColumns();
  renderMajorEventCuration();
  renderMajorEvents();
}

initializeMajorEvents();
