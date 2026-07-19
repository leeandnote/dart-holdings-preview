const state = {
  rows: [],
  mode: "day",
  selectedStock: "all",
  market: "all",
  direction: "all",
  from: "",
  to: "",
  search: "",
  page: 1,
  pageSize: 10,
  chartRange: "1y",
  columnFilters: {},
  sortKey: "",
  sortDir: "",
  visibleColumns: new Set(["obligationDate", "rcept", "market", "reporter", "eventClose", "currentClose", "priceGap", "tradeValue", "previous", "current", "delta"]),
  meta: null,
  priceData: {},
  eventPrices: {},
  logos: {},
  priceLoadStatus: {},
};

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
let columnFilterTimer = null;
let composingColumnFilter = false;
const columns = [
  { key: "obligationDate", label: "보고의무발생일" },
  { key: "rcept", label: "접수일자" },
  { key: "market", label: "시장구분" },
  { key: "reporter", label: "주주/제출인" },
  { key: "eventClose", label: "지분변동일 종가" },
  { key: "currentClose", label: "현재 종가" },
  { key: "priceGap", label: "현재가 괴리" },
  { key: "tradeValue", label: "추정 변동금액" },
  { key: "previous", label: "직전보유" },
  { key: "current", label: "이번보유" },
  { key: "delta", label: "증감" },
];

document.getElementById("printBtn").addEventListener("click", () => window.print());
document.getElementById("csvBtn").addEventListener("click", downloadExcel);
document.getElementById("columnsBtn").addEventListener("click", () => {
  document.getElementById("columnsPanel").classList.toggle("hidden");
});
document.getElementById("searchInput").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  resetPage();
  render();
});
document.getElementById("pageSize").addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value) || 10;
  resetPage();
  render();
});
document.getElementById("stockSelect").addEventListener("change", (event) => {
  state.selectedStock = event.target.value;
  resetPage();
  commitRoute();
});
document.getElementById("marketFilter").addEventListener("change", (event) => {
  state.market = event.target.value;
  resetPage();
  commitRoute();
});
document.getElementById("directionFilter").addEventListener("change", (event) => {
  state.direction = event.target.value;
  resetPage();
  commitRoute();
});
document.getElementById("fromDate").addEventListener("change", (event) => {
  state.from = event.target.value;
  resetPage();
  commitRoute();
});
document.getElementById("toDate").addEventListener("change", (event) => {
  state.to = event.target.value;
  resetPage();
  commitRoute();
});
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    resetPage();
    commitRoute();
  });
});
window.addEventListener("popstate", () => {
  readRoute();
  syncControls();
  render();
});

load();

async function load() {
  try {
    let payload = window.__DART_DATA__;
    if (!payload) {
      const response = await fetch("data/latest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("latest.json not found");
      payload = await response.json();
    }
    state.meta = payload;
    state.rows = (payload.rows || []).map(normalizeRow);
    state.priceData = window.__PRICE_DATA__?.prices || {};
    state.eventPrices = window.__EVENT_PRICES__ || {};
    state.logos = window.__STOCK_LOGOS__ || {};
    state.from = defaultFromDate(payload);
    state.to = toDateInput(payload.endDe);
    readRoute();
    setupStocks();
    setupColumns();
    syncControls();
    render();
  } catch (error) {
    document.getElementById("title").textContent = "데이터가 없습니다";
    document.getElementById("period").textContent = "먼저 major_holdings.ps1을 실행해 data/latest.json을 생성하세요.";
  }
}

function normalizeRow(row) {
  const receiptDate = String(row["접수일"] || "");
  const obligationDate = String(row["보고의무발생일"] || row["보고의무발생일자"] || row["변동일"] || receiptDate);
  const stockCode = row["종목코드"] || "";
  const currentSharesText = row["보유주식수"] || "";
  const shareDeltaText = row["증감주식수"] || "";
  const currentShares = toNumber(currentSharesText);
  const shareDelta = toNumber(shareDeltaText);
  const previousShares = currentShares !== null && shareDelta !== null ? currentShares - shareDelta : null;
  const eventPrice =
    window.__EVENT_PRICES__?.[`${stockCode}_${obligationDate}`] ||
    window.__EVENT_PRICES__?.[`${stockCode}_${receiptDate}`] ||
    null;
  const currentPrice = window.__CURRENT_PRICES__?.[stockCode] || null;
  const tradeValue = eventPrice?.close && shareDelta !== null ? eventPrice.close * shareDelta : null;
  const priceGap =
    eventPrice?.close && currentPrice?.close
      ? currentPrice.close - eventPrice.close
      : null;
  const priceGapPct =
    eventPrice?.close && currentPrice?.close
      ? ((currentPrice.close - eventPrice.close) / eventPrice.close) * 100
      : null;
  return {
    date: receiptDate,
    obligationDate,
    market: row["시장"] || "",
    reportType: row["보고구분"] || "",
    corpName: row["종목명"] || "",
    stockCode,
    reporter: row["보고자"] || "",
    previous: toNumber(row["직전지분율"]),
    current: toNumber(row["이번지분율"]),
    delta: toNumber(row["증감률"]),
    previousShares,
    currentShares,
    shareDelta,
    close: eventPrice?.close ?? null,
    closeDate: eventPrice?.date || "",
    eventClose: eventPrice?.close ?? null,
    eventCloseDate: eventPrice?.date || "",
    tradeValue,
    currentClose: currentPrice?.close ?? null,
    currentCloseDate: currentPrice?.date || "",
    priceGap,
    priceGapPct,
    currentSharesText,
    shareDeltaText,
    crossed: row["5퍼센트상향돌파"] === "Y",
    reason: row["보고사유"] || "",
    url: row.DART_URL || "#",
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function readRoute() {
  const params = new URLSearchParams(location.search);
  state.selectedStock = params.get("stock") || "all";
  state.market = params.get("market") || state.market || "all";
  state.direction = params.get("direction") || state.direction || "all";
  state.mode = params.get("mode") || state.mode || "day";
  state.from = params.get("from") || state.from || defaultFromDate(state.meta);
  state.to = params.get("to") || state.to || toDateInput(state.meta?.endDe);
}

function commitRoute() {
  const params = new URLSearchParams();
  if (state.selectedStock !== "all") params.set("stock", state.selectedStock);
  if (state.market !== "all") params.set("market", state.market);
  if (state.direction !== "all") params.set("direction", state.direction);
  if (state.mode !== "day") params.set("mode", state.mode);
  if (state.from && state.from !== defaultFromDate(state.meta)) params.set("from", state.from);
  if (state.to && state.to !== toDateInput(state.meta?.endDe)) params.set("to", state.to);
  const next = `${location.pathname}${params.toString() ? `?${params}` : ""}`;
  history.pushState({}, "", next);
  syncControls();
  render();
}

function syncControls() {
  document.getElementById("stockSelect").value = state.selectedStock;
  document.getElementById("marketFilter").value = state.market;
  document.getElementById("directionFilter").value = state.direction;
  document.getElementById("fromDate").value = state.from;
  document.getElementById("toDate").value = state.to;
  document.getElementById("searchInput").value = state.search;
  document.getElementById("pageSize").value = String(state.pageSize);
  document.querySelectorAll("[data-mode]").forEach((item) => {
    item.classList.toggle("active", item.dataset.mode === state.mode);
  });
}

function setupColumns() {
  const panel = document.getElementById("columnsPanel");
  panel.innerHTML = columns.map((column) => `<label>
    <input type="checkbox" value="${column.key}" ${state.visibleColumns.has(column.key) ? "checked" : ""}>
    ${column.label}
  </label>`).join("");
  panel.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        state.visibleColumns.add(input.value);
      } else {
        state.visibleColumns.delete(input.value);
      }
      resetPage();
      render();
    });
  });
}

