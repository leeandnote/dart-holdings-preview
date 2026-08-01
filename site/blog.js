const reportState = {
  rows: [],
  dates: [],
  selectedDate: "",
};

document.addEventListener("DOMContentLoaded", () => {
  const payload = window.__DART_DATA__ || {};
  reportState.rows = (payload.rows || []).map(normalizeReportRow).filter((row) => row.date);
  reportState.dates = Array.from(new Set(reportState.rows.map((row) => row.date))).sort((a, b) => b.localeCompare(a));
  reportState.selectedDate = reportState.dates[0] || "";

  setupReportDateSelect();
  document.getElementById("reportPdfButton")?.addEventListener("click", printReport);
  document.getElementById("asidePdfButton")?.addEventListener("click", printReport);
  renderDailyReport();
});

function normalizeReportRow(row) {
  const date = String(row["접수일"] || "");
  const obligationDate = String(row["보고의무발생일"] || row["보고의무발생일자"] || row["변동일"] || date);
  const stockCode = String(row["종목코드"] || "");
  const eventPrice = window.__EVENT_PRICES__?.[`${stockCode}_${obligationDate}`] || window.__EVENT_PRICES__?.[`${stockCode}_${date}`] || null;
  const currentPrice = window.__CURRENT_PRICES__?.[stockCode] || null;
  const shareDelta = toNumber(row["증감주식수"]);
  const tradeValue = eventPrice?.close && shareDelta !== null ? eventPrice.close * shareDelta : null;
  const previous = toNumber(row["직전지분율"]);
  const current = toNumber(row["이번지분율"]);

  return {
    date,
    obligationDate,
    market: row["시장"] || "",
    corpName: row["종목명"] || "",
    stockCode,
    reporter: row["보고자"] || "",
    previous,
    current,
    delta: toNumber(row["증감률"]),
    shareDelta,
    tradeValue,
    eventClose: eventPrice?.close ?? null,
    eventCloseDate: eventPrice?.date || "",
    currentClose: currentPrice?.close ?? null,
    currentCloseDate: currentPrice?.date || "",
    reason: row["보고사유"] || "",
    crossed: row["5퍼센트상향돌파"] === "Y" || ((previous ?? 0) < 5 && (current ?? 0) >= 5),
    holderType: classifyHolder(row["보고자"] || "", row["보고사유"] || ""),
    url: row.DART_URL || "#",
  };
}

function setupReportDateSelect() {
  const select = document.getElementById("reportDateSelect");
  if (!select) return;
  select.innerHTML = reportState.dates.map((date) => `<option value="${date}">${formatDate(date)}</option>`).join("");
  select.value = reportState.selectedDate;
  select.addEventListener("change", (event) => {
    reportState.selectedDate = event.target.value;
    renderDailyReport();
  });
}

