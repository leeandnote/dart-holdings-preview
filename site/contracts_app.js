const contractState = {
  rows: [],
  search: "",
  market: "all",
  sort: "date",
  correction: "all",
  ratioFilter: "all",
  amountFilter: "all",
  sortKey: "date",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
  visibleColumns: new Set(["stock", "date", "counterparty", "amount", "salesRatio", "recentSales", "period", "price"]),
};

const contractNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const contractPct = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const contractColumns = [
  { key: "stock", label: "종목", sort: "corpName" },
  { key: "date", label: "공시일", sort: "date" },
  { key: "counterparty", label: "계약상대방", sort: "counterparty" },
  { key: "amount", label: "계약금액", sort: "amount" },
  { key: "salesRatio", label: "매출액 대비 비중", unit: "단위: %", sort: "ratio" },
  { key: "recentSales", label: "최근 매출액", unit: "단위: 억원", sort: "recentSales" },
  { key: "period", label: "계약 기간", sort: "term" },
  { key: "price", label: "최근일 종가 / 등락률", sort: "changePct" },
];

const $ = (id) => document.getElementById(id);

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function compactDate(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatDate(value) {
  const iso = normalizeDate(value);
  return iso ? iso.replaceAll("-", ".") : "-";
}

function daysBetween(start, end) {
  const s = normalizeDate(start);
  const e = normalizeDate(end);
  if (!s || !e) return null;
  const startDate = new Date(`${s}T00:00:00+09:00`);
  const endDate = new Date(`${e}T00:00:00+09:00`);
  const days = Math.round((endDate - startDate) / 86400000);
  return Number.isFinite(days) ? days : null;
}

function isCorrection(row) {
  return /기재정정|정정/.test(row.reportName || "");
}

function isSecretCounterparty(value) {
  return !String(value || "").trim() || /비공개|영업비밀|미공개|고객사|해외고객/.test(String(value || ""));
}

function cleanCounterparty(value) {
  const text = String(value || "").trim();
  return text || "영업비밀 보호 비공개";
}

function saneContractAmount(value) {
  const amount = num(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 1000000) return null;
  return amount;
}

function saneSalesRatio(value) {
  const ratio = num(value);
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  if (ratio > 10000) return null;
  return ratio;
}

function normalizeRecentSales(amount, salesRatio, rawRecentSales) {
  const recent = saneContractAmount(rawRecentSales);
  const inferred = Number.isFinite(amount) && amount > 0 && Number.isFinite(salesRatio) && salesRatio > 0
    ? amount / (salesRatio / 100)
    : null;
  if (Number.isFinite(inferred)) {
    if (!Number.isFinite(recent)) return { value: inferred, basis: "계약금액·비율 검증" };
    const gap = Math.abs(recent - inferred) / Math.max(inferred, 1);
    if (gap > 0.15) return { value: inferred, basis: "계약금액·비율 검증" };
    return { value: recent, basis: "공시 원문 기준" };
  }
  if (!Number.isFinite(amount)) return { value: null, basis: "계약금액 확인 필요" };
  return { value: recent, basis: Number.isFinite(recent) ? "공시 원문 기준" : "원문 확인 필요" };
}

function latestPrice(stockCode) {
  const current = window.__CURRENT_PRICES__?.[stockCode];
  const history = (window.__PRICE_DATA__?.prices?.[stockCode] || []).filter((item) => Number.isFinite(num(item.close))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = current || history.at(-1) || null;
  const prev = history.length > 1 ? history.at(-2) : null;
  const close = num(last?.close);
  const prevClose = num(prev?.close);
  return {
    date: last?.date || "",
    close,
    changePct: Number.isFinite(num(current?.changeRate)) ? num(current.changeRate) : close !== null && prevClose ? ((close - prevClose) / prevClose) * 100 : null,
  };
}

function normalizeContractRow(row) {
  const stockCode = String(row["종목코드"] || "");
  const amount = saneContractAmount(row["계약금액"]);
  const salesRatio = saneSalesRatio(row["매출대비비율"]);
  const recentSales = normalizeRecentSales(amount, salesRatio, row["최근매출액"]);
  const startDate = normalizeDate(row["계약시작일"] || "");
  const endDate = normalizeDate(row["계약종료일"] || "");
  const price = latestPrice(stockCode);
  return {
    date: compactDate(row["접수일"]),
    dateText: formatDate(row["접수일"]),
    market: row["시장"] || "",
    corpName: row["종목명"] || "",
    stockCode,
    reportName: String(row["보고서명"] || "").trim(),
    counterparty: cleanCounterparty(row["계약상대방"]),
    counterpartySecret: isSecretCounterparty(row["계약상대방"]),
    amount,
    recentSales: recentSales.value,
    recentSalesBasis: recentSales.basis,
    salesRatio,
    startDate,
    endDate,
    days: daysBetween(startDate, endDate),
    content: String(row["계약내용"] || "").trim(),
    region: String(row["판매공급지역"] || "").trim(),
    url: row.DART_URL || "#",
    close: price.close,
    closeDate: price.date,
    changePct: price.changePct,
    marketCapRatio: null,
    correction: isCorrection({ reportName: row["보고서명"] }),
  };
}

function loadContracts() {
  const payload = window.__DISCLOSURE_SIGNALS__ || { rows: [] };
  contractState.rows = (payload.rows || [])
    .filter((row) => row["공시유형"] === "단일판매·공급계약")
    .map(normalizeContractRow)
    .filter((row) => row.corpName && row.stockCode)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || ((b.amount || 0) - (a.amount || 0)));
  $("period").textContent = `데이터 갱신일시: ${payload.generatedAt || "-"}`;
  bindContracts();
  renderContracts();
}

function bindContracts() {
  setupContractColumns();
  $("contractSearch")?.addEventListener("input", (event) => {
    contractState.search = event.target.value.trim();
    contractState.page = 1;
    renderContracts();
  });
  $("contractMarket")?.addEventListener("change", (event) => {
    contractState.market = event.target.value;
    contractState.page = 1;
    renderContracts();
  });
  $("contractSort")?.addEventListener("change", (event) => {
    contractState.sort = event.target.value;
    contractState.sortKey = event.target.value;
    contractState.sortDir = "desc";
    contractState.page = 1;
    renderContracts();
  });
  $("contractCorrection")?.addEventListener("change", (event) => {
    contractState.correction = event.target.value;
    contractState.page = 1;
    renderContracts();
  });
  $("contractRatioFilter")?.addEventListener("change", (event) => {
    contractState.ratioFilter = event.target.value;
    contractState.page = 1;
    renderContracts();
  });
  $("contractAmountFilter")?.addEventListener("change", (event) => {
    contractState.amountFilter = event.target.value;
    contractState.page = 1;
    renderContracts();
  });
  $("contractPageSize")?.addEventListener("change", (event) => {
    contractState.pageSize = Number(event.target.value) || 10;
    contractState.page = 1;
    renderContracts();
  });
  $("contractFilterBtn")?.addEventListener("click", () => openContractModal("contractFilterModal"));
  $("contractColumnsBtn")?.addEventListener("click", () => openContractModal("contractColumnsModal"));
  document.querySelectorAll("[data-contract-close]").forEach((button) => {
    button.addEventListener("click", () => closeContractModal(button.dataset.contractClose));
  });
  document.querySelectorAll("#contractFilterModal, #contractColumnsModal").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeContractModal(overlay.id);
    });
  });
  $("contractXlsBtn")?.addEventListener("click", downloadContractsExcel);
  $("contractImgBtn")?.addEventListener("click", downloadContractsImage);
}