function setupStocks() {
  const select = document.getElementById("stockSelect");
  const stocks = stockSummaries(state.rows);
  select.innerHTML = `<option value="all">전체 종목</option>` + stocks.map((stock) =>
    `<option value="${stock.stockCode}">${escapeHtml(stock.corpName)} · ${stock.stockCode}</option>`
  ).join("");
}

function render() {
  const visibleRows = filteredRows();
  const scope = state.meta?.scope || "KOSPI/KOSDAQ";
  const selectedRows = state.selectedStock === "all" ? [] : state.rows.filter((row) => row.stockCode === state.selectedStock);
  const selectedName = selectedRows[0]?.corpName || "종목";
  document.getElementById("title").textContent = state.selectedStock === "all" ? "대량보유 변동 스캐너" : `${selectedName} 지분변동 상세`;
  document.getElementById("period").textContent = `${state.from || "-"} ~ ${state.to || "-"} · ${scope} · 갱신 ${state.meta?.generatedAt || "-"}`;

  if (state.selectedStock === "all") {
    document.getElementById("chartPanel").classList.add("hidden");
    document.getElementById("chart").innerHTML = "";
    drawEventRail([]);
    drawTopRankings(state.rows);
    drawInsight(visibleRows, null);
  } else {
    document.getElementById("chartPanel").classList.remove("hidden");
    document.getElementById("chartTitle").textContent = `${selectedName} 가격·지분변동 차트`;
    document.getElementById("chartHint").textContent = "캐싱된 일봉 가격 위에 DART 대량보유 변동일을 마커로 표시합니다.";
    drawPriceChart(selectedRows[0] || visibleRows[0], visibleRows);
    drawEventRail(visibleRows);
    drawTopRankings([]);
    drawInsight(visibleRows, selectedName);
  }

  const label = state.mode === "day" ? "일별" : state.mode === "week" ? "주별" : "월별";
  document.getElementById("listTitle").textContent = `${label} 대량보유 변동 테이블`;
  document.getElementById("listHint").textContent = `${visibleRows.length.toLocaleString("ko-KR")}건 · ${state.pageSize}개씩 표시 · 종목명을 누르면 상세 차트로 이동`;
  drawTable(groupRows(visibleRows, state.mode));
}

function drawTopRankings(rows) {
  const box = document.getElementById("topRankings");
  if (!box) return;
  if (state.selectedStock !== "all") {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  const dateKey = latestDateKey(rows);
  if (!dateKey) {
    box.innerHTML = "";
    return;
  }
  const todayKey = todayDateKey();
  const dateRows = rows.filter((row) => row.date === dateKey);
  const dateLabel = dateKey === todayKey ? `오늘 ${formatDate(dateKey)} 기준` : `최근 공시일 ${formatDate(dateKey)} 기준`;
  const panels = [
    {
      title: "#자금유입 규모",
      caption: "추정 변동금액 증가",
      tone: "up",
      metric: "money",
      rows: rankRowsBy(dateRows.filter((row) => row.tradeValue > 0), "tradeValue", "desc").slice(0, 5),
    },
    {
      title: "#자금이탈 규모",
      caption: "추정 변동금액 감소",
      tone: "down",
      metric: "money",
      rows: rankRowsBy(dateRows.filter((row) => row.tradeValue < 0), "tradeValue", "asc").slice(0, 5),
    },
    {
      title: "#신규 5% 진입",
      caption: "직전 5% 미만 → 이번 5% 이상",
      tone: "cross",
      metric: "stake",
      rows: rankRowsBy(dateRows.filter((row) => row.crossed || (row.previous < 5 && row.current >= 5)), "current", "desc").slice(0, 5),
    },
    {
      title: "#지분율 급증",
      caption: "이번 보고에서 지분율 증가폭 큰 순",
      tone: "up",
      metric: "stake",
      rows: rankRowsBy(dateRows.filter((row) => row.delta >= 3), "delta", "desc").slice(0, 5),
    },
    {
      title: "#현재가 하락 괴리",
      caption: "지분변동일 종가 대비 현재가 낮은 순",
      tone: "gap",
      metric: "gap",
      rows: rankRowsBy(dateRows.filter((row) => row.priceGapPct < 0), "priceGapPct", "asc").slice(0, 5),
    },
  ];
  box.innerHTML = `<div class="topRankHead">
    <div>
      <h2>핵심 변동 큐레이션</h2>
      <p>${escapeHtml(dateLabel)} · 검색/테이블 필터와 별도 고정</p>
    </div>
  </div>
  <div class="rankGrid">${panels.map(renderRankPanel).join("")}</div>`;
  box.querySelectorAll("[data-rank-stock]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStock = button.dataset.rankStock;
      commitRoute();
    });
  });
}

