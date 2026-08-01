const signalState = {
  rows: [],
  type: "all",
  market: "all",
  from: "",
  to: "",
  search: "",
};

const signalNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

document.getElementById("signalType").addEventListener("change", (event) => {
  signalState.type = event.target.value;
  renderSignals();
});

document.getElementById("signalMarket").addEventListener("change", (event) => {
  signalState.market = event.target.value;
  renderSignals();
});

document.getElementById("signalFrom").addEventListener("change", (event) => {
  signalState.from = event.target.value;
  setActiveSignalPeriod("");
  renderSignals();
});

document.getElementById("signalTo").addEventListener("change", (event) => {
  signalState.to = event.target.value;
  setActiveSignalPeriod("");
  renderSignals();
});

document.querySelectorAll("[data-signal-period]").forEach((button) => {
  button.addEventListener("click", () => applySignalPeriod(button.dataset.signalPeriod));
});

let signalSearchTimer = null;
document.getElementById("signalSearch").addEventListener("input", (event) => {
  signalState.search = event.target.value.trim();
  clearTimeout(signalSearchTimer);
  signalSearchTimer = setTimeout(renderSignals, 250);
});

loadSignals();

function loadSignals() {
  const payload = window.__DISCLOSURE_SIGNALS__ || { rows: [] };
  signalState.rows = (payload.rows || []).map(normalizeSignalRow);
  signalState.to = toDateInput(payload.endDe) || toDateInput(latestDateKey(signalState.rows));
  signalState.from = toDateInput(payload.bgnDe) || defaultFrom(signalState.to, 180);
  document.getElementById("signalFrom").value = signalState.from;
  document.getElementById("signalTo").value = signalState.to;
  setActiveSignalPeriod("6m");
  renderSignals();
}

function normalizeSignalRow(row) {
  const type = row["공시유형"] === "단일판매·공급계약" ? "contract" : "earnings";
  return {
    date: String(row["접수일"] || ""),
    market: row["시장"] || "",
    type,
    typeLabel: row["공시유형"] || "",
    corpName: row["종목명"] || "",
    stockCode: row["종목코드"] || "",
    reportName: String(row["보고서명"] || "").trim(),
    contractAmount: toNumber(row["계약금액"]),
    recentSales: toNumber(row["최근매출액"]),
    salesRatio: toNumber(row["매출대비비율"]),
    sales: toNumber(row["매출액"]),
    operatingProfit: toNumber(row["영업이익"]),
    netProfit: toNumber(row["당기순이익"]),
    turnaround: row["턴어라운드"] || "",
    url: row.DART_URL || "#",
  };
}

function renderSignals() {
  const rows = filteredSignals();
  const contracts = rows.filter((row) => row.type === "contract");
  const earnings = rows.filter((row) => row.type === "earnings");
  const showContract = signalState.type === "all" || signalState.type === "contract";
  const showEarnings = signalState.type === "all" || signalState.type === "earnings";

  document.getElementById("disclosurePeriod").textContent = `${signalState.from || "-"} ~ ${signalState.to || "-"} · 필터 결과 ${rows.length.toLocaleString("ko-KR")}건`;
  document.getElementById("signalSummary").innerHTML = renderSignalSummary(rows, contracts, earnings);

  document.querySelector(".contractTheme").classList.toggle("hidden", !showContract);
  document.querySelector(".earningsTheme").classList.toggle("hidden", !showEarnings);

  document.getElementById("contractRatioList").innerHTML = renderSignalList(contracts.filter((row) => Number.isFinite(row.salesRatio)).sort((a, b) => b.salesRatio - a.salesRatio).slice(0, 8), "ratio");
  document.getElementById("contractAmountList").innerHTML = renderSignalList(contracts.filter((row) => Number.isFinite(row.contractAmount)).sort((a, b) => b.contractAmount - a.contractAmount).slice(0, 8), "contract");
  document.getElementById("recentContractList").innerHTML = renderSignalList(contracts.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), "recent");
  document.getElementById("turnaroundList").innerHTML = renderSignalList(earnings.filter((row) => row.turnaround).slice(0, 8), "turnaround");
  document.getElementById("operatingProfitList").innerHTML = renderSignalList(earnings.filter((row) => Number.isFinite(row.operatingProfit)).sort((a, b) => b.operatingProfit - a.operatingProfit).slice(0, 8), "profit");
  document.getElementById("recentEarningsList").innerHTML = renderSignalList(earnings.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), "recent");

  document.getElementById("contractTableHint").textContent = `${contracts.length.toLocaleString("ko-KR")}건 · 매출대비율/계약금액 기준 정렬용`;
  document.getElementById("earningsTableHint").textContent = `${earnings.length.toLocaleString("ko-KR")}건 · 흑자전환/영업이익 확인용`;
  document.getElementById("contractTable").innerHTML = renderSignalTable(contracts, "contract");
  document.getElementById("earningsTable").innerHTML = renderSignalTable(earnings, "earnings");
}