function filteredContracts() {
  const search = contractState.search.toLowerCase();
  const minRatio = contractState.ratioFilter === "all" ? null : Number(contractState.ratioFilter);
  const minAmount = contractState.amountFilter === "all" ? null : Number(contractState.amountFilter);
  const rows = contractState.rows.filter((row) => {
    if (contractState.market !== "all" && row.market !== contractState.market) return false;
    if (contractState.correction === "new" && row.correction) return false;
    if (contractState.correction === "correction" && !row.correction) return false;
    if (minRatio !== null && (!Number.isFinite(row.salesRatio) || row.salesRatio < minRatio)) return false;
    if (minAmount !== null && (!Number.isFinite(row.amount) || row.amount < minAmount)) return false;
    if (search) {
      const haystack = `${row.corpName} ${row.stockCode} ${row.counterparty} ${row.content} ${row.reportName} ${row.region}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  return rows.sort(compareContracts);
}

function compareContracts(a, b) {
  const direction = contractState.sortDir === "asc" ? 1 : -1;
  const key = contractState.sortKey || contractState.sort;
  if (key === "amount") return direction * ((a.amount || 0) - (b.amount || 0));
  if (key === "ratio") return direction * ((a.salesRatio || 0) - (b.salesRatio || 0));
  if (key === "recentSales") return direction * ((a.recentSales || 0) - (b.recentSales || 0));
  if (key === "term") return direction * ((b.days ?? 999999) - (a.days ?? 999999));
  if (key === "changePct") return direction * ((a.changePct || 0) - (b.changePct || 0));
  if (key === "corpName") return direction * String(a.corpName).localeCompare(String(b.corpName), "ko");
  if (key === "counterparty") return direction * String(a.counterparty).localeCompare(String(b.counterparty), "ko");
  return direction * String(a.date).localeCompare(String(b.date)) || ((b.amount || 0) - (a.amount || 0));
}

function uniqueByStock(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.stockCode}:${row.counterparty}:${row.amount || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestDate(rows) {
  return rows.map((row) => row.date).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";
}

function topRows(rows, score, filter = () => true) {
  return uniqueByStock(rows.filter(filter).filter((row) => Number.isFinite(score(row))))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
}

function renderContracts() {
  const visible = filteredContracts();
  const latest = latestDate(contractState.rows);
  const latestRows = contractState.rows.filter((row) => row.date === latest);
  renderRankingCards(latestRows.length ? latestRows : contractState.rows, latest);
  $("listHint").textContent = `${visible.length.toLocaleString("ko-KR")}건 · ${contractState.pageSize}개씩 표시`;
  renderContractTable(visible);
}

function renderRankingCards(rows, latest) {
  const cards = [
    { tag: "규모", title: "#계약금액 규모", caption: "확정 계약금액 상위", rows: topRows(rows, (row) => row.amount || NaN), metric: (row) => formatMoney(row.amount) },
    { tag: "임팩트", title: "#매출액 대비 비중", caption: "최근 매출액 대비 계약금액", rows: topRows(rows, (row) => row.salesRatio || NaN), metric: (row) => `${formatRatio(row.salesRatio)}%` },
    { tag: "신규", title: "#신규 수주 체결", caption: "[기재정정] 제외 규모 상위", rows: topRows(rows, (row) => row.amount || NaN, (row) => !row.correction), metric: (row) => formatMoney(row.amount) },
    { tag: "속도", title: "#단기 실적 반영", caption: "계약 종료일까지 1년 이내", rows: topRows(rows, (row) => row.amount || NaN, (row) => row.days !== null && row.days <= 365), metric: (row) => `${formatMoney(row.amount)}` },
  ];
  const label = latest ? `랭킹 기준: 최근 접수일 ${formatDate(latest)} 단일일자` : "랭킹 기준: 전체 데이터";
  $("contractRankings").innerHTML = `<div class="topRankHead"><div><h2>핵심 변동 큐레이션</h2><p>${escapeHtml(label)} · 단일판매·공급계약체결 공시 기준</p></div></div><div class="rankGrid">${cards.map(renderContractRankCard).join("")}</div>`;
}

function renderContractRankCard(card) {
  const rows = card.rows.length ? card.rows.map((row, index) => `<div class="rankItem"><span class="rankNo">${index + 1}</span><span class="rankName">${escapeHtml(row.corpName)}<em>${escapeHtml(row.counterparty)}</em></span><span class="rankMetric positive">${card.metric(row)}<em>${Number.isFinite(row.salesRatio) ? `매출대비 ${formatRatio(row.salesRatio)}%` : row.dateText}</em></span></div>`).join("") : `<p class="rankEmpty">데이터 보강 필요</p>`;
  return `<article class="rankPanel contract"><div class="rankPanelHead"><span>${escapeHtml(card.tag)}</span><h3>${escapeHtml(card.title)}</h3></div><p class="rankCaption">${escapeHtml(card.caption)}</p><div class="rankList">${rows}</div></article>`;
}

function renderContractTable(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / contractState.pageSize));
  contractState.page = Math.min(Math.max(1, contractState.page), totalPages);
  const start = (contractState.page - 1) * contractState.pageSize;
  const pageRows = rows.slice(start, start + contractState.pageSize);
  const columns = visibleContractColumns();
  const head = columns.map(renderContractHeaderCell).join("");
  const colgroup = columns.map((column) => `<col class="contractCol-${column.key}">`).join("");
  const body = pageRows.length ? pageRows.map((row) => renderContractRow(row, columns)).join("") : `<tr><td class="emptyContractCell" colspan="${columns.length}">조건에 맞는 공시가 없습니다.</td></tr>`;
  const mobileCards = pageRows.length ? pageRows.map(renderContractMobileCard).join("") : `<p class="muted mobileContractEmpty">조건에 맞는 공시가 없습니다.</p>`;
  $("contractList").innerHTML = `<div class="contractTableWrap"><table class="contractTable"><colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="contractMobileCards">${mobileCards}</div>${renderContractPagination(rows.length, totalPages)}<p class="tableTrustNote">매출액 대비 비율은 DART 원문 기준이며, 최근 매출액은 계약금액과 비율이 함께 확인되는 경우 우선 검증합니다. 계약금액·계약기간·상대방은 정정 공시에 따라 달라질 수 있습니다.</p>`;
  bindContractPagination();
  bindContractSorting();
}

function renderContractMobileCard(row) {
  const ratioClass = row.salesRatio >= 100 ? "mega" : row.salesRatio >= 50 ? "large" : "";
  const gauge = Math.max(0, Math.min(100, row.salesRatio || 0));
  const priceClass = row.changePct > 0 ? "positive" : row.changePct < 0 ? "negative" : "neutral";
  return `<article class="contractMobileCard">
    <div class="contractMobileTop">
      <div class="contractMobileStock">
        <strong>${escapeHtml(row.corpName)}</strong>
        <em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)}</em>
      </div>
      <div class="contractMobileRatio ${ratioClass}">
        <span>매출대비</span>
        <strong>${Number.isFinite(row.salesRatio) ? `${formatRatio(row.salesRatio)}%` : "-"}</strong>
        <i><b style="width:${gauge}%"></b></i>
      </div>
    </div>
    <div class="contractMobileBody">
      <div class="contractMobileField contractMobileParty">
        <span>계약상대방</span>
        <strong>${escapeHtml(row.counterparty)}</strong>
        <em>${escapeHtml(row.content || row.reportName || "-")}</em>
      </div>
      <div class="contractMobileField">
        <span>계약금액</span>
        <strong>${formatMoney(row.amount)}</strong>
        <a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">원문보기</a>
      </div>
      <div class="contractMobileField">
        <span>계약기간</span>
        <strong>${escapeHtml(periodText(row))}</strong>
        <em>${row.days !== null ? `${row.days.toLocaleString("ko-KR")}일` : "기간 확인 필요"}</em>
      </div>
      <div class="contractMobileField">
        <span>최근일 종가</span>
        <strong>${formatPrice(row.close)}</strong>
        <em class="${priceClass}">${formatPlainPct(row.changePct)}</em>
      </div>
      <div class="contractMobileField">
        <span>공시일</span>
        <strong>${escapeHtml(row.dateText)}</strong>
        ${row.correction ? `<em>정정</em>` : ""}
      </div>
    </div>
  </article>`;
}

function renderContractHeaderCell(column) {
  const active = column.sort && contractState.sortKey === column.sort;
  const arrow = active ? (contractState.sortDir === "asc" ? "↑" : "↓") : "↕";
  const label = `${escapeHtml(column.label)}${column.unit ? `<small>${escapeHtml(column.unit)}</small>` : ""}`;
  if (!column.sort) return `<th>${label}</th>`;
  return `<th><button class="contractSortButton ${active ? "active" : ""}" type="button" data-contract-sort="${escapeHtml(column.sort)}"><span>${label}</span><i>${arrow}</i></button></th>`;
}

function openContractModal(id) {
  $(id)?.classList.remove("hidden");
}

function closeContractModal(id) {
  $(id)?.classList.add("hidden");
}

function renderContractRow(row, columns) {
  return `<tr>${columns.map((column) => `<td class="contractCol-${column.key} ${column.key === "amount" || column.key === "price" ? "num" : ""}">${renderContractCell(row, column.key)}</td>`).join("")}</tr>`;
}

function renderContractCell(row, key) {
  const ratioClass = row.salesRatio >= 100 ? "mega" : row.salesRatio >= 50 ? "large" : "";
  const gauge = Math.max(0, Math.min(100, row.salesRatio || 0));
  const badge = row.salesRatio >= 100 ? `<span class="impactBadge mega">초대형</span>` : row.salesRatio >= 50 ? `<span class="impactBadge large">대형</span>` : "";
  const priceClass = row.changePct > 0 ? "positive" : row.changePct < 0 ? "negative" : "neutral";
  if (key === "stock") return `<strong class="contractStock">${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)}</em>`;
  if (key === "date") return `<span class="contractTextMain">${escapeHtml(row.dateText)}</span>${row.correction ? `<span class="miniTag">정정</span>` : ""}`;
  if (key === "counterparty") return `<span class="counterparty ${row.counterpartySecret ? "secret" : ""}">${escapeHtml(row.counterparty)}</span><em>${escapeHtml(row.content || row.reportName || "-")}</em>`;
  if (key === "amount") return `<strong>${formatMoney(row.amount)}</strong><a class="dartLink amountLink" href="${escapeHtml(row.url)}" target="_blank" rel="noopener">원문보기</a>`;
  if (key === "salesRatio") return renderSalesGauge(row, ratioClass, gauge);
  if (key === "recentSales") return Number.isFinite(row.recentSales) ? `<span class="contractTextMain">${formatMoney(row.recentSales)}</span><em>${escapeHtml(row.recentSalesBasis || "공시 원문 기준")}</em>` : `<span class="mutedDash">확인 필요</span><em>${escapeHtml(row.recentSalesBasis || "원문 확인 필요")}</em>`;
  if (key === "period") return `<span class="contractTextMain">${escapeHtml(periodText(row))}</span><em>${row.days !== null ? `${row.days.toLocaleString("ko-KR")}일` : "기간 확인 필요"}</em>`;
  if (key === "price") return `<span class="contractTextMain">${formatPrice(row.close)}</span><em class="${priceClass}">${formatPlainPct(row.changePct)}</em>`;
  return "-";
}

function visibleContractColumns() {
  const columns = contractColumns.filter((column) => contractState.visibleColumns.has(column.key));
  return columns.length ? columns : contractColumns;
}

function setupContractColumns() {
  const panel = $("contractColumnPanel");
  if (!panel) return;
  panel.innerHTML = contractColumns.map((column) => `<label><input type="checkbox" value="${escapeHtml(column.key)}" ${contractState.visibleColumns.has(column.key) ? "checked" : ""}> <span>${escapeHtml(column.label)}</span></label>`).join("");
  panel.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const checked = Array.from(panel.querySelectorAll("input[type='checkbox']:checked")).map((item) => item.value);
      if (!checked.length) {
        checkbox.checked = true;
        return;
      }
      contractState.visibleColumns = new Set(checked);
      renderContracts();
    });
  });
}

function bindContractSorting() {
  document.querySelectorAll("[data-contract-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextKey = button.dataset.contractSort;
      if (contractState.sortKey === nextKey) {
        contractState.sortDir = contractState.sortDir === "asc" ? "desc" : "asc";
      } else {
        contractState.sortKey = nextKey;
        contractState.sortDir = nextKey === "corpName" || nextKey === "counterparty" ? "asc" : "desc";
      }
      contractState.sort = contractState.sortKey;
      contractState.page = 1;
      const sortSelect = $("contractSort");
      if (sortSelect && Array.from(sortSelect.options).some((option) => option.value === contractState.sortKey)) {
        sortSelect.value = contractState.sortKey;
      }
      renderContracts();
    });
  });
}

function downloadContractsExcel() {
  const rows = filteredContracts();
  const columns = visibleContractColumns();
  const header = columns.map((column) => column.label).concat("DART_URL");
  const body = rows.map((row) => columns.map((column) => plainContractCell(row, column.key)).concat(row.url));
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlob(blob, `${contractDownloadBaseName()}_${rows.length}건.xls`);
}

function downloadContractsImage() {
  const target = document.querySelector(".contractTableWrap");
  if (!target) return;
  const rows = filteredContracts();
  const start = (contractState.page - 1) * contractState.pageSize;
  const pageRows = rows.slice(start, start + contractState.pageSize);
  const canvas = renderContractsCanvas(pageRows, rows.length);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${contractDownloadBaseName()}_${contractState.page}페이지.png`);
  }, "image/png");
}