function renderDailyReport() {
  const article = document.getElementById("dailyReportArticle");
  const range = document.getElementById("reportRange");
  if (!article) return;

  if (!reportState.rows.length) {
    article.innerHTML = `<div class="reportEmpty">아직 생성된 대량보유 공시 데이터가 없습니다.</div>`;
    return;
  }

  const rows = reportState.rows.filter((row) => row.date === reportState.selectedDate);
  const generatedAt = window.__DART_DATA__?.generatedAt || "";
  if (range) {
    range.textContent = `${formatDate(reportState.selectedDate)} 접수 공시 · 전체 캐시 ${reportState.rows.length.toLocaleString("ko-KR")}건${generatedAt ? ` · 갱신 ${generatedAt}` : ""}`;
  }

  const inflows = rows.filter((row) => (row.tradeValue || 0) > 0).sort((a, b) => (b.tradeValue || 0) - (a.tradeValue || 0));
  const outflows = rows.filter((row) => (row.tradeValue || 0) < 0).sort((a, b) => Math.abs(b.tradeValue || 0) - Math.abs(a.tradeValue || 0));
  const newFive = rows.filter((row) => row.crossed).sort((a, b) => (b.current || 0) - (a.current || 0));
  const topReporter = summarizeReporters(rows)[0];
  const largestInflow = inflows[0];
  const largestOutflow = outflows[0];
  const totalBuy = sum(inflows.map((row) => row.tradeValue));
  const totalSell = Math.abs(sum(outflows.map((row) => row.tradeValue)));

  article.innerHTML = `
    <header class="reportArticleHeader">
      <p class="reportCategory">리앤노트 공시 리포트</p>
      <h2>${formatDateDots(reportState.selectedDate)} 대량보유 공시 데일리 리포트</h2>
      <p class="reportMeta">${formatDate(reportState.selectedDate)} 접수 기준 · KOSPI/KOSDAQ 대량보유상황보고서 자동 요약</p>
    </header>

    <section class="reportChartCard">
      <div>
        <h3>지분변동금액 방향성</h3>
        <p>접수 공시 ${rows.length.toLocaleString("ko-KR")}건 중 추정 매수 ${inflows.length.toLocaleString("ko-KR")}건, 추정 매도 ${outflows.length.toLocaleString("ko-KR")}건입니다.</p>
      </div>
      ${renderFlowBars(totalBuy, totalSell, newFive.length)}
    </section>

    <section class="reportBodyText">
      <p>${formatDate(reportState.selectedDate)} 접수된 대량보유 공시에서는 <strong>${rows.length.toLocaleString("ko-KR")}건</strong>의 지분 변동이 확인됐습니다. 추정 지분변동금액 기준으로 매수성 변동은 <strong>${formatEok(totalBuy)}</strong>, 매도성 변동은 <strong>${formatEok(-totalSell)}</strong> 규모입니다.</p>
      <p>${largestInflow ? `가장 큰 매수성 변동은 <strong>${escapeHtml(largestInflow.corpName)}</strong>에서 나타났고 제출인은 <strong>${escapeHtml(largestInflow.reporter)}</strong>입니다.` : "뚜렷한 매수성 변동은 제한적입니다."} ${largestOutflow ? `반대로 가장 큰 매도성 변동은 <strong>${escapeHtml(largestOutflow.corpName)}</strong>이며 제출인은 <strong>${escapeHtml(largestOutflow.reporter)}</strong>입니다.` : ""}</p>
      <p>${newFive.length ? `직전 5% 미만에서 이번 5% 이상으로 올라온 신규 진입 후보는 <strong>${newFive.length.toLocaleString("ko-KR")}건</strong>입니다.` : "신규 5% 진입 신호는 확인되지 않았습니다."} ${topReporter ? `제출인 기준으로는 <strong>${escapeHtml(topReporter.name)}</strong>의 누적 변동금액이 가장 컸습니다.` : ""}</p>
    </section>

    <section class="reportSection">
      <h3>핵심 변동 Top</h3>
      <div class="reportTableGrid">
        ${renderReportMiniTable("매수성 변동", inflows.slice(0, 5))}
        ${renderReportMiniTable("매도성 변동", outflows.slice(0, 5))}
        ${renderReportMiniTable("신규 5% 진입", newFive.slice(0, 5), "share")}
      </div>
    </section>

    <section class="reportSection">
      <h3>제출인별 요약</h3>
      ${renderReporterSummary(summarizeReporters(rows).slice(0, 8))}
    </section>

    <section class="reportSection">
      <h3>원문 확인용 공시 목록</h3>
      ${renderDisclosureTable(rows.slice().sort((a, b) => Math.abs(b.tradeValue || 0) - Math.abs(a.tradeValue || 0)).slice(0, 20))}
    </section>
  `;
}

function renderFlowBars(totalBuy, totalSell, newFiveCount) {
  const maxValue = Math.max(Math.abs(totalBuy), Math.abs(totalSell), 1);
  const buyHeight = Math.max(12, Math.round((Math.abs(totalBuy) / maxValue) * 150));
  const sellHeight = Math.max(12, Math.round((Math.abs(totalSell) / maxValue) * 150));
  const entryHeight = Math.max(12, Math.min(150, newFiveCount * 18));
  return `
    <div class="reportBars" aria-label="지분변동금액 요약 차트">
      <div class="reportBarItem">
        <span class="reportBar buy" style="height:${buyHeight}px"></span>
        <strong>${formatEok(totalBuy)}</strong>
        <em>추정 매수</em>
      </div>
      <div class="reportBarItem">
        <span class="reportBar sell" style="height:${sellHeight}px"></span>
        <strong>${formatEok(-totalSell)}</strong>
        <em>추정 매도</em>
      </div>
      <div class="reportBarItem">
        <span class="reportBar entry" style="height:${entryHeight}px"></span>
        <strong>${newFiveCount.toLocaleString("ko-KR")}건</strong>
        <em>신규 5%</em>
      </div>
    </div>
  `;
}