function latestDateKey(rows) {
  return rows.map((row) => row.date).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";
}

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function rankRowsBy(rows, key, dir = "desc") {
  const byStock = new Map();
  rows.forEach((row) => {
    if (!byStock.has(row.stockCode)) {
      byStock.set(row.stockCode, {
        ...row,
        reporterSet: new Set(),
        tradeValue: 0,
        delta: 0,
        shareDelta: 0,
      });
    }
    const item = byStock.get(row.stockCode);
    item.reporterSet.add(row.reporter || "미상");
    item.tradeValue += Number.isFinite(row.tradeValue) ? row.tradeValue : 0;
    item.delta += Number.isFinite(row.delta) ? row.delta : 0;
    item.shareDelta += Number.isFinite(row.shareDelta) ? row.shareDelta : 0;
    if (!["tradeValue", "delta", "shareDelta"].includes(key) && Number.isFinite(row[key])) {
      if (!Number.isFinite(item[key])) {
        item[key] = row[key];
      } else if (dir === "asc" && row[key] < item[key]) {
        item[key] = row[key];
      } else if (dir !== "asc" && row[key] > item[key]) {
        item[key] = row[key];
      }
    }
  });
  const aggregated = Array.from(byStock.values()).map((row) => {
    const reporters = Array.from(row.reporterSet);
    return {
      ...row,
      reporter: reporters.length > 1 ? `${reporters[0]} 외 ${reporters.length - 1}` : reporters[0],
    };
  });
  return aggregated.sort((a, b) => {
    const av = Number.isFinite(a[key]) ? a[key] : 0;
    const bv = Number.isFinite(b[key]) ? b[key] : 0;
    if (av !== bv) return dir === "asc" ? av - bv : bv - av;
    const at = Math.abs(Number.isFinite(a.tradeValue) ? a.tradeValue : 0);
    const bt = Math.abs(Number.isFinite(b.tradeValue) ? b.tradeValue : 0);
    if (bt !== at) return bt - at;
    return Math.abs(b.delta || 0) - Math.abs(a.delta || 0);
  });
}

function renderRankPanel(panel) {
  const previewRows = panel.rows.slice(0, 5);
  const items = previewRows.length ? previewRows.map((row, index) => {
    const metric = rankMetric(row, panel.metric);
    const cls = metric.value < 0 ? "negative" : "positive";
    return `<button class="rankItem" type="button" data-rank-stock="${row.stockCode}">
      <span class="rankNo">${index + 1}</span>
      <span class="rankName">${escapeHtml(row.corpName)}<em>${escapeHtml(row.reporter || "-")}</em></span>
      <span class="rankMetric ${cls}">${metric.main}<em>${metric.sub}</em></span>
    </button>`;
  }).join("") : `<p class="rankEmpty">해당 공시 없음</p>`;
  const more = panel.rows.length > previewRows.length
    ? `<p class="rankMore">외 ${panel.rows.length - previewRows.length}건은 테이블에서 확인</p>`
    : "";
  return `<article class="rankPanel ${panel.tone}">
    <h3>${escapeHtml(panel.title)}</h3>
    <p class="rankCaption">${escapeHtml(panel.caption || "")}</p>
    <div class="rankList">${items}</div>
    ${more}
  </article>`;
}

function rankMetric(row, metric) {
  if (metric === "gap") {
    return {
      value: row.priceGapPct || 0,
      main: formatSignedPctPlain(row.priceGapPct),
      sub: formatSignedPrice(row.priceGap),
    };
  }
  if (metric === "stake") {
    return {
      value: row.delta || 0,
      main: formatSignedPct(row.delta),
      sub: `${formatPct(row.previous)} → ${formatPct(row.current)}`,
    };
  }
  return {
    value: row.tradeValue || 0,
    main: formatSignedMoney(row.tradeValue),
    sub: formatSignedPct(row.delta),
  };
}

function filteredRows() {
  const from = fromDateInput(state.from) || "00000000";
  const to = fromDateInput(state.to) || "99999999";
  const rows = state.rows.filter((row) => {
    if (state.selectedStock !== "all" && row.stockCode !== state.selectedStock) return false;
    if (state.market !== "all" && row.market !== state.market) return false;
    if (row.date < from || row.date > to) return false;
    if (state.direction === "up" && !(row.delta > 0)) return false;
    if (state.direction === "down" && !(row.delta < 0)) return false;
    if (state.direction === "cross" && !row.crossed) return false;
    if (state.search) {
      const haystack = `${row.corpName} ${row.stockCode} ${row.reporter} ${row.reason} ${row.reportType} ${row.market}`.toLowerCase();
      if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    if (!matchesColumnFilters(row)) return false;
    return true;
  });
  return sortRows(rows);
}

function sortRows(rows) {
  if (!state.sortKey || !state.sortDir) return rows;
  const sign = state.sortDir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = sortValue(a, state.sortKey);
    const bv = sortValue(b, state.sortKey);
    if (typeof av === "number" || typeof bv === "number") {
      return ((av || 0) - (bv || 0)) * sign;
    }
    return String(av || "").localeCompare(String(bv || ""), "ko") * sign;
  });
}