function renderContractsCanvas(rows, totalRows) {
  const columns = visibleContractColumns();
  const widths = { stock: 170, date: 112, counterparty: 340, amount: 150, salesRatio: 150, recentSales: 155, period: 180, price: 135 };
  const margin = 30;
  const titleHeight = 82;
  const headerHeight = 46;
  const rowHeight = 72;
  const footerHeight = 34;
  const width = Math.max(1120, columns.reduce((sum, column) => sum + (widths[column.key] || 140), margin * 2));
  const height = titleHeight + headerHeight + rows.length * rowHeight + footerHeight + margin;
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 25px Pretendard, Arial, sans-serif";
  ctx.fillText("대형수주보고 테이블", margin, 42);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 13px Pretendard, Arial, sans-serif";
  ctx.fillText(`${contractFilterSummary()} · ${rows.length}/${totalRows.toLocaleString("ko-KR")}건`, margin, 68);
  let x = margin;
  const headerY = titleHeight;
  ctx.fillStyle = "#101827";
  roundRect(ctx, margin, headerY, width - margin * 2, headerHeight, 8);
  ctx.fill();
  columns.forEach((column) => {
    const cellWidth = widths[column.key] || 140;
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 12px Pretendard, Arial, sans-serif";
    drawClippedCanvasText(ctx, column.label, x + 10, headerY + 29, cellWidth - 20);
    x += cellWidth;
  });
  rows.forEach((row, rowIndex) => {
    const y = titleHeight + headerHeight + rowIndex * rowHeight;
    ctx.fillStyle = rowIndex % 2 ? "#ffffff" : "#fbfcfe";
    ctx.fillRect(margin, y, width - margin * 2, rowHeight);
    ctx.strokeStyle = "#e6ebf1";
    ctx.beginPath();
    ctx.moveTo(margin, y + rowHeight);
    ctx.lineTo(width - margin, y + rowHeight);
    ctx.stroke();
    let cellX = margin;
    columns.forEach((column) => {
      const cellWidth = widths[column.key] || 140;
      const lines = plainContractCell(row, column.key).split("\n");
      ctx.fillStyle = column.key === "stock" ? "#ff5520" : "#111827";
      ctx.font = "800 13px Pretendard, Arial, sans-serif";
      drawClippedCanvasText(ctx, lines[0] || "-", cellX + 10, y + 28, cellWidth - 20);
      ctx.fillStyle = "#64748b";
      ctx.font = "650 11px Pretendard, Arial, sans-serif";
      drawClippedCanvasText(ctx, lines[1] || "", cellX + 10, y + 50, cellWidth - 20);
      cellX += cellWidth;
    });
  });
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 11px Pretendard, Arial, sans-serif";
  ctx.fillText("DART 공시 기반 정보 제공용 이미지입니다. 투자 판단은 원문과 후속 공시를 함께 확인하세요.", margin, height - 18);
  return canvas;
}

