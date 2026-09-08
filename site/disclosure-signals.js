const signalState = {
  rows: [],
  type: "contract",
  market: "all",
  from: "",
  to: "",
  search: "",
  contractSearch: "",
  contractTier: "all",
  contractRatio: "all",
  contractSort: "tier",
};

const signalNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const wholeNumber = new Intl.NumberFormat("ko-KR");

bindSignalEvents();
loadSignals();

function bindSignalEvents() {
  document.getElementById("signalType")?.addEventListener("change", (event) => {
    signalState.type = event.target.value;
    renderSignals();
  });

  document.getElementById("signalMarket")?.addEventListener("change", (event) => {
    signalState.market = event.target.value;
    renderSignals();
  });

  document.getElementById("signalFrom")?.addEventListener("change", (event) => {
    signalState.from = event.target.value;
    setActiveSignalPeriod("");
    renderSignals();
  });

  document.getElementById("signalTo")?.addEventListener("change", (event) => {
    signalState.to = event.target.value;
    setActiveSignalPeriod("");
    renderSignals();
  });

  document.querySelectorAll("[data-signal-period]").forEach((button) => {
    button.addEventListener("click", () => applySignalPeriod(button.dataset.signalPeriod));
  });

  let signalSearchTimer = null;
  document.getElementById("signalSearch")?.addEventListener("input", (event) => {
    signalState.search = event.target.value.trim();
    clearTimeout(signalSearchTimer);
    signalSearchTimer = setTimeout(renderSignals, 250);
  });

  let contractSearchTimer = null;
  document.getElementById("contractTableSearch")?.addEventListener("input", (event) => {
    signalState.contractSearch = event.target.value.trim();
    clearTimeout(contractSearchTimer);
    contractSearchTimer = setTimeout(renderSignals, 200);
  });

  document.getElementById("contractTierFilter")?.addEventListener("change", (event) => {
    signalState.contractTier = event.target.value;
    renderSignals();
  });

  document.getElementById("contractRatioFilter")?.addEventListener("change", (event) => {
    signalState.contractRatio = event.target.value;
    renderSignals();
  });

  document.getElementById("contractSort")?.addEventListener("change", (event) => {
    signalState.contractSort = event.target.value;
    renderSignals();
  });
}

function loadSignals() {
  const payload = window.__DISCLOSURE_SIGNALS__ || { rows: [] };
  signalState.rows = (payload.rows || []).map(normalizeSignalRow);
  signalState.to = toDateInput(payload.endDe) || toDateInput(latestDateKey(signalState.rows));
  signalState.from = toDateInput(payload.bgnDe) || defaultFrom(signalState.to, 180);
  setValue("signalFrom", signalState.from);
  setValue("signalTo", signalState.to);
  setActiveSignalPeriod("6m");
  renderSignals();
}

function normalizeSignalRow(row) {
  const stockCode = String(row["종목코드"] || "").padStart(6, "0");
  const price = (window.__CURRENT_PRICES__ || {})[stockCode] || {};
  const type = row["공시유형"] === "단일판매·공급계약" ? "contract" : "earnings";
  const counterparty = pickText(row, ["계약상대방", "계약상대", "상대방", "고객사", "계약처"]);
  const contractPeriod = pickText(row, ["계약기간", "계약기간요약", "계약시작종료", "계약기간_표시"]);
  const summary = pickText(row, ["계약내용", "계약내용요약", "내용요약", "계약명", "주요내용"]);

  return {
    date: String(row["접수일"] || ""),
    market: row["시장"] || "",
    type,
    typeLabel: row["공시유형"] || "",
    corpName: row["종목명"] || "",
    stockCode,
    reportName: String(row["보고서명"] || "").trim(),
    contractAmount: toNumber(row["계약금액"]),
    recentSales: toNumber(row["최근매출액"]),
    salesRatio: toNumber(row["매출대비비율"]),
    counterparty,
    contractPeriod,
    summary,
    sales: toNumber(row["매출액"]),
    operatingProfit: toNumber(row["영업이익"]),
    netProfit: toNumber(row["당기순이익"]),
    turnaround: row["턴어라운드"] || "",
    close: toNumber(row["당일종가"] ?? row["종가"] ?? price.close),
    closeDate: row["종가기준일"] || price.date || "",
    changeRate: toNumber(row["등락률"] ?? price.changeRate ?? price.rate),
    url: row.DART_URL || "#",
  };
}