function sortValue(row, key) {
  if (key === "previous") return row.previousShares;
  if (key === "current") return row.currentShares;
  if (key === "delta") return row.shareDelta;
  if (key === "eventClose") return row.eventClose;
  if (key === "tradeValue") return row.tradeValue;
  if (key === "currentClose") return row.currentClose;
  if (key === "priceGap") return row.priceGapPct;
  if (key === "obligationDate") return row.obligationDate;
  if (key === "rcept") return row.date;
  return row[key];
}

function matchesColumnFilters(row) {
  return Object.entries(state.columnFilters).every(([key, value]) => {
    if (!value) return true;
    const needle = String(value).trim().toLowerCase();
    if (!needle) return true;
    if (key === "stock") {
      return `${row.corpName} ${row.stockCode}`.toLowerCase().includes(needle);
    }
    if (key === "market") {
      return row.market === value;
    }
    if (key === "obligationDate") {
      return row.obligationDate === fromDateInput(value);
    }
    if (key === "rcept") {
      return row.date === fromDateInput(value);
    }
    return filterValue(row, key).toLowerCase().includes(needle);
  });
}

function filterValue(row, key) {
  if (key === "obligationDate") return formatDate(row.obligationDate);
  if (key === "rcept") return formatDate(row.date);
  if (key === "reporter") return row.reporter || "";
  if (key === "eventClose") return formatPrice(row.eventClose);
  if (key === "tradeValue") return formatSignedMoney(row.tradeValue);
  if (key === "currentClose") return formatPrice(row.currentClose);
  if (key === "priceGap") return `${formatSignedPrice(row.priceGap)} ${formatSignedPctPlain(row.priceGapPct)}`;
  if (key === "previous") return `${formatShares(row.previousShares)} ${formatPct(row.previous)}`;
  if (key === "current") return `${formatShares(row.currentShares)} ${formatPct(row.current)}`;
  if (key === "delta") return `${formatSignedShares(row.shareDelta)} ${formatSignedPct(row.delta)}`;
  return String(row[key] || "");
}

function stockSummaries(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.stockCode)) {
      map.set(row.stockCode, {
        stockCode: row.stockCode,
        corpName: row.corpName,
        market: row.market,
        count: 0,
        crossed: 0,
        totalDelta: 0,
        latest: row.date,
      });
    }
    const item = map.get(row.stockCode);
    item.count += 1;
    item.crossed += row.crossed ? 1 : 0;
    item.totalDelta += row.delta || 0;
    item.latest = item.latest > row.date ? item.latest : row.date;
  });
  return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest) || a.corpName.localeCompare(b.corpName, "ko"));
}

function drawPriceChart(row, visibleRows) {
  const chart = document.getElementById("chart");
  if (!row) {
    chart.textContent = "선택한 조건에 해당하는 공시가 없습니다.";
    return;
  }
  const candles = (state.priceData[row.stockCode] || []).filter((item) => item.open && item.high && item.low && item.close);
  if (!candles.length) {
    if (!state.priceLoadStatus[row.stockCode]) {
      state.priceLoadStatus[row.stockCode] = "loading";
      loadPriceChunk(row.stockCode);
      chart.innerHTML = `<div class="chartActions">
      <button class="backButton" type="button" id="backToAll">전체 테이블</button>
      <span class="priceSource">가격 캐시 로딩 중</span>
    </div>
    <div class="emptyChart">
      <strong>${escapeHtml(row.corpName)} ${row.stockCode}</strong>
      <p>종목별 가격 캐시를 불러오는 중입니다. 잠시 후 캔들차트와 지분변동 마커가 표시됩니다.</p>
    </div>`;
      document.getElementById("backToAll").addEventListener("click", () => {
        state.selectedStock = "all";
        commitRoute();
      });
      return;
    }
    chart.innerHTML = `<div class="chartActions">
      <button class="backButton" type="button" id="backToAll">전체 테이블</button>
      <span class="priceSource">가격 캐시 없음 · update_prices.ps1 실행 필요</span>
    </div>
    <div class="emptyChart">
      <strong>${escapeHtml(row.corpName)} ${row.stockCode}</strong>
      <p>아직 이 종목의 Yahoo 일봉 가격 데이터가 캐싱되지 않았습니다. DART 이벤트 표시는 정상이며, 가격 캐시를 생성하면 이 영역에 캔들차트와 마커가 함께 표시됩니다.</p>
    </div>`;
    document.getElementById("backToAll").addEventListener("click", () => {
      state.selectedStock = "all";
      commitRoute();
    });
    return;
  }

  const chartCandles = candlesForRange(candles, state.chartRange);
  const chartStart = chartCandles[0]?.date.replaceAll("-", "") || "";
  const chartEnd = chartCandles.at(-1)?.date.replaceAll("-", "") || "";
  const eventRows = visibleRows
    .filter((event) => {
      const key = event.obligationDate || event.date;
      return !chartStart || !chartEnd || (key >= chartStart && key <= chartEnd);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const svg = renderCandleSvg(chartCandles, eventRows);
  const latest = chartCandles.at(-1);
  const first = chartCandles[0];
  const perf = first ? ((latest.close - first.close) / first.close) * 100 : 0;
  const eventList = eventRows.slice(0, 8).map((event) => `<a class="detailEvent ${event.delta < 0 ? "down" : "up"}" href="${event.url}" target="_blank" rel="noreferrer">
    <span>${formatDate(event.date)}</span>
    <strong>${escapeHtml(event.reporter)}</strong>
    <em>${formatSignedPct(event.delta)} · ${formatSignedShares(event.shareDelta)}</em>
  </a>`).join("");
  chart.innerHTML = `<div class="chartActions">
    <button class="backButton" type="button" id="backToAll">전체 테이블</button>
    <div class="chartRangeGroup" aria-label="차트 기간 선택">
      ${renderChartRangeButtons()}
    </div>
    <span class="priceSource">Yahoo Finance 캐시 · ${chartCandles[0].date} ~ ${latest.date}</span>
  </div>
  <div class="priceSummary">
    <span>종가 <strong>${formatPrice(latest.close)}</strong></span>
    <span>기간수익률 <strong class="${perf >= 0 ? "positive" : "negative"}">${perf >= 0 ? "+" : ""}${number.format(perf)}%</strong></span>
    <span>이벤트 <strong>${eventRows.length.toLocaleString("ko-KR")}건</strong></span>
  </div>
  <div class="priceChartWrap">${svg}</div>
  <div id="chartTooltip" class="chartTooltip hidden"></div>
  <div class="detailEvents">${eventList || `<p class="muted">선택 기간의 지분변동 이벤트가 없습니다.</p>`}</div>`;
  document.getElementById("backToAll").addEventListener("click", () => {
    state.selectedStock = "all";
    commitRoute();
  });
  chart.querySelectorAll("[data-chart-range]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartRange = button.dataset.chartRange;
      render();
    });
  });
  bindChartTooltips(chart);
}