function plainContractCell(row, key) {
  if (key === "stock") return `${row.corpName}\n${row.stockCode} · ${row.market}`;
  if (key === "date") return row.dateText;
  if (key === "counterparty") return `${row.counterparty}\n${row.content || row.reportName || "-"}`;
  if (key === "amount") return formatMoney(row.amount);
  if (key === "salesRatio") return `${Number.isFinite(row.salesRatio) ? `${formatRatio(row.salesRatio)}%` : "-"}`;
  if (key === "recentSales") return Number.isFinite(row.recentSales) ? `${formatMoney(row.recentSales)}\n${row.recentSalesBasis || "공시 원문 기준"}` : `확인 필요\n${row.recentSalesBasis || "원문 확인 필요"}`;
  if (key === "period") return `${periodText(row)}\n${row.days !== null ? `${row.days.toLocaleString("ko-KR")}일` : "기간 확인 필요"}`;
  if (key === "price") return `${formatPrice(row.close)}\n${formatPlainPct(row.changePct)}`;
  return "-";
}

function contractFilterSummary() {
  return [
    contractState.market !== "all" ? contractState.market : "전체 시장",
    contractState.correction === "new" ? "신규 공시" : contractState.correction === "correction" ? "정정 공시" : "전체 공시",
    contractState.ratioFilter !== "all" ? `매출대비 ${contractState.ratioFilter}% 이상` : "",
    contractState.amountFilter !== "all" ? `계약금액 ${formatMoney(Number(contractState.amountFilter))} 이상` : "",
    contractState.search ? `검색 ${contractState.search}` : "",
  ].filter(Boolean).join(" · ");
}