function applySignalPeriod(period) {
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[period] || 6;
  const end = signalState.to ? new Date(`${signalState.to}T00:00:00`) : new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setDate(start.getDate() + 1);
  signalState.from = formatDateInput(start);
  document.getElementById("signalFrom").value = signalState.from;
  setActiveSignalPeriod(period);
  renderSignals();
}

function setActiveSignalPeriod(period) {
  document.querySelectorAll("[data-signal-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.signalPeriod === period);
  });
}

function filteredSignals() {
  const from = fromDateInput(signalState.from) || "00000000";
  const to = fromDateInput(signalState.to) || "99999999";
  return signalState.rows.filter((row) => {
    if (signalState.type !== "all" && row.type !== signalState.type) return false;
    if (signalState.market !== "all" && row.market !== signalState.market) return false;
    if (row.date < from || row.date > to) return false;
    if (signalState.search) {
      const haystack = `${row.corpName} ${row.stockCode} ${row.reportName} ${row.typeLabel}`.toLowerCase();
      if (!haystack.includes(signalState.search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderSignalSummary(rows, contracts, earnings) {
  const largeRatio = contracts.filter((row) => row.salesRatio >= 10).length;
  const turnaround = earnings.filter((row) => row.turnaround).length;
  const maxContract = contracts.filter((row) => Number.isFinite(row.contractAmount)).sort((a, b) => b.contractAmount - a.contractAmount)[0];
  const maxProfit = earnings.filter((row) => Number.isFinite(row.operatingProfit)).sort((a, b) => b.operatingProfit - a.operatingProfit)[0];
  return `<h2>핵심 요약</h2>
    <p>필터 구간 공시 <strong>${rows.length.toLocaleString("ko-KR")}건</strong> 중 계약 공시는 <strong>${contracts.length.toLocaleString("ko-KR")}건</strong>, 실적 공시는 <strong>${earnings.length.toLocaleString("ko-KR")}건</strong>입니다.</p>
    <p>매출 대비 10% 이상 계약 후보는 <strong>${largeRatio.toLocaleString("ko-KR")}건</strong>, 흑자/적자 전환 후보는 <strong>${turnaround.toLocaleString("ko-KR")}건</strong>입니다.${maxContract ? ` 최대 계약 후보는 <strong>${escapeHtml(maxContract.corpName)} ${formatMoney(maxContract.contractAmount)}</strong>` : ""}${maxProfit ? `, 영업이익 상위 후보는 <strong>${escapeHtml(maxProfit.corpName)} ${formatMoney(maxProfit.operatingProfit)}</strong>` : ""}입니다.</p>`;
}

function renderSignalList(rows, metric) {
  if (!rows.length) return `<p class="rankEmpty">해당 조건의 공시가 없습니다.</p>`;
  return rows.map((row) => {
    const data = signalMetric(row, metric);
    return `<a class="curationItem" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(row.corpName)}<em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)} · ${formatDate(row.date)}</em></strong>
      <span>${escapeHtml(row.reportName)}<em>${escapeHtml(row.typeLabel)}${row.turnaround ? ` · ${escapeHtml(row.turnaround)}` : ""}</em></span>
      <span class="metricPill ${data.tone}">${data.main}</span>
    </a>`;
  }).join("");
}

function renderSignalTable(rows, type) {
  const sorted = rows.slice().sort((a, b) => {
    if (type === "contract") {
      const bv = Number.isFinite(b.salesRatio) ? b.salesRatio : Number.isFinite(b.contractAmount) ? b.contractAmount / 100000000 : -Infinity;
      const av = Number.isFinite(a.salesRatio) ? a.salesRatio : Number.isFinite(a.contractAmount) ? a.contractAmount / 100000000 : -Infinity;
      if (bv !== av) return bv - av;
    }
    if (type === "earnings") {
      const bt = b.turnaround ? 1 : 0;
      const at = a.turnaround ? 1 : 0;
      if (bt !== at) return bt - at;
      const bp = Number.isFinite(b.operatingProfit) ? b.operatingProfit : -Infinity;
      const ap = Number.isFinite(a.operatingProfit) ? a.operatingProfit : -Infinity;
      if (bp !== ap) return bp - ap;
    }
    return b.date.localeCompare(a.date);
  });
  if (!sorted.length) return `<p class="rankEmpty">표시할 공시가 없습니다.</p>`;
  const head = type === "contract"
    ? ["종목", "접수일", "시장", "보고서명", "계약금액", "최근매출액", "매출대비", "원문"]
    : ["종목", "접수일", "시장", "보고서명", "매출액", "영업이익", "당기순이익", "전환여부", "원문"];
  return `<div class="dataTableWrap"><table class="dataTable signalDataTable">
    <thead><tr>${head.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
    <tbody>${sorted.map((row) => type === "contract" ? renderContractTableRow(row) : renderEarningsTableRow(row)).join("")}</tbody>
  </table></div>`;
}

function renderContractTableRow(row) {
  const ratioTone = row.salesRatio >= 10 ? "positive" : "";
  return `<tr>
    ${td("종목", `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)}</em>`)}
    ${td("접수일", formatDate(row.date))}
    ${td("시장", escapeHtml(row.market))}
    ${td("보고서명", escapeHtml(row.reportName))}
    ${td("계약금액", formatMoney(row.contractAmount), "num")}
    ${td("최근매출액", formatMoney(row.recentSales), "num")}
    ${td("매출대비", Number.isFinite(row.salesRatio) ? `<span class="tableBadge ${ratioTone}">${formatNumber(row.salesRatio)}%</span>` : "-", "num strongCell")}
    ${td("원문", `<a class="dartButton small" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">DART 원문</a>`)}
  </tr>`;
}

function renderEarningsTableRow(row) {
  const tone = row.turnaround.includes("흑자") ? "positive" : row.turnaround.includes("적자") ? "negative" : "";
  const profitTone = row.operatingProfit > 0 ? "positive" : row.operatingProfit < 0 ? "negative" : "";
  return `<tr>
    ${td("종목", `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)}</em>`)}
    ${td("접수일", formatDate(row.date))}
    ${td("시장", escapeHtml(row.market))}
    ${td("보고서명", escapeHtml(row.reportName))}
    ${td("매출액", formatMoney(row.sales), "num")}
    ${td("영업이익", `<span class="tableBadge ${profitTone}">${formatMoney(row.operatingProfit)}</span>`, "num")}
    ${td("당기순이익", formatMoney(row.netProfit), "num")}
    ${td("전환여부", row.turnaround ? `<span class="tableBadge ${tone}">${escapeHtml(row.turnaround)}</span>` : "-", tone)}
    ${td("원문", `<a class="dartButton small" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">DART 원문</a>`)}
  </tr>`;
}

function td(label, value, className = "") {
  return `<td data-label="${escapeHtml(label)}"${className ? ` class="${className}"` : ""}>${value}</td>`;
}

function signalMetric(row, metric) {
  if (metric === "ratio") return { main: `${formatNumber(row.salesRatio)}%`, tone: "positive" };
  if (metric === "contract") return { main: formatMoney(row.contractAmount), tone: "positive" };
  if (metric === "profit") return { main: formatMoney(row.operatingProfit), tone: row.operatingProfit < 0 ? "negative" : "positive" };
  if (metric === "turnaround") return { main: row.turnaround || "전환", tone: row.turnaround.includes("적자") ? "negative" : "positive" };
  if (row.type === "contract") return { main: Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : formatMoney(row.contractAmount), tone: "positive" };
  return { main: row.turnaround || formatMoney(row.operatingProfit), tone: row.operatingProfit < 0 || row.turnaround.includes("적자") ? "negative" : "positive" };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateInput(value) {
  const text = String(value || "");
  if (text.length !== 8) return "";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function fromDateInput(value) {
  return String(value || "").replaceAll("-", "");
}

function latestDateKey(rows) {
  return rows.map((row) => row.date).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";
}

function defaultFrom(toValue, days) {
  const date = toValue ? new Date(`${toValue}T00:00:00`) : new Date();
  date.setDate(date.getDate() - days);
  return formatDateInput(date);
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  const text = String(value || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return signalNumber.format(value);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "▼" : value > 0 ? "▲" : "";
  if (abs >= 100000000) return `${sign}${Math.round(abs / 100000000).toLocaleString("ko-KR")}억원`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만원`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