function renderChartRangeButtons() {
  return [
    ["1y", "1년"],
    ["6m", "6개월"],
    ["3m", "3개월"],
    ["1m", "1개월"],
    ["all", "전체"],
  ].map(([value, label]) =>
    `<button class="${state.chartRange === value ? "active" : ""}" type="button" data-chart-range="${value}">${label}</button>`
  ).join("");
}

function candlesForRange(candles, range) {
  if (range === "all") return candles;
  const latest = candles.at(-1);
  if (!latest) return candles;
  const start = new Date(`${latest.date}T00:00:00`);
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[range] || 12;
  start.setMonth(start.getMonth() - months);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const sliced = candles.filter((item) => item.date >= startKey);
  return sliced.length ? sliced : candles.slice(-120);
}

function renderCandleSvg(candles, events) {
  const width = 1180;
  const height = 430;
  const pad = { top: 22, right: 58, bottom: 54, left: 58 };
  const volumeHeight = 64;
  const priceBottom = height - pad.bottom - volumeHeight;
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const span = Math.max(1, maxPrice - minPrice);
  const maxVolume = Math.max(...candles.map((item) => item.volume || 0), 1);
  const xStep = (width - pad.left - pad.right) / Math.max(1, candles.length - 1);
  const bodyWidth = Math.max(3, Math.min(10, xStep * 0.58));
  const x = (index) => pad.left + index * xStep;
  const y = (price) => pad.top + ((maxPrice - price) / span) * (priceBottom - pad.top);
  const vY = (volume) => height - pad.bottom - (volume / maxVolume) * volumeHeight;
  const candleNodes = candles.map((item, index) => {
    const cx = x(index);
    const openY = y(item.open);
    const closeY = y(item.close);
    const highY = y(item.high);
    const lowY = y(item.low);
    const up = item.close >= item.open;
    const cls = up ? "up" : "down";
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(1.5, Math.abs(closeY - openY));
    const volH = height - pad.bottom - vY(item.volume || 0);
    return `<g class="candle ${cls}">
      <line x1="${cx.toFixed(1)}" y1="${highY.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${lowY.toFixed(1)}"></line>
      <rect x="${(cx - bodyWidth / 2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${bodyH.toFixed(1)}"></rect>
      <rect class="volumeBar" x="${(cx - bodyWidth / 2).toFixed(1)}" y="${vY(item.volume || 0).toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${volH.toFixed(1)}"></rect>
    </g>`;
  }).join("");
  const dateToIndex = new Map(candles.map((item, index) => [item.date.replaceAll("-", ""), index]));
  const markerNodes = events.map((event) => {
    let index = dateToIndex.get(event.date);
    if (index === undefined) {
      index = nearestCandleIndex(candles, event.obligationDate || event.date);
    }
    const candle = candles[index];
    if (!candle) return "";
    const cx = x(index);
    const cy = y(candle.high) - 12;
    const cls = event.delta < 0 ? "down" : "up";
    const tooltip = [
      `${formatDate(event.obligationDate || event.date)} / 접수 ${formatDate(event.date)}`,
      event.reporter,
      `지분 ${formatPct(event.previous)} → ${formatPct(event.current)} (${formatSignedPct(event.delta)})`,
      `주식 ${formatSignedShares(event.shareDelta)}`,
      event.tradeValue ? `추정 변동금액 ${formatSignedMoney(event.tradeValue)}` : "",
      event.close ? `종가 ${formatPrice(event.close)}` : "",
    ].filter(Boolean).join("\n");
    return `<a href="${event.url}" target="_blank" rel="noreferrer">
      <g class="chartMarker ${cls}" data-tooltip="${escapeHtml(tooltip)}">
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6"></circle>
      </g>
    </a>`;
  }).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gy = pad.top + ratio * (priceBottom - pad.top);
    const price = maxPrice - ratio * span;
    return `<line class="chartGrid" x1="${pad.left}" y1="${gy.toFixed(1)}" x2="${width - pad.right}" y2="${gy.toFixed(1)}"></line>
      <text class="priceAxis" x="${width - pad.right + 8}" y="${(gy + 4).toFixed(1)}">${formatPrice(price)}</text>`;
  }).join("");
  const labels = [0, Math.floor(candles.length / 2), candles.length - 1].map((index) => {
    const item = candles[index];
    return item ? `<text class="dateAxis" x="${x(index).toFixed(1)}" y="${height - 18}">${item.date.slice(5)}</text>` : "";
  }).join("");
  return `<svg class="priceChart" viewBox="0 0 ${width} ${height}" role="img" aria-label="가격 캔들차트와 지분변동 마커">
    ${grid}
    ${candleNodes}
    ${markerNodes}
    ${labels}
  </svg>`;
}

function bindChartTooltips(root) {
  const tooltip = root.querySelector("#chartTooltip");
  if (!tooltip) return;
  root.querySelectorAll("[data-tooltip]").forEach((marker) => {
    marker.addEventListener("mouseenter", (event) => {
      tooltip.innerHTML = escapeHtml(marker.dataset.tooltip || "").replaceAll("\n", "<br>");
      tooltip.classList.remove("hidden");
      moveChartTooltip(event, tooltip, root);
    });
    marker.addEventListener("mousemove", (event) => moveChartTooltip(event, tooltip, root));
    marker.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
  });
}

