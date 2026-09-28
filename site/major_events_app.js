const majorEventState = { rows: [], search: "", market: "all", from: "", to: "" };

const majorEventEl = (id) => document.getElementById(id);
const majorEventCompactDate = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const majorEventDisplayDate = (value) => {
  const date = majorEventCompactDate(value);
  return date.length === 8 ? `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}` : "-";
};
const majorEventEscape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function normalizeMajorEvent(row) {
  return {
    date: majorEventCompactDate(row["접수일"]),
    market: String(row["시장"] || ""),
    corpName: String(row["종목명"] || ""),
    stockCode: String(row["종목코드"] || ""),
    reportName: String(row["보고서명"] || ""),
    summary: String(row["주요내용"] || row["보고서명"] || "").replace(/\s+/g, " ").trim(),
    receiptNo: String(row["접수번호"] || ""),
    url: String(row.DART_URL || "#"),
  };
}

function filteredMajorEvents() {
  const query = majorEventState.search.trim().toLowerCase();
  const from = majorEventCompactDate(majorEventState.from);
  const to = majorEventCompactDate(majorEventState.to);
  return majorEventState.rows.filter((row) => {
    if (majorEventState.market !== "all" && row.market !== majorEventState.market) return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    if (query && !`${row.corpName} ${row.stockCode} ${row.reportName} ${row.summary}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderMajorEvents() {
  const rows = filteredMajorEvents();
  const target = majorEventEl("majorEventList");
  if (!rows.length) {
    target.innerHTML = '<div class="emptyState">조건에 맞는 투자판단 관련 주요경영사항 공시가 없습니다.</div>';
    return;
  }
  target.innerHTML = `<div class="contractTableWrap"><table class="contractTable majorEventTable"><thead><tr><th>종목</th><th>공시일</th><th>공시명</th><th>주요내용</th><th>원문</th></tr></thead><tbody>${rows.map((row) => `<tr>
    <td><div class="stockCell"><span class="stockLogoSlot" data-stock-code="${majorEventEscape(row.stockCode)}" data-stock-name="${majorEventEscape(row.corpName)}"></span><div><strong>${majorEventEscape(row.corpName)}</strong><small>${majorEventEscape(row.stockCode)} · ${majorEventEscape(row.market)}</small></div></div></td>
    <td><strong>${majorEventDisplayDate(row.date)}</strong>${/정정/.test(row.reportName) ? '<small class="correctionText">정정</small>' : ""}</td>
    <td class="majorEventReport">${majorEventEscape(row.reportName)}</td>
    <td class="majorEventSummary">${majorEventEscape(row.summary)}</td>
    <td><a class="originalLink" href="${majorEventEscape(row.url)}" target="_blank" rel="noopener noreferrer">원문보기</a></td>
  </tr>`).join("")}</tbody></table></div><p class="tableCount">총 ${rows.length.toLocaleString("ko-KR")}건</p>`;
  if (window.StockLogo) {
    target.querySelectorAll(".stockLogoSlot").forEach((slot) => {
      slot.innerHTML = window.StockLogo.render({ stockCode: slot.dataset.stockCode, stockName: slot.dataset.stockName });
    });
  }
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
  majorEventEl("majorEventSearch").addEventListener("input", (event) => { majorEventState.search = event.target.value; renderMajorEvents(); });
  majorEventEl("majorEventMarket").addEventListener("change", (event) => { majorEventState.market = event.target.value; renderMajorEvents(); });
  majorEventEl("majorEventFrom").addEventListener("change", (event) => { majorEventState.from = event.target.value; renderMajorEvents(); });
  majorEventEl("majorEventTo").addEventListener("change", (event) => { majorEventState.to = event.target.value; renderMajorEvents(); });
  renderMajorEvents();
}

initializeMajorEvents();
