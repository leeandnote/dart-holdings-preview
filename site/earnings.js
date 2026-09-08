(() => {
  const pageType = document.body.dataset.earningsPage || "quarterly";
  const rawData = window.__EARNINGS_DATA__ || {};
  const currentPrices = window.__CURRENT_PRICES__ || {};
  const priceData = window.__PRICE_DATA__ || {};
  const priceChunks = window.__PRICE_CHUNKS__ || {};

  const state = {
    rows: normalizeRows(pageType === "turnaround" ? rawData.turnaround : rawData.quarterly),
    search: "",
    market: "all",
    reportType: "all",
    status: "all",
    sort: "receiptDesc",
  };

  const rankingDefs = pageType === "turnaround" ? [
    { key: "opTurnaround", label: "#흑자전환", desc: "흑자전환 우선 · 없으면 영업이익 흑자", tone: "red", getRows: (rows) => fallbackRankRows(rows, (row) => row.status === "흑자전환", "opChangeAmount", "currentOperatingProfit", "desc") },
    { key: "opSurge", label: "#영업이익 폭증", desc: "증가율 우선 · 없으면 영업이익 규모", tone: "red", getRows: (rows) => fallbackRankRows(rows, (row) => isFiniteNumber(row.opChangeRate), "opChangeRate", "currentOperatingProfit", "desc") },
    { key: "netTurnaround", label: "#당기순익 흑자전환", desc: "순이익 전환 우선 · 없으면 순이익 규모", tone: "red", getRows: (rows) => fallbackRankRows(rows, (row) => row.netStatus === "흑자전환", "netChangeAmount", "currentNetIncome", "desc") },
    { key: "opLoss", label: "#적자전환 주의", desc: "적자전환 우선 · 없으면 영업손실 규모", tone: "blue", getRows: (rows) => fallbackRankRows(rows, (row) => row.status === "적자전환", "opChangeAmount", "currentOperatingProfit", "asc") },
    { key: "lossWidening", label: "#적자확대 주의", desc: "적자확대 우선 · 없으면 영업손실 규모", tone: "blue", getRows: (rows) => fallbackRankRows(rows, (row) => row.status === "적자지속" && row.opChangeAmount < 0, "opChangeAmount", "currentOperatingProfit", "asc") },
  ] : [
    { key: "opSurprise", label: "#영업이익 서프라이즈", desc: "YoY 우선 · 없으면 영업이익 규모", tone: "red", getRows: (rows) => rows.filter((row) => isFiniteNumber(row.operatingProfitYoY) || isFiniteNumber(row.operatingProfit)).sort((a, b) => numSort(metricValue(a, "operatingProfitYoY", "operatingProfit"), metricValue(b, "operatingProfitYoY", "operatingProfit"), "desc")) },
    { key: "opTop", label: "#영업이익 규모 Top", desc: "당기 영업이익 절대 규모", tone: "red", getRows: (rows) => rows.filter((row) => isFiniteNumber(row.operatingProfit)).sort(byNumber("operatingProfit", "desc")) },
    { key: "salesGrowth", label: "#매출 성장률 Top", desc: "YoY 우선 · 없으면 매출 규모", tone: "red", getRows: (rows) => rows.filter((row) => isFiniteNumber(row.salesYoY) || isFiniteNumber(row.sales)).sort((a, b) => numSort(metricValue(a, "salesYoY", "sales"), metricValue(b, "salesYoY", "sales"), "desc")) },
    { key: "opm", label: "#OPM 고마진", desc: "영업이익률 상위", tone: "orange", getRows: (rows) => rows.filter((row) => isFiniteNumber(row.opm)).sort(byNumber("opm", "desc")) },
    { key: "shock", label: "#어닝 쇼크/감익 주의", desc: "YoY 감소 우선 · 없으면 적자 규모", tone: "blue", getRows: (rows) => rows.filter((row) => isFiniteNumber(row.operatingProfitYoY) || isFiniteNumber(row.operatingProfit)).sort((a, b) => numSort(metricValue(a, "operatingProfitYoY", "operatingProfit"), metricValue(b, "operatingProfitYoY", "operatingProfit"), "asc")) },
  ];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindControls();
    render();
  }

  function bindControls() {
    const search = document.getElementById("earningsSearch");
    const market = document.getElementById("earningsMarket");
    const reportType = document.getElementById("earningsReportType");
    const status = document.getElementById("earningsStatus");
    const sort = document.getElementById("earningsSort");
    search?.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      render();
    });
    market?.addEventListener("change", (event) => {
      state.market = event.target.value;
      render();
    });
    reportType?.addEventListener("change", (event) => {
      state.reportType = event.target.value;
      render();
    });
    status?.addEventListener("change", (event) => {
      state.status = event.target.value;
      render();
    });
    sort?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      render();
    });
  }

  function render() {
    const filtered = sortedRows(filteredRows(state.rows));
    renderPeriod(filtered);
    renderRankings(filtered);
    renderTable(filtered);
  }

  function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const next = { ...row };
      next.stockCode = normalizeCode(next.stockCode || next.code || next.종목코드);
      next.corpName = stringValue(next.corpName || next.name || next.종목명);
      next.market = stringValue(next.market || next.시장구분);
      next.reportName = stringValue(next.reportName || next.보고서명 || next.reportType);
      next.reportType = stringValue(next.reportType || classifyReportType(next.reportName));
      next.basis = stringValue(next.basis || next.연결별도 || "-");
      next.receiptAt = normalizeDateTime(next.receiptAt || next.rceptDt || next.접수시각 || next.receiptDate);
      next.receiptDate = normalizeDate(next.receiptDate || next.date || next.rceptDt || next.접수일);
      next.url = stringValue(next.url || next.dartUrl || next.원문링크);
      next.sales = numberValue(next.sales ?? next.매출액);
      next.salesYoY = numberValue(next.salesYoY ?? next.매출액YoY);
      next.salesQoQ = numberValue(next.salesQoQ ?? next.매출액QoQ);
      next.operatingProfit = numberValue(next.operatingProfit ?? next.op ?? next.영업이익);
      next.operatingProfitYoY = numberValue(next.operatingProfitYoY ?? next.opYoY ?? next.영업이익YoY);
      next.operatingProfitQoQ = numberValue(next.operatingProfitQoQ ?? next.opQoQ ?? next.영업이익QoQ);
      next.netIncome = numberValue(next.netIncome ?? next.순이익 ?? next.당기순이익);
      next.netIncomeYoY = numberValue(next.netIncomeYoY ?? next.netYoY ?? next.순이익YoY);
      next.netIncomeQoQ = numberValue(next.netIncomeQoQ ?? next.netQoQ ?? next.순이익QoQ);
      next.opm = isFiniteNumber(next.opm) ? next.opm : calcRatio(next.operatingProfit, next.sales);
      next.quarterHistory = normalizeQuarterHistory(next.quarterHistory || next.history || next.분기실적 || next.operatingProfitHistory);
      next.prevOperatingProfit = numberValue(next.prevOperatingProfit ?? next.직전영업이익);
      next.currentOperatingProfit = numberValue(next.currentOperatingProfit ?? next.currentOp ?? next.당해영업이익 ?? next.operatingProfit);
      next.opChangeAmount = isFiniteNumber(next.opChangeAmount) ? next.opChangeAmount : diff(next.currentOperatingProfit, next.prevOperatingProfit);
      next.opChangeRate = isFiniteNumber(next.opChangeRate) ? next.opChangeRate : changeRate(next.currentOperatingProfit, next.prevOperatingProfit);
      next.prevNetIncome = numberValue(next.prevNetIncome ?? next.직전순이익);
      next.currentNetIncome = numberValue(next.currentNetIncome ?? next.currentNet ?? next.당해순이익 ?? next.netIncome);
      next.netChangeAmount = isFiniteNumber(next.netChangeAmount) ? next.netChangeAmount : diff(next.currentNetIncome, next.prevNetIncome);
      next.netChangeRate = isFiniteNumber(next.netChangeRate) ? next.netChangeRate : changeRate(next.currentNetIncome, next.prevNetIncome);
      next.reason = stringValue(next.reason || next.changeReason || next.변동주요원인);
      next.status = stringValue(next.status || calculateProfitStatus(next.prevOperatingProfit, next.currentOperatingProfit));
      next.netStatus = stringValue(next.netStatus || calculateProfitStatus(next.prevNetIncome, next.currentNetIncome));
      const price = currentPrices[next.stockCode] || {};
      next.close = numberValue(next.close ?? price.close);
      next.closeDate = normalizeDate(next.closeDate || price.date);
      next.afterHoursChangeRate = numberValue(next.afterHoursChangeRate ?? next.시간외변동률);
      return next;
    }).filter((row) => row.stockCode || row.corpName);
  }

  function filteredRows(rows) {
    const q = state.search.toLowerCase();
    return rows.filter((row) => {
      if (state.market !== "all" && row.market !== state.market) return false;
      if (pageType === "quarterly" && state.reportType !== "all" && !row.reportType.includes(state.reportType)) return false;
      if (pageType === "turnaround" && state.status !== "all" && row.status !== state.status) return false;
      if (!q) return true;
      return [row.corpName, row.stockCode, row.market, row.reportName, row.reportType, row.basis, row.status, row.reason]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }

  function sortedRows(rows) {
    const list = [...rows];
    const sorters = {
      receiptDesc: (a, b) => String(b.receiptAt || b.receiptDate).localeCompare(String(a.receiptAt || a.receiptDate)),
      opYoYDesc: (a, b) => numSort(a.operatingProfitYoY, b.operatingProfitYoY, "desc"),
      opYoYAsc: (a, b) => numSort(a.operatingProfitYoY, b.operatingProfitYoY, "asc"),
      opAmountDesc: (a, b) => numSort(a.operatingProfit, b.operatingProfit, "desc"),
      salesYoYDesc: (a, b) => numSort(a.salesYoY, b.salesYoY, "desc"),
      opmDesc: (a, b) => numSort(a.opm, b.opm, "desc"),
      opChangeRateDesc: (a, b) => numSort(a.opChangeRate, b.opChangeRate, "desc"),
      opChangeRateAsc: (a, b) => numSort(a.opChangeRate, b.opChangeRate, "asc"),
      opChangeAmountDesc: (a, b) => numSort(a.opChangeAmount, b.opChangeAmount, "desc"),
      netChangeRateDesc: (a, b) => numSort(a.netChangeRate, b.netChangeRate, "desc"),
    };
    return list.sort(sorters[state.sort] || sorters.receiptDesc);
  }

  function renderPeriod(rows) {
    const period = document.getElementById("earningsPeriod");
    if (!period) return;
    const dates = state.rows.map((row) => row.receiptDate).filter(Boolean).sort();
    const generatedAt = rawData.generatedAt ? ` · 갱신 ${rawData.generatedAt}` : "";
    if (!dates.length) {
      period.textContent = `${pageType === "turnaround" ? "30% 손익구조 변동" : "실적 발표"} 데이터 수집 전입니다${generatedAt}`;
      return;
    }
    period.textContent = `${dates[0]} ~ ${dates.at(-1)} · ${rows.length.toLocaleString("ko-KR")}건${generatedAt}`;
  }

  function renderRankings(rows) {
    const root = document.getElementById("earningsRankings");
    if (!root) return;
    root.innerHTML = rankingDefs.map((def) => {
      const items = def.getRows(rows).slice(0, 5);
      return `<article class="earningsRankCard ${def.tone}">
        <div class="rankHead"><span>${escapeHtml(def.label)}</span><small>${escapeHtml(def.desc)}</small></div>
        <div class="earningsRankList">
          ${items.length ? items.map((row, index) => renderRankItem(row, index, def.key)).join("") : `<p class="emptyRank">조건에 맞는 데이터가 없습니다.</p>`}
        </div>
      </article>`;
    }).join("");
  }

  function renderRankItem(row, index, key) {
    const metric = rankMetric(row, key);
    return `<div class="earningsRankItem">
      <b>${index + 1}</b>
      <span><strong>${escapeHtml(row.corpName || "-")}</strong><em>${escapeHtml(row.stockCode)} · ${escapeHtml(row.market || "-")}</em></span>
      <i class="${metric.className}">${escapeHtml(metric.text)}</i>
    </div>`;
  }

  function rankMetric(row, key) {
    if (key === "opTop") return { text: formatMoney(row.operatingProfit), className: signedClass(row.operatingProfit) };
    if (key === "opm") return { text: formatPct(row.opm), className: signedClass(row.opm) };
    if (key === "salesGrowth") return { text: formatSignedPct(row.salesYoY), className: signedClass(row.salesYoY) };
    if (key === "opTurnaround" || key === "opSurge") return isFiniteNumber(row.opChangeRate) ? { text: formatSignedPct(row.opChangeRate), className: signedClass(row.opChangeRate) } : { text: formatMoney(row.currentOperatingProfit), className: signedClass(row.currentOperatingProfit) };
    if (key === "netTurnaround") return isFiniteNumber(row.netChangeAmount) ? { text: formatSignedMoney(row.netChangeAmount), className: signedClass(row.netChangeAmount) } : { text: formatMoney(row.currentNetIncome), className: signedClass(row.currentNetIncome) };
    if (key === "opLoss" || key === "lossWidening") return isFiniteNumber(row.opChangeAmount) ? { text: formatSignedMoney(row.opChangeAmount), className: signedClass(row.opChangeAmount) } : { text: formatMoney(row.currentOperatingProfit), className: signedClass(row.currentOperatingProfit) };
    return fallbackGrowthMetric(row.operatingProfitYoY, row.operatingProfit);
  }

  function renderTable(rows) {
    const root = document.getElementById("earningsTable");
    const hint = document.getElementById("earningsTableHint");
    if (!root) return;
    if (hint) hint.textContent = `${rows.length.toLocaleString("ko-KR")}건 · ${pageType === "turnaround" ? "손익상태 태그와 변동 주요원인을 확인합니다." : "매출·영업이익·순이익 성장률을 확인합니다."}`;
    if (!rows.length) {
      root.innerHTML = `<div class="earningsEmpty">
        <strong>아직 표시할 실적 데이터가 없습니다.</strong>
        <p>DART 실적 수집 스크립트가 <code>site/data/earnings.js</code>를 채우면 이 영역에 자동으로 랭킹과 테이블이 표시됩니다.</p>
      </div>`;
      return;
    }
    root.innerHTML = pageType === "turnaround" ? renderTurnaroundTable(rows) : renderQuarterlyTable(rows);
  }

  function renderQuarterlyTable(rows) {
    return `<div class="earningsTable quarterly">
      <div class="earningsHeader">
        <span>종목</span><span>공시구분</span><span>접수시각</span><span>영업이익 추이</span><span>매출액</span><span>영업이익</span><span>순이익</span><span>OPM</span><span>주가추이</span>
      </div>
      ${rows.map((row) => `<article class="earningsRow">
        ${stockCell(row)}
        <div class="reportTypeCell"><strong>${escapeHtml(row.reportType || "-")}</strong><em>${escapeHtml(row.basis || "-")}</em></div>
        <div class="receiptCell"><strong>${escapeHtml(row.receiptAt || row.receiptDate || "-")}</strong>${dartLink(row)}</div>
        ${renderOperatingProfitTrend(row)}\n        ${metricCell(row.sales, row.salesYoY, row.salesQoQ)}
        ${metricCell(row.operatingProfit, row.operatingProfitYoY, row.operatingProfitQoQ)}
        ${metricCell(row.netIncome, row.netIncomeYoY, row.netIncomeQoQ)}
        <div class="opmCell"><strong>${formatPct(row.opm)}</strong><em>영업이익률</em></div>
        <div class="priceTrendCell">${renderPriceTrend(row)}</div>
      </article>`).join("")}
    </div>`;
  }

  function renderTurnaroundTable(rows) {
    return `<div class="earningsTable turnaround">
      <div class="earningsHeader">
        <span>구분</span><span>종목명 / 코드</span><span>접수시각</span><span>영업이익<br>(직전 → 당해)</span><span>당기순이익<br>(직전 → 당해)</span><span>실적 턴어라운드 주요 원인</span><span>당일 종가<br>(등락률)</span>
      </div>
      ${rows.map((row) => `<article class="earningsRow turnaroundRow ${statusTone(row.status)}">
        <div class="turnStatusCell">${statusBadge(row.status)}</div>
        ${turnaroundStockCell(row)}
        <div class="receiptCell"><strong>${escapeHtml(row.receiptAt || row.receiptDate || "-")}</strong>${dartLink(row)}</div>
        ${transitionCell(row.prevOperatingProfit, row.currentOperatingProfit, row.status, "영업이익")}
        ${transitionCell(row.prevNetIncome, row.currentNetIncome, row.netStatus, "당기순이익")}
        <div class="turnReasonCell"><strong>${escapeHtml(compactReason(row.reason || row.reportName || "-"))}</strong><em>DART 공시 요약</em></div>
        ${closeTurnCell(row)}
      </article>`).join("")}
    </div>`;
  }

  function turnaroundStockCell(row) {
    return `<div class="earningsStock turnaroundStock"><strong>${escapeHtml(row.corpName || "-")}</strong><em>${escapeHtml(row.stockCode || "-")} · ${escapeHtml(row.market || "-")}</em></div>`;
  }

  function transitionCell(prev, current, status, label) {
    const tone = statusTone(status || calculateProfitStatus(prev, current));
    return `<div class="turnTransitionCell ${tone}"><strong>${formatMoney(prev)} <b>→</b> ${formatMoney(current)}</strong><em>${statusBadge(status || calculateProfitStatus(prev, current))}<span>${escapeHtml(label)}</span></em></div>`;
  }

  function closeTurnCell(row) {
    return `<div class="turnCloseCell"><strong>${formatPrice(row.close)}</strong><em>${isFiniteNumber(row.afterHoursChangeRate) ? formatSignedPct(row.afterHoursChangeRate) : "N/A"} 시간외</em></div>`;
  }

  function statusTone(status) {
    const value = String(status || "");
    if (value.includes("흑자") || value === "적자축소") return "turnPositive";
    if (value.includes("적자")) return "turnNegative";
    return "turnNeutral";
  }

  function compactReason(reason) {
    return String(reason || "-").replace(/\s+/g, " ").trim();
  }
  function renderOperatingProfitTrend(row) {
    const points = getOperatingProfitHistory(row);
    if (points.length < 2) return renderSingleOperatingProfit(row);
    const values = points.map((item) => item.value).filter(isFiniteNumber);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = Math.max(1, max - min);
    const width = 178;
    const height = 48;
    const padX = 5;
    const zeroY = height - 8 - ((0 - min) / span) * (height - 15);
    const xFor = (index) => padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
    const yFor = (value) => height - 8 - ((value - min) / span) * (height - 15);
    const line = points.map((item, index) => `${xFor(index).toFixed(1)},${yFor(item.value).toFixed(1)}`).join(" ");
    const bars = points.map((item, index) => {
      const x = xFor(index) - 3;
      const y = Math.min(zeroY, yFor(item.value));
      const h = Math.max(2, Math.abs(zeroY - yFor(item.value)));
      const cls = item.value >= 0 ? "profit" : "loss";
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${h.toFixed(1)}" rx="2"></rect>`;
    }).join("");
    return `<div class="opTrend" title="최근 ${points.length}개 공시 기준 영업이익 추이"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="영업이익 추이"><line class="zero" x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}"></line>${bars}<polyline points="${line}"></polyline></svg><em>${escapeHtml(points[0].label)} → ${escapeHtml(points.at(-1).label)}</em></div>`;
  }

  function renderSingleOperatingProfit(row) {
    if (!isFiniteNumber(row.operatingProfit)) return `<span class="opTrend empty">N/A<em>실적값 없음</em></span>`;
    const cls = row.operatingProfit >= 0 ? "profit" : "loss";
    return `<div class="opTrend single"><span><b class="${cls}"></b></span><strong class="${signedClass(row.operatingProfit)}">${formatMoney(row.operatingProfit)}</strong><em>히스토리 누적 필요</em></div>`;
  }

  function getOperatingProfitHistory(row) {
    const explicit = Array.isArray(row.quarterHistory) ? row.quarterHistory : [];
    const fromRows = state.rows
      .filter((item) => item.stockCode && item.stockCode === row.stockCode && isFiniteNumber(item.operatingProfit))
      .map((item) => ({ label: quarterLabel(item.receiptDate || item.receiptAt), date: item.receiptDate || item.receiptAt, value: item.operatingProfit }));
    const merged = [...explicit, ...fromRows]
      .filter((item) => isFiniteNumber(item.value))
      .sort((a, b) => String(a.date || a.label).localeCompare(String(b.date || b.label)));
    const unique = [];
    const seen = new Set();
    for (const item of merged) {
      const key = `${item.label || item.date}-${item.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique.slice(-8);
  }

  function renderTurnaroundBars(row) {
    const prev = isFiniteNumber(row.prevOperatingProfit) ? row.prevOperatingProfit : 0;
    const current = isFiniteNumber(row.currentOperatingProfit) ? row.currentOperatingProfit : 0;
    const max = Math.max(1, Math.abs(prev), Math.abs(current));
    const prevWidth = Math.max(4, Math.min(100, Math.abs(prev) / max * 100));
    const currentWidth = Math.max(4, Math.min(100, Math.abs(current) / max * 100));
    return `<div class="turnaroundBars" aria-label="영업이익 전환 그래프">
      <span><i>직전</i><b class="${prev >= 0 ? "profit" : "loss"}" style="width:${prevWidth.toFixed(1)}%"></b><em>${formatMoney(prev)}</em></span>
      <span><i>당해</i><b class="${current >= 0 ? "profit" : "loss"}" style="width:${currentWidth.toFixed(1)}%"></b><em>${formatMoney(current)}</em></span>
    </div>`;
  }
  function stockCell(row) {
    return `<div class="earningsStock"><strong>${escapeHtml(row.corpName || "-")}</strong><em>${escapeHtml(row.stockCode || "-")} · ${escapeHtml(row.market || "-")}</em></div>`;
  }

  function metricCell(value, yoy, qoq) {
    return `<div class="metricCell"><strong>${formatMoney(value)}</strong><em><span class="deltaPill ${signedClass(yoy)}">YoY ${formatSignedPct(yoy)}</span>${isFiniteNumber(qoq) ? `<span class="deltaPill ${signedClass(qoq)}">QoQ ${formatSignedPct(qoq)}</span>` : ""}</em></div>`;
  }

  function dartLink(row) {
    return row.url ? `<em><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">DART 원문</a></em>` : `<em>원문 링크 없음</em>`;
  }

  function statusBadge(status) {
    const value = status || "확인필요";
    const tone = value.includes("흑자") || value === "적자축소" ? "red" : value.includes("적자") ? "blue" : "gray";
    return `<span class="profitBadge ${tone}">${escapeHtml(value)}</span>`;
  }

  function renderPriceTrend(row) {
    const stockCode = row.stockCode;
    const candles = getCandles(stockCode).slice(-64);
    if (candles.length < 2) return `<span class="miniTrend empty">-</span>`;
    const closes = candles.map((item) => item.close).filter(isFiniteNumber);
    if (closes.length < 2) return `<span class="miniTrend empty">-</span>`;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = Math.max(1, max - min);
    const width = 220;
    const height = 34;
    const pad = 3;
    const points = candles.map((item, index) => {
      const x = pad + (index / Math.max(1, candles.length - 1)) * (width - pad * 2);
      const y = height - pad - ((item.close - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const cls = closes.at(-1) >= closes[0] ? "up" : "down";
    const latestY = (height - pad - ((closes.at(-1) - min) / span) * (height - pad * 2)).toFixed(1);
    return `<span class="miniTrendWrap"><svg class="miniTrendSvg ${cls}" viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 가격 추이"><line class="latestCloseGuide" x1="${pad}" y1="${latestY}" x2="${width - pad}" y2="${latestY}"></line><polyline points="${points}"></polyline><circle class="eventDot" cx="${(width - pad).toFixed(1)}" cy="${latestY}" r="3.4"></circle></svg></span>`;
  }

  function getCandles(stockCode) {
    const prices = priceData.prices || {};
    const chunks = priceChunks || {};
    const list = prices[stockCode] || chunks[stockCode] || [];
    return Array.isArray(list) ? list.filter((item) => item && isFiniteNumber(item.close)).sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  }

  function normalizeQuarterHistory(value) {
    const list = Array.isArray(value) ? value : [];
    return list.map((item) => ({
      label: stringValue(item.label || item.quarter || item.period || item.분기 || item.date),
      date: normalizeDate(item.date || item.receiptDate || item.periodDate || item.기준일),
      value: numberValue(item.operatingProfit ?? item.op ?? item.영업이익 ?? item.value),
    })).filter((item) => isFiniteNumber(item.value));
  }

  function quarterLabel(value) {
    const text = normalizeDate(value);
    if (!text) return "최근";
    const [year, month] = text.split("-").map(Number);
    if (!year || !month) return text;
    const quarter = Math.ceil(month / 3);
    return `${String(year).slice(2)}.${quarter}Q`;
  }
  function calculateProfitStatus(prev, current) {
    if (!isFiniteNumber(prev) || !isFiniteNumber(current)) return "확인필요";
    if (prev < 0 && current > 0) return "흑자전환";
    if (prev > 0 && current < 0) return "적자전환";
    if (prev > 0 && current > 0) return "흑자지속";
    if (prev < 0 && current < 0) return Math.abs(current) < Math.abs(prev) ? "적자축소" : "적자지속";
    if (prev <= 0 && current === 0) return "적자축소";
    if (prev === 0 && current > 0) return "흑자전환";
    if (prev === 0 && current < 0) return "적자전환";
    return "확인필요";
  }

  function classifyReportType(name) {
    const text = String(name || "");
    if (text.includes("잠정") || text.includes("공정공시")) return "잠정실적";
    if (text.includes("분기")) return "분기보고서";
    if (text.includes("반기")) return "반기보고서";
    if (text.includes("사업보고서")) return "사업보고서";
    return "기타";
  }



  function fallbackRankRows(rows, predicate, primaryKey, fallbackKey, dir) {
    const primary = rows.filter(predicate).filter((row) => isFiniteNumber(row[primaryKey]) || isFiniteNumber(row[fallbackKey]));
    const source = primary.length ? primary : rows.filter((row) => isFiniteNumber(row[fallbackKey]));
    return source.sort((a, b) => numSort(metricValue(a, primaryKey, fallbackKey), metricValue(b, primaryKey, fallbackKey), dir));
  }
  function metricValue(row, primary, fallback) {
    return isFiniteNumber(row[primary]) ? row[primary] : row[fallback];
  }

  function fallbackGrowthMetric(primaryPct, fallbackMoney) {
    if (isFiniteNumber(primaryPct)) return { text: formatSignedPct(primaryPct), className: signedClass(primaryPct) };
    return { text: formatMoney(fallbackMoney), className: signedClass(fallbackMoney) };
  }
  function byNumber(key, dir) {
    return (a, b) => numSort(a[key], b[key], dir);
  }

  function numSort(a, b, dir) {
    const av = isFiniteNumber(a) ? a : (dir === "desc" ? -Infinity : Infinity);
    const bv = isFiniteNumber(b) ? b : (dir === "desc" ? -Infinity : Infinity);
    return dir === "asc" ? av - bv : bv - av;
  }

  function calcRatio(numerator, denominator) {
    if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator === 0) return null;
    return (numerator / denominator) * 100;
  }

  function diff(current, previous) {
    return isFiniteNumber(current) && isFiniteNumber(previous) ? current - previous : null;
  }

  function changeRate(current, previous) {
    if (!isFiniteNumber(current) || !isFiniteNumber(previous) || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function numberValue(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).replace(/,/g, "").replace(/억원|원|%/g, "").trim();
    if (!text || text === "-" || text.toUpperCase() === "N/A") return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  }

  function stringValue(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeCode(value) {
    const text = stringValue(value).replace(/[^0-9]/g, "");
    return text ? text.padStart(6, "0").slice(-6) : "";
  }

  function normalizeDate(value) {
    const text = stringValue(value);
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    return text;
  }

  function normalizeDateTime(value) {
    const text = stringValue(value);
    if (/^\d{14}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}`;
    if (/^\d{8}$/.test(text)) return normalizeDate(text);
    return text;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function formatMoney(value) {
    if (!isFiniteNumber(value)) return "N/A";
    return `${Math.round(value).toLocaleString("ko-KR")}억`;
  }

  function formatSignedMoney(value) {
    if (!isFiniteNumber(value)) return "N/A";
    if (value === 0) return "0억";
    return `${value > 0 ? "▲" : "▼"}${Math.abs(Math.round(value)).toLocaleString("ko-KR")}억`;
  }

  function formatPct(value) {
    if (!isFiniteNumber(value)) return "N/A";
    return `${value.toFixed(2)}%`;
  }

  function formatSignedPct(value) {
    if (!isFiniteNumber(value)) return "N/A";
    if (value === 0) return "0.00%";
    return `${value > 0 ? "▲" : "▼"}${Math.abs(value).toFixed(2)}%`;
  }

  function formatPrice(value) {
    if (!isFiniteNumber(value)) return "N/A";
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  }

  function signedClass(value) {
    if (!isFiniteNumber(value) || value === 0) return "neutral";
    return value > 0 ? "positive" : "negative";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }
})();