function moveChartTooltip(event, tooltip, root) {
  const rect = root.getBoundingClientRect();
  const left = Math.min(rect.width - 260, Math.max(10, event.clientX - rect.left + 14));
  const top = Math.max(10, event.clientY - rect.top - 18);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function nearestCandleIndex(candles, dartDate) {
  const target = `${dartDate.slice(0, 4)}-${dartDate.slice(4, 6)}-${dartDate.slice(6, 8)}`;
  let best = 0;
  let bestDiff = Infinity;
  candles.forEach((item, index) => {
    const diff = Math.abs(new Date(item.date) - new Date(target));
    if (diff < bestDiff) {
      best = index;
      bestDiff = diff;
    }
  });
  return best;
}

function loadPriceChunk(stockCode) {
  const existing = document.getElementById(`price_${stockCode}`);
  if (existing) return;
  const script = document.createElement("script");
  script.id = `price_${stockCode}`;
  script.src = `data/prices/${stockCode}.js`;
  script.onload = () => {
    state.priceData[stockCode] = window.__PRICE_CHUNKS__?.[stockCode] || [];
    state.priceLoadStatus[stockCode] = state.priceData[stockCode].length ? "loaded" : "missing";
    render();
  };
  script.onerror = () => {
    state.priceLoadStatus[stockCode] = "missing";
    render();
  };
  document.body.appendChild(script);
}

function drawEventRail(rows) {
  const rail = document.getElementById("eventRail");
  if (!rows.length) {
    rail.className = "eventRail";
    rail.innerHTML = "";
    return;
  }
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const min = dateMs(sorted[0].date);
  const max = dateMs(sorted.at(-1).date);
  const span = Math.max(1, max - min);
  rail.className = "eventRail active";
  rail.innerHTML = sorted.map((row, index) => {
    const pct = max === min ? 50 : Math.max(2, Math.min(98, ((dateMs(row.date) - min) / span) * 100));
    const cls = row.crossed ? "cross" : row.delta < 0 ? "down" : "";
    const labelTop = index % 2 === 0 ? 52 : 68;
    return `<a class="eventMarker ${cls}" href="${row.url}" target="_blank" rel="noreferrer" style="left:${pct}%" title="${escapeHtml(formatDate(row.date))} ${escapeHtml(row.reporter)} ${row.delta >= 0 ? "+" : ""}${number.format(row.delta || 0)}%p"></a>
      <span class="eventLabel" style="left:${pct}%; top:${labelTop}px">${formatDate(row.date).slice(5)}<br>${row.delta >= 0 ? "+" : ""}${number.format(row.delta || 0)}%p</span>`;
  }).join("");
}

function dateMs(value) {
  const text = String(value || "");
  if (text.length !== 8) return 0;
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00+09:00`).getTime();
}

function groupRows(rows, mode) {
  if (state.sortKey && state.sortDir) {
    return [{
      key: "sorted",
      title: "정렬 결과",
      rows,
      count: rows.length,
      totalDelta: rows.reduce((sum, row) => sum + (row.delta || 0), 0),
      crossed: rows.filter((row) => row.crossed).length,
    }];
  }
  const buckets = new Map();
  rows.forEach((row) => {
    const key = mode === "day" ? row.date : mode === "week" ? weekKey(row.date) : `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  return Array.from(buckets.entries()).map(([key, items]) => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    return {
      key,
      title: mode === "day" ? formatDate(key) : key,
      rows: sorted,
      count: sorted.length,
      totalDelta: sorted.reduce((sum, row) => sum + (row.delta || 0), 0),
      crossed: sorted.filter((row) => row.crossed).length,
    };
  }).sort((a, b) => b.key.localeCompare(a.key));
}

function weekKey(dateText) {
  const date = new Date(`${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 주`;
}

function drawTable(groups) {
  const list = document.getElementById("list");
  if (!groups.length) {
    list.innerHTML = `<p class="muted">조건에 맞는 공시가 없습니다.</p>`;
    return;
  }
  const rows = groups.flatMap((group) => group.rows.map((row) => ({ ...row, groupTitle: group.title })));
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);
  list.innerHTML = `${renderPagination(rows.length, totalPages)}
    <div class="holdingsCards">${renderTableHeader()}${pageRows.map(renderTableRow).join("")}</div>
    ${renderPagination(rows.length, totalPages)}`;
  bindColumnFilters(list);
  bindPagination(list);
  list.querySelectorAll("[data-stock]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStock = button.dataset.stock;
      resetPage();
      commitRoute();
    });
  });
}

function renderPagination(totalRows, totalPages) {
  const start = totalRows ? (state.page - 1) * state.pageSize + 1 : 0;
  const end = Math.min(totalRows, state.page * state.pageSize);
  const pages = pageWindow(state.page, totalPages).map((page) =>
    `<button class="pageButton ${page === state.page ? "active" : ""}" type="button" data-page="${page}">${page}</button>`
  ).join("");
  return `<nav class="pagination" aria-label="테이블 페이지 이동">
    <span class="pageSummary">${start.toLocaleString("ko-KR")}-${end.toLocaleString("ko-KR")} / ${totalRows.toLocaleString("ko-KR")}건</span>
    <div class="pageControls">
      <button class="pageButton" type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>이전</button>
      ${pages}
      <button class="pageButton" type="button" data-page="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>다음</button>
    </div>
  </nav>`;
}

function pageWindow(current, total) {
  const windowSize = 5;
  let start = Math.max(1, current - 2);
  const end = Math.min(total, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function bindPagination(root) {
  root.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.page);
      if (!Number.isFinite(next) || next < 1 || next === state.page) return;
      state.page = next;
      render();
      document.querySelector(".issueList")?.scrollIntoView({ block: "start" });
    });
  });
}