function renderSignals() {
  const rows = filteredSignals();
  const contracts = rows.filter((row) => row.type === "contract");
  const earnings = rows.filter((row) => row.type === "earnings");
  const showContract = signalState.type === "all" || signalState.type === "contract";
  const showEarnings = signalState.type === "all" || signalState.type === "earnings";

  setText("disclosurePeriod", `${signalState.from || "-"} ~ ${signalState.to || "-"} · 필터 결과 ${rows.length.toLocaleString("ko-KR")}건`);
  setHtml("signalSummary", renderSignalSummary(rows, contracts, earnings));

  const tableContracts = filteredContractTableRows(contracts);

  document.querySelector(".contractTheme")?.classList.toggle("hidden", !showContract);
  document.querySelector(".earningsTheme")?.classList.toggle("hidden", !showEarnings);

  setHtml("contractHighlightGrid", renderContractHighlights(contracts));
  setHtml("contractRatioList", renderSignalList(contracts.filter((row) => Number.isFinite(row.salesRatio)).sort((a, b) => b.salesRatio - a.salesRatio).slice(0, 8), "ratio"));
  setHtml("contractAmountList", renderSignalList(contracts.filter((row) => Number.isFinite(row.contractAmount)).sort((a, b) => b.contractAmount - a.contractAmount).slice(0, 8), "contract"));
  setHtml("recentContractList", renderSignalList(contracts.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), "recent"));
  setHtml("turnaroundList", renderSignalList(earnings.filter((row) => row.turnaround).slice(0, 8), "turnaround"));
  setHtml("operatingProfitList", renderSignalList(earnings.filter((row) => Number.isFinite(row.operatingProfit)).sort((a, b) => b.operatingProfit - a.operatingProfit).slice(0, 8), "profit"));
  setHtml("recentEarningsList", renderSignalList(earnings.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), "recent"));

  setText("contractTableHint", `${tableContracts.length.toLocaleString("ko-KR")}건 · 테이블 필터 적용 결과입니다.`);
  setText("earningsTableHint", `${earnings.length.toLocaleString("ko-KR")}건 · 흑자전환/영업이익 확인용`);
  setHtml("contractTable", renderSignalTable(tableContracts, "contract"));
  setHtml("earningsTable", renderSignalTable(earnings, "earnings"));
}