function renderReportMiniTable(title, rows, mode = "money") {
  const body = rows.length ? rows.map((row, index) => `
    <li>
      <span>${index + 1}</span>
      <strong>${escapeHtml(row.corpName)}<em>${escapeHtml(row.reporter)}</em></strong>
      <b class="${(row.tradeValue || 0) < 0 ? "blue" : "red"}">${mode === "share" ? `${formatPct(row.previous)} → ${formatPct(row.current)}` : formatEok(row.tradeValue)}</b>
    </li>
  `).join("") : `<li class="empty">해당 조건 없음</li>`;
  return `
    <div class="reportMiniTable">
      <h4>${title}</h4>
      <ol>${body}</ol>
    </div>
  `;
}

function renderReporterSummary(items) {
  if (!items.length) return `<div class="reportEmpty">제출인별 요약 데이터가 없습니다.</div>`;
  return `
    <div class="reportReporterGrid">
      ${items.map((item) => `
        <div class="reportReporterCard">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.type)} · ${item.count.toLocaleString("ko-KR")}건</span>
          <b class="${item.value < 0 ? "blue" : "red"}">${formatEok(item.value)}</b>
          <em>${item.stocks.slice(0, 3).map(escapeHtml).join(", ")}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDisclosureTable(rows) {
  if (!rows.length) return `<div class="reportEmpty">공시 목록이 없습니다.</div>`;
  return `
    <div class="reportTableWrap">
      <table class="reportDataTable">
        <thead>
          <tr>
            <th>종목</th>
            <th>보고의무발생일</th>
            <th>제출인</th>
            <th>직전 → 이번</th>
            <th>지분변동금액</th>
            <th>원문</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)}</em></td>
              <td>${formatDate(row.obligationDate)}</td>
              <td><strong>${escapeHtml(row.reporter)}</strong><em>${escapeHtml(row.holderType)}</em></td>
              <td>${formatPct(row.previous)} → ${formatPct(row.current)}</td>
              <td><b class="${(row.tradeValue || 0) < 0 ? "blue" : "red"}">${formatEok(row.tradeValue)}</b></td>
              <td><a href="${escapeAttr(row.url)}" target="_blank" rel="noopener">DART</a></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function summarizeReporters(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.reporter) return;
    if (!map.has(row.reporter)) {
      map.set(row.reporter, { name: row.reporter, type: row.holderType, value: 0, count: 0, stocks: [] });
    }
    const item = map.get(row.reporter);
    item.value += row.tradeValue || 0;
    item.count += 1;
    if (row.corpName && !item.stocks.includes(row.corpName)) item.stocks.push(row.corpName);
  });
  return Array.from(map.values()).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function classifyHolder(name, reason) {
  const text = `${name} ${reason}`.toUpperCase();
  if (/국민연금|연금|PENSION|KIC|국부/.test(text)) return "연기금/국부펀드";
  if (/MORGAN|JPMORGAN|BLACKROCK|FIDELITY|VANGUARD|GOLDMAN|UBS|GIC|TEMASEK|LLC|LIMITED|INC/.test(text)) return "외국계 금융사";
  if (/자산|투자|증권|운용|캐피탈|은행|신탁|보험/.test(text)) return "국내 금융/투자";
  if (/대표|임원|회장|특수관계|친인척/.test(reason)) return "오너·특수관계";
  return "기타/확인필요";
}

function printReport() {
  window.print();
}

function sum(values) {
  return values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "-") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function formatDate(value) {
  const text = String(value || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
}

function formatDateDots(value) {
  const text = String(value || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6)}`;
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "-";
}

function formatEok(value) {
  if (!Number.isFinite(value)) return "확인불가";
  const eok = Math.round(value / 100000000);
  if (eok === 0) return "0억원";
  return `${eok > 0 ? "▲" : "▼"}${Math.abs(eok).toLocaleString("ko-KR")}억원`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