function renderTableHeader() {
  const cells = [`<div class="tableHeadCell stockHead">종목${columnFilterControl("stock")}</div>`];
  columns.forEach((column) => {
    if (state.visibleColumns.has(column.key)) {
      cells.push(`<div class="tableHeadCell" data-col="${column.key}">${column.label}${columnFilterControl(column.key)}</div>`);
    }
  });
  return `<div class="holdingHeader">${cells.join("")}</div>`;
}

function columnFilterControl(key) {
  const value = state.columnFilters[key] || "";
  if (key === "obligationDate" || key === "rcept") {
    const options = uniqueDateOptions(key).map((date) =>
      `<option value="${date}" ${value === date ? "selected" : ""}>${date}</option>`
    ).join("");
    return `<select class="columnFilter" data-column-filter="${key}" aria-label="${key} 날짜 선택">
      <option value="">전체</option>
      ${options}
    </select>`;
  }
  if (key === "market") {
    return `<select class="columnFilter" data-column-filter="${key}" aria-label="시장구분 필터">
      <option value="">전체</option>
      <option value="KOSPI" ${value === "KOSPI" ? "selected" : ""}>KOSPI</option>
      <option value="KOSDAQ" ${value === "KOSDAQ" ? "selected" : ""}>KOSDAQ</option>
    </select>`;
  }
  if (["eventClose", "tradeValue", "currentClose", "priceGap", "previous", "current", "delta"].includes(key)) {
    const active = state.sortKey === key ? state.sortDir : "";
  const label = key === "eventClose" ? "지분변동일 종가" : key === "currentClose" ? "현재 종가" : key === "priceGap" ? "현재가 괴리" : key === "tradeValue" ? "추정 변동금액" : key === "previous" ? "직전보유" : key === "current" ? "이번보유" : "증감";
    const descLabel = key === "tradeValue" ? "자금유입 큰 순" : key === "priceGap" ? "현재가 높은 순" : "큰 순서";
    const ascLabel = key === "tradeValue" ? "자금이탈 큰 순" : key === "priceGap" ? "현재가 낮은 순" : "작은 순서";
    return `<select class="columnFilter" data-sort-filter="${key}" aria-label="${label} 정렬">
      <option value="">정렬 없음</option>
      <option value="desc" ${active === "desc" ? "selected" : ""}>${descLabel}</option>
      <option value="asc" ${active === "asc" ? "selected" : ""}>${ascLabel}</option>
    </select>`;
  }
  const placeholder = {
    stock: "종목명/코드",
    reporter: "제출인",
  }[key] || "필터";
  return `<input class="columnFilter" data-column-filter="${key}" type="search" value="${escapeHtml(value)}" placeholder="${placeholder}" aria-label="${placeholder} 필터">`;
}

function bindColumnFilters(root) {
  root.querySelectorAll("[data-column-filter]").forEach((input) => {
    input.addEventListener("compositionstart", () => {
      composingColumnFilter = true;
      clearTimeout(columnFilterTimer);
    });
    input.addEventListener("compositionend", (event) => {
      composingColumnFilter = false;
      state.columnFilters[event.target.dataset.columnFilter] = event.target.value;
      resetPage();
      scheduleColumnFilterRender(event.target);
    });
    input.addEventListener("input", (event) => {
      state.columnFilters[event.target.dataset.columnFilter] = event.target.value;
      if (!composingColumnFilter) {
        resetPage();
        scheduleColumnFilterRender(event.target);
      }
    });
    input.addEventListener("change", (event) => {
      state.columnFilters[event.target.dataset.columnFilter] = event.target.value;
      if (!composingColumnFilter) {
        resetPage();
        scheduleColumnFilterRender(event.target, 0);
      }
    });
  });
  root.querySelectorAll("[data-sort-filter]").forEach((input) => {
    input.addEventListener("change", (event) => {
      state.sortKey = event.target.value ? event.target.dataset.sortFilter : "";
      state.sortDir = event.target.value;
      resetPage();
      render();
    });
  });
}

function resetPage() {
  state.page = 1;
}

function scheduleColumnFilterRender(input, delay = 650) {
  const key = input.dataset.columnFilter;
  clearTimeout(columnFilterTimer);
  columnFilterTimer = setTimeout(() => {
    const value = state.columnFilters[key] || "";
    render();
    requestAnimationFrame(() => {
      const nextInput = document.querySelector(`[data-column-filter="${key}"]`);
      if (!nextInput || nextInput.tagName === "SELECT") return;
      nextInput.focus();
      nextInput.value = value;
      const end = nextInput.value.length;
      if (typeof nextInput.setSelectionRange === "function") {
        nextInput.setSelectionRange(end, end);
      }
    });
  }, delay);
}

function uniqueDateOptions(key) {
  const values = state.rows.map((row) => key === "obligationDate" ? row.obligationDate : row.date)
    .filter(Boolean)
    .map(formatDate);
  return Array.from(new Set(values)).sort((a, b) => b.localeCompare(a));
}