function filteredContractTableRows(rows) {
  const tierValue = signalState.contractTier || "all";
  const minRatio = signalState.contractRatio === "all" ? null : Number(signalState.contractRatio);
  const query = (signalState.contractSearch || "").toLowerCase();
  return rows.filter((row) => {
    if (tierValue !== "all" && contractTier(row).level !== tierValue) return false;
    if (minRatio !== null && (!Number.isFinite(row.salesRatio) || row.salesRatio < minRatio)) return false;
    if (query) {
      const haystack = `${row.corpName} ${row.stockCode} ${row.counterparty} ${row.summary} ${row.contractPeriod} ${row.reportName}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
function applySignalPeriod(period) {
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[period] || 6;
  const end = signalState.to ? new Date(`${signalState.to}T00:00:00`) : new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setDate(start.getDate() + 1);
  signalState.from = formatDateInput(start);
  setValue("signalFrom", signalState.from);
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
      const haystack = `${row.corpName} ${row.stockCode} ${row.reportName} ${row.typeLabel} ${row.counterparty} ${row.summary}`.toLowerCase();
      if (!haystack.includes(signalState.search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderSignalSummary(rows, contracts, earnings) {
  const largeRatio = contracts.filter((row) => row.salesRatio >= 30).length;
  const superDeals = contracts.filter((row) => contractTier(row).level === "super").length;
  const maxContract = contracts.filter((row) => Number.isFinite(row.contractAmount)).sort((a, b) => b.contractAmount - a.contractAmount)[0];
  const maxRatio = contracts.filter((row) => Number.isFinite(row.salesRatio)).sort((a, b) => b.salesRatio - a.salesRatio)[0];
  return `<h2>핵심 변동 큐레이션</h2>
    <p>필터 구간 기준 단일판매·공급계약 <strong>${contracts.length.toLocaleString("ko-KR")}건</strong> 중 슈퍼수주 후보 <strong>${superDeals.toLocaleString("ko-KR")}건</strong>, 매출 대비 30% 이상 대형수주 후보 <strong>${largeRatio.toLocaleString("ko-KR")}건</strong>입니다.</p>
    <p>${maxContract ? `계약금액 최대 후보는 <strong>${escapeHtml(maxContract.corpName)} ${formatMoneyAbs(maxContract.contractAmount)}</strong>` : "계약금액 상위 후보는 아직 없습니다."}${maxRatio ? `, 매출 대비율 상위 후보는 <strong>${escapeHtml(maxRatio.corpName)} ${formatNumber(maxRatio.salesRatio)}%</strong>` : ""}입니다.</p>`;
}

function renderContractHighlights(rows) {
  const usable = uniqueContracts(rows).filter((row) => Number.isFinite(row.contractAmount) || Number.isFinite(row.salesRatio));
  if (!usable.length) return `<p class="rankEmpty">필터 조건에 맞는 수주 공시가 없습니다.</p>`;
  const cards = [
    pickHighlight(usable, "ratio"),
    pickHighlight(usable, "amount"),
    pickHighlight(usable, "recent"),
  ].filter(Boolean);
  return cards.map((row, index) => renderContractHighlightCard(row, index)).join("");
}

function pickHighlight(rows, mode) {
  const sorted = rows.slice();
  if (mode === "ratio") sorted.sort((a, b) => safeMetric(b.salesRatio) - safeMetric(a.salesRatio));
  if (mode === "amount") sorted.sort((a, b) => safeMetric(b.contractAmount) - safeMetric(a.contractAmount));
  if (mode === "recent") sorted.sort((a, b) => b.date.localeCompare(a.date) || safeMetric(b.contractAmount) - safeMetric(a.contractAmount));
  return sorted[0];
}

function renderContractHighlightCard(row, index) {
  const tier = contractTier(row);
  const title = index === 0
    ? `${tier.label} · 매출액 대비 ${Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : "확인필요"}`
    : index === 1
      ? `계약금액 규모 · ${formatMoneyAbs(row.contractAmount)}`
      : `최근 수주 · ${formatDate(row.date)}`;
  return `<article class="contractHighlightCard ${tier.tone}">
    <div class="contractHighlightTop"><span>${escapeHtml(title)}</span><em>${formatDate(row.date)}</em></div>
    <h3>${escapeHtml(row.corpName)}</h3>
    <p class="contractCode">${escapeHtml(row.stockCode)} · ${escapeHtml(row.market || "-")}</p>
    <dl>
      <div><dt>계약금액</dt><dd>${formatMoneyAbs(row.contractAmount)}</dd></div>
      <div><dt>계약상대</dt><dd>${escapeHtml(row.counterparty || "확인필요")}</dd></div>
      <div><dt>최근 매출 대비</dt><dd>${Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : "확인필요"}</dd></div>
      <div><dt>계약기간</dt><dd>${escapeHtml(row.contractPeriod || "확인필요")}</dd></div>
    </dl>
  </article>`;
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
      const sortMode = signalState.contractSort || "tier";
      if (sortMode === "recent") return b.date.localeCompare(a.date);
      if (sortMode === "amount") return safeMetric(b.contractAmount) - safeMetric(a.contractAmount);
      if (sortMode === "ratio") return safeMetric(b.salesRatio) - safeMetric(a.salesRatio);
      const tierDiff = contractTier(b).score - contractTier(a).score;
      if (tierDiff !== 0) return tierDiff;
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
    ? ["종목", "접수시각", "계약금액", "매출액 대비", "계약 상대방", "계약 내용 / 기간"]
    : ["종목", "접수일", "시장", "보고서명", "매출액", "영업이익", "당기순이익", "전환여부", "원문"];
  return `<div class="dataTableWrap"><table class="dataTable signalDataTable ${type === "contract" ? "contractDataTable" : ""}">
    <thead><tr>${head.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
    <tbody>${sorted.map((row) => type === "contract" ? renderContractTableRow(row) : renderEarningsTableRow(row)).join("")}</tbody>
  </table></div>`;
}

function renderContractTableRow(row) {
  const tier = contractTier(row);
  const ratioTone = row.salesRatio >= 100 ? "positive strong" : row.salesRatio >= 30 ? "positive" : "";
  const ratioLabel = Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : "확인필요";
  const ratioNote = row.salesRatio >= 100 ? "매출초과" : row.salesRatio >= 30 ? "대형계약" : row.salesRatio >= 10 ? "주요계약" : "";
  const summary = row.summary || row.reportName || "공시 원문 확인 필요";
  return `<tr class="contractRow ${tier.level}">
    ${td("종목", `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market || "-")}</em>`)}
    ${td("접수시각", `<strong>${formatDate(row.date)}</strong><a class="inlineDartLink" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">DART 원문보기</a>`)}
    ${td("계약금액", `<strong>${formatMoneyAbs(row.contractAmount)}</strong>${Number.isFinite(row.recentSales) ? `<em>최근매출 ${formatMoneyAbs(row.recentSales)}</em>` : ""}`, "num")}
    ${td("매출액 대비", `<div class="contractRatioCell">${renderRatioGauge(row.salesRatio)}<div><span class="contractRatioValue ${ratioTone}">${ratioLabel}</span><span class="contractTierBadge ${tier.tone}">${tier.label}</span>${ratioNote ? `<em>${ratioNote}</em>` : ""}</div></div>`, "num")}
    ${td("계약 상대방", `<strong>${escapeHtml(row.counterparty || "확인필요")}</strong><em>${contractCounterpartyType(row.counterparty)}</em>`, "contractTextCell")}
    ${td("계약 내용 / 기간", `<strong class="contractSummaryText">${escapeHtml(summary)}</strong><em class="contractPeriodText">${escapeHtml(row.contractPeriod || "계약기간 확인필요")}</em>`, "contractTextCell wide")}
  </tr>`;
}

function renderRatioGauge(value) {
  if (!Number.isFinite(value)) return `<span class="ratioGauge empty"><b>-</b></span>`;
  const capped = Math.max(0, Math.min(100, value));
  return `<span class="ratioGauge" style="--ratio:${capped.toFixed(2)}"><b>${Math.round(Math.min(value, 999))}</b></span>`;
}

function renderCloseCell(row) {
  const close = Number.isFinite(row.close) ? `${wholeNumber.format(Math.round(row.close))}원` : "N/A";
  const change = Number.isFinite(row.changeRate) ? `<em class="${row.changeRate >= 0 ? "positiveText" : "negativeText"}">${row.changeRate >= 0 ? "▲" : "▼"} ${formatNumber(Math.abs(row.changeRate))}%</em>` : `<em>${row.closeDate ? `${row.closeDate} 기준` : "등락률 N/A"}</em>`;
  return `<strong>${close}</strong>${change}`;
}

function renderContractScale(row) {
  const ratio = Number.isFinite(row.salesRatio) ? Math.max(0, row.salesRatio) : 0;
  const amountEok = Number.isFinite(row.contractAmount) ? Math.abs(row.contractAmount) / 100000000 : 0;
  const basis = ratio > 0 ? Math.min(100, ratio) : Math.min(100, amountEok / 10);
  const width = Math.max(4, Math.min(100, basis));
  const tone = ratio >= 10 || amountEok >= 1000 ? "strong" : ratio >= 5 || amountEok >= 300 ? "mid" : "soft";
  const caption = Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : formatMoney(row.contractAmount);
  return `<div class="contractScale ${tone}"><span><b style="width:${width.toFixed(1)}%"></b></span><em>${caption}</em></div>`;
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
  if (metric === "contract") return { main: formatMoneyAbs(row.contractAmount), tone: "positive" };
  if (metric === "profit") return { main: formatMoney(row.operatingProfit), tone: row.operatingProfit < 0 ? "negative" : "positive" };
  if (metric === "turnaround") return { main: row.turnaround || "전환", tone: row.turnaround.includes("적자") ? "negative" : "positive" };
  if (row.type === "contract") return { main: Number.isFinite(row.salesRatio) ? `${formatNumber(row.salesRatio)}%` : formatMoneyAbs(row.contractAmount), tone: "positive" };
  return { main: row.turnaround || formatMoney(row.operatingProfit), tone: row.operatingProfit < 0 || row.turnaround.includes("적자") ? "negative" : "positive" };
}

function contractTier(row) {
  const amountEok = Number.isFinite(row.contractAmount) ? Math.abs(row.contractAmount) / 100000000 : 0;
  if ((Number.isFinite(row.salesRatio) && row.salesRatio >= 100) || amountEok >= 10000) {
    return { label: "슈퍼수주", tone: "red", level: "super", score: 3, caption: Number.isFinite(row.salesRatio) ? `매출 대비 ${formatNumber(row.salesRatio)}%` : "1조원 이상" };
  }
  if ((Number.isFinite(row.salesRatio) && row.salesRatio >= 30) || amountEok >= 3000) {
    return { label: "대형수주", tone: "blue", level: "large", score: 2, caption: Number.isFinite(row.salesRatio) ? `매출 대비 ${formatNumber(row.salesRatio)}%` : "3천억원 이상" };
  }
  return { label: "일반수주", tone: "gray", level: "normal", score: 1, caption: Number.isFinite(row.salesRatio) ? `매출 대비 ${formatNumber(row.salesRatio)}%` : "규모 확인" };
}

function contractCounterpartyType(value) {
  const text = String(value || "");
  if (!text) return "고객사 확인필요";
  if (/정부|국방|청|부|공사|공단|군|Ministry|Government/i.test(text)) return "정부/공공기관";
  if (/Inc|LLC|Ltd|GmbH|S\.A|Global|해외|싱가포르|미국|중국|일본|유럽/i.test(text)) return "글로벌 고객사";
  return "계약상대";
}

function uniqueContracts(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.stockCode}-${row.date}-${row.contractAmount}-${row.salesRatio}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickText(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function safeMetric(value) {
  return Number.isFinite(value) ? value : -Infinity;
}

function setHtml(id, html) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = html;
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
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

function formatMoneyAbs(value) {
  if (!Number.isFinite(value)) return "확인필요";
  const abs = Math.abs(value);
  if (abs >= 1000000000000) {
    const jo = Math.floor(abs / 1000000000000);
    const eok = Math.round((abs % 1000000000000) / 100000000);
    return eok ? `${jo}조 ${eok.toLocaleString("ko-KR")}억원` : `${jo}조원`;
  }
  if (abs >= 100000000) return `${Math.round(abs / 100000000).toLocaleString("ko-KR")}억원`;
  if (abs >= 10000) return `${Math.round(abs / 10000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(abs).toLocaleString("ko-KR")}원`;
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