function contractDownloadBaseName() {
  const latest = latestDate(contractState.rows) || "all";
  return `대형수주보고_${latest}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawClippedCanvasText(ctx, text, x, y, maxWidth) {
  let output = String(text || "");
  if (!output) return;
  if (ctx.measureText(output).width <= maxWidth) {
    ctx.fillText(output, x, y);
    return;
  }
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) output = output.slice(0, -1);
  ctx.fillText(`${output}...`, x, y);
}
function renderSalesGauge(row, ratioClass, gauge) {
  return `<div class="salesGauge compact ${ratioClass}"><span class="gaugeBar"><i style="width:${gauge}%"></i></span><strong>${Number.isFinite(row.salesRatio) ? `${formatRatio(row.salesRatio)}%` : "-"}</strong></div>`;
}

function renderContractPagination(totalRows, totalPages) {
  const start = totalRows ? (contractState.page - 1) * contractState.pageSize + 1 : 0;
  const end = Math.min(totalRows, contractState.page * contractState.pageSize);
  const pages = [];
  const first = Math.max(1, contractState.page - 2);
  const last = Math.min(totalPages, first + 4);
  for (let page = first; page <= last; page += 1) pages.push(page);
  return `<nav class="pagination" aria-label="계약 테이블 페이지 이동"><span class="pageSummary">${start.toLocaleString("ko-KR")}-${end.toLocaleString("ko-KR")} / ${totalRows.toLocaleString("ko-KR")}건</span><div class="pageControls"><button class="pageButton" data-contract-page="${contractState.page - 1}" ${contractState.page <= 1 ? "disabled" : ""}>이전</button>${pages.map((page) => `<button class="pageButton ${page === contractState.page ? "active" : ""}" data-contract-page="${page}">${page}</button>`).join("")}<button class="pageButton" data-contract-page="${contractState.page + 1}" ${contractState.page >= totalPages ? "disabled" : ""}>다음</button></div></nav>`;
}

function bindContractPagination() {
  document.querySelectorAll("[data-contract-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.contractPage);
      if (!Number.isFinite(page) || page < 1 || page === contractState.page) return;
      contractState.page = page;
      renderContracts();
      document.querySelector(".contractList")?.scrollIntoView({ block: "start" });
    });
  });
}

function periodText(row) {
  if (!row.startDate && !row.endDate) return "-";
  return `${formatDate(row.startDate)} ~ ${formatDate(row.endDate)}`;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${contractNumber.format(abs / 100000000)}억원`;
  if (abs >= 10000) return `${contractNumber.format(abs / 10000)}만원`;
  return `${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatRatio(value) {
  return Number.isFinite(value) ? contractPct.format(value) : "-";
}

function formatPlainPct(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "▲ +" : value < 0 ? "▼ -" : "";
  return `${sign}${contractPct.format(Math.abs(value))}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

loadContracts();