function renderTableRow(row) {
  const deltaValue = Number.isFinite(row.delta) ? row.delta : row.shareDelta;
  const deltaClass = deltaValue < 0 ? "negative" : deltaValue > 0 ? "positive" : "";
  const moneyClass = row.tradeValue < 0 ? "negative" : row.tradeValue > 0 ? "positive" : "";
  const priceGapClass = row.priceGap < 0 ? "negative" : row.priceGap > 0 ? "positive" : "";
  const logo = state.logos[row.stockCode]
    ? `<img class="stockLogo" src="${escapeHtml(state.logos[row.stockCode])}" alt="" loading="lazy">`
    : "";
  const field = (key, value, sub = "", extraClass = "") => state.visibleColumns.has(key)
    ? `<div class="scanField ${extraClass}" data-col="${key}"><span class="fieldLabel">${columns.find((column) => column.key === key)?.label || key}</span><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ""}</div>`
    : "";
  return `<article class="holdingCard">
    <div class="scanStock">
      ${logo}
      <button class="stockButton" type="button" data-stock="${row.stockCode}">
        ${escapeHtml(row.corpName)}
        <span class="subText">${row.stockCode}</span>
      </button>
    </div>
    ${field("obligationDate", escapeHtml(formatDate(row.obligationDate)))}
    ${field("rcept", `<a class="receiptLink" href="${row.url}" target="_blank" rel="noreferrer">${formatDate(row.date)}</a>`)}
    ${field("market", escapeHtml(row.market))}
    ${field("reporter", escapeHtml(row.reporter))}
    ${field("eventClose", formatPrice(row.eventClose), row.eventCloseDate ? `${escapeHtml(row.eventCloseDate)} 기준` : "", "num")}
    ${field("currentClose", formatPrice(row.currentClose), row.currentCloseDate ? `${escapeHtml(row.currentCloseDate)} 기준` : "", "num")}
    ${field("priceGap", formatSignedPrice(row.priceGap), formatSignedPctPlain(row.priceGapPct), `num ${priceGapClass}`)}
    ${field("tradeValue", moneyBadge(row.tradeValue), "", `num moneyField ${moneyClass}`)}
    ${field("previous", formatShares(row.previousShares), formatPct(row.previous), "num")}
    ${field("current", formatShares(row.currentShares), formatPct(row.current), "num")}
    ${field("delta", formatSignedShares(row.shareDelta), formatSignedPct(row.delta), `num ${deltaClass}`)}
  </article>`;
}

function drawInsight(rows, corpName) {
  const box = document.getElementById("insight");
  if (!rows.length) {
    box.innerHTML = `<h2>자동 해석</h2><p class="muted">해석할 공시 데이터가 없습니다.</p>`;
    return;
  }
  const negative = rows.filter((row) => (row.delta || 0) < 0);
  const byReporter = new Map();
  rows.forEach((row) => {
    const key = row.reporter || "미상";
    byReporter.set(key, (byReporter.get(key) || 0) + (row.delta || 0));
  });
  const leadReporter = Array.from(byReporter.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const sumDelta = rows.reduce((sum, row) => sum + (row.delta || 0), 0);
  const title = corpName ? `${corpName} 자동 해석` : "시장 전체 자동 해석";
  const stance = sumDelta > 0
    ? "필터 구간에서 보유비율 순증이 우세합니다. 제출인 성격과 접수일 전후 가격 위치를 함께 확인할 만합니다."
    : "감소 공시가 섞여 있어 수급 지지 신호로 단정하기 어렵습니다.";
  const risk = negative.length > 0
    ? `동시에 감소 공시 ${negative.length}건이 있어 추격 매수보다 지지선 확인이 중요합니다.`
    : "감소 공시가 뚜렷하지 않아 수급 노이즈는 상대적으로 낮습니다.";
  box.innerHTML = `<h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(stance)}</p>
    <p>현재 필터 구간 합산 보유비율 변화는 <strong>${sumDelta >= 0 ? "+" : ""}${number.format(sumDelta)}%p</strong>입니다. 가장 영향이 큰 제출인은 <strong>${escapeHtml(leadReporter?.[0] || "-")}</strong>입니다.</p>
    <p>${escapeHtml(risk)} 이 해석은 공시 기반 수급 신호이며, 실제 진입은 일봉 추세, 거래량, 갭 발생 위치, 시장 주도 섹터 여부와 함께 판단해야 합니다.</p>`;
}

function downloadExcel() {
  const header = ["종목", "보고의무발생일", "접수일자", "시장구분", "주주/제출인", "지분변동일종가", "지분변동일종가기준일", "현재종가", "현재종가기준일", "현재가괴리금액", "현재가괴리율", "추정변동금액", "직전보유주식등의수", "직전보유비율", "이번보유주식등의수", "이번보유비율", "증감주식수", "증감비율", "DART_URL"];
  const body = filteredRows().map((row) => [
    row.corpName,
    row.obligationDate,
    row.date,
    row.market,
    row.reporter,
    row.eventClose ?? "",
    row.eventCloseDate,
    row.currentClose ?? "",
    row.currentCloseDate,
    row.priceGap ?? "",
    row.priceGapPct ?? "",
    row.tradeValue ?? "",
    row.previousShares ?? "",
    row.previous ?? "",
    row.currentShares ?? "",
    row.current ?? "",
    row.shareDelta ?? "",
    row.delta ?? "",
    row.url,
  ]);
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "major_holdings_table.xls";
  a.click();
  URL.revokeObjectURL(url);
}

function formatShares(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}주`;
}

function formatSignedShares(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value);
  return `${directionSymbol(rounded)}${Math.abs(rounded).toLocaleString("ko-KR")}주`;
}

function formatPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${number.format(value)}%`;
}

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatSignedPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value);
  return `${directionSymbol(rounded)}${Math.abs(rounded).toLocaleString("ko-KR")}원`;
}

function formatSignedMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const sign = directionSymbol(value);
  const abs = Math.abs(value);
  if (abs >= 100000000) {
    return `${sign}${Math.round(abs / 100000000).toLocaleString("ko-KR")}억원`;
  }
  if (abs >= 10000) {
    return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function formatSignedPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${directionSymbol(value)}${number.format(Math.abs(value))}%p`;
}

function formatSignedPctPlain(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${directionSymbol(value)}${number.format(Math.abs(value))}%`;
}

function directionSymbol(value) {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "";
}

function moneyBadge(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const cls = value < 0 ? "negative" : value > 0 ? "positive" : "neutral";
  return `<span class="moneyBadge ${cls}">${formatSignedMoney(value)}</span>`;
}

function toDateInput(value) {
  const text = String(value || "");
  if (text.length !== 8) return "";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function defaultFromDate(meta) {
  const end = String(meta?.endDe || "");
  if (end.length !== 8) return toDateInput(meta?.bgnDe);
  const date = new Date(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T00:00:00`);
  date.setDate(date.getDate() - 6);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromDateInput(value) {
  return String(value || "").replaceAll("-", "");
}

function formatDate(value) {
  const text = String(value || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
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
