const institutionState = {
  rows: [],
  preset: "all",
  reporter: "all",
  direction: "all",
  from: "",
  to: "",
  search: "",
  pageSize: 10,
  page: 1,
  sortKey: "",
  sortDir: "desc",
  quick: "all",
  flowMode: "buy",
  visibleBoardColumns: new Set(["date", "obligationDate", "share", "shareDelta", "money"]),
};

const instNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const institutionGroups = [
  {
    group: "global",
    label: "외국계 금융사",
    tableId: "globalInstitutionTable",
    hintId: "globalInstitutionHint",
    keywords: [
      "BLACKROCK", "블랙록", "MORGAN STANLEY", "모건스탠리", "J.P. MORGAN", "JP MORGAN", "JPMORGAN",
      "제이피모간", "골드만", "GOLDMAN", "UBS", "CREDIT SUISSE", "FIDELITY", "피델리티",
      "VANGUARD", "뱅가드", "STATE STREET", "스테이트스트리트", "NORGES", "노르웨이", "싱가포르", "GIC", "TEMASEK"
    ],
  },
  {
    group: "domestic",
    label: "국내 기관/운용사",
    tableId: "domesticInstitutionTable",
    hintId: "domesticInstitutionHint",
    keywords: [
      "미래에셋", "삼성자산", "KB자산", "케이비자산", "한국투자", "NH", "엔에이치", "신한자산",
      "한화자산", "교보", "하나자산", "마이다스", "브이아이피", "VIP", "트러스톤", "타임폴리오",
      "메리츠", "키움", "대신", "유진", "신영", "BNK", "아이엠", "DB자산", "다올", "흥국"
    ],
  },
  {
    group: "pension",
    label: "연기금/국부펀드",
    tableId: "pensionInstitutionTable",
    hintId: "pensionInstitutionHint",
    keywords: [
      "국민연금", "국민연금공단", "NATIONAL PENSION", "공무원연금", "사학연금", "우정사업본부",
      "한국투자공사", "KOREA INVESTMENT CORPORATION", "KIC", "CPP", "CANADA PENSION"
    ],
  },
];

document.getElementById("institutionPreset").addEventListener("change", (event) => {
  institutionState.preset = event.target.value;
  institutionState.reporter = "all";
  institutionState.page = 1;
  setupInstitutionReporters();
  renderInstitutionPage();
});

document.getElementById("institutionReporter").addEventListener("change", (event) => {
  institutionState.reporter = event.target.value;
  institutionState.page = 1;
  renderInstitutionPage();
});

document.getElementById("institutionDirection").addEventListener("change", (event) => {
  institutionState.direction = event.target.value;
  institutionState.page = 1;
  renderInstitutionPage();
});

document.getElementById("institutionFrom").addEventListener("change", (event) => {
  institutionState.from = event.target.value;
  institutionState.page = 1;
  renderInstitutionPage();
});

document.getElementById("institutionTo").addEventListener("change", (event) => {
  institutionState.to = event.target.value;
  institutionState.page = 1;
  renderInstitutionPage();
});

let institutionSearchTimer = null;
document.getElementById("institutionSearch").addEventListener("input", (event) => {
  institutionState.search = event.target.value.trim();
  institutionState.page = 1;
  clearTimeout(institutionSearchTimer);
  institutionSearchTimer = setTimeout(renderInstitutionPage, 250);
});

loadInstitutionPage();

function loadInstitutionPage() {
  const payload = window.__DART_DATA__ || { rows: [] };
  institutionState.rows = (payload.rows || []).map(normalizeInstitutionRow).filter((row) => row.institutionGroup);
  institutionState.to = toDateInput(payload.endDe) || toDateInput(latestDateKey(institutionState.rows));
  institutionState.from = defaultFrom(institutionState.to, 30);
  document.getElementById("institutionFrom").value = institutionState.from;
  document.getElementById("institutionTo").value = institutionState.to;
  setupInstitutionReporters();
  renderInstitutionPage();
}

function setupInstitutionReporters() {
  const select = document.getElementById("institutionReporter");
  const baseRows = institutionState.rows.filter((row) => institutionState.preset === "all" || row.institutionGroup === institutionState.preset);
  const reporters = new Map();
  baseRows.forEach((row) => {
    const item = reporters.get(row.reporter) || { reporter: row.reporter, count: 0, latest: "" };
    item.count += 1;
    item.latest = item.latest > row.date ? item.latest : row.date;
    reporters.set(row.reporter, item);
  });
  const options = Array.from(reporters.values())
    .sort((a, b) => b.latest.localeCompare(a.latest) || b.count - a.count || a.reporter.localeCompare(b.reporter, "ko-KR"));
  select.innerHTML = `<option value="all">관심 금융사 전체</option>` + options.map((item) =>
    `<option value="${escapeHtml(item.reporter)}">${escapeHtml(item.reporter)} · ${item.count.toLocaleString("ko-KR")}건</option>`
  ).join("");
  select.value = institutionState.reporter;
}

function normalizeInstitutionRow(row) {
  const receiptDate = String(row["접수일"] || "");
  const obligationDate = String(row["보고의무발생일"] || row["보고의무발생일자"] || row["변동일"] || receiptDate);
  const stockCode = row["종목코드"] || "";
  const reporter = row["보고자"] || "";
  const currentShares = toNumber(row["보유주식수"]);
  const shareDelta = toNumber(row["증감주식수"]);
  const previousShares = currentShares !== null && shareDelta !== null ? currentShares - shareDelta : null;
  const eventPrice = window.__EVENT_PRICES__?.[`${stockCode}_${obligationDate}`] || window.__EVENT_PRICES__?.[`${stockCode}_${receiptDate}`] || null;
  const currentPrice = window.__CURRENT_PRICES__?.[stockCode] || null;
  const eventClose = eventPrice?.close ?? null;
  const currentClose = currentPrice?.close ?? null;
  const group = classifyInstitution(reporter);
  return {
    date: receiptDate,
    obligationDate,
    corpName: row["종목명"] || "",
    stockCode,
    market: row["시장"] || "",
    reporter,
    institutionGroup: group?.group || "",
    institutionLabel: group?.label || "",
    previous: toNumber(row["직전지분율"]),
    current: toNumber(row["이번지분율"]),
    delta: toNumber(row["증감률"]),
    previousShares,
    currentShares,
    shareDelta,
    eventClose,
    eventCloseDate: eventPrice?.date || "",
    currentClose,
    currentCloseDate: currentPrice?.date || "",
    tradeValue: eventClose && shareDelta !== null ? eventClose * shareDelta : null,
    priceGapPct: eventClose && currentClose ? ((currentClose - eventClose) / eventClose) * 100 : null,
    crossed: row["5퍼센트상향돌파"] === "Y",
    url: row.DART_URL || "#",
  };
}

function classifyInstitution(reporter) {
  const text = String(reporter || "").toUpperCase();
  return institutionGroups.find((group) => group.keywords.some((keyword) => text.includes(keyword.toUpperCase())));
}

function renderInstitutionPage() {
  const rows = filteredInstitutionRows();
  document.getElementById("institutionPeriod").textContent = `${institutionState.from || "-"} ~ ${institutionState.to || "-"} · 필터 결과 ${rows.length.toLocaleString("ko-KR")}건`;
  document.getElementById("institutionSummary").innerHTML = renderSummary(rows);
  const sortedRows = [...rows].sort(sortInstitutionRowsByValue);
  const mainHint = document.getElementById("institutionMainHint");
  const mainTable = document.getElementById("institutionMainTable");
  if (mainHint && mainTable) {
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / institutionState.pageSize));
    institutionState.page = Math.min(Math.max(1, institutionState.page), totalPages);
    const start = (institutionState.page - 1) * institutionState.pageSize;
    const pageRows = sortedRows.slice(start, start + institutionState.pageSize);
    const rangeText = sortedRows.length ? `${(start + 1).toLocaleString("ko-KR")}-${(start + pageRows.length).toLocaleString("ko-KR")} / ${sortedRows.length.toLocaleString("ko-KR")}건` : `0 / 0건`;
    mainHint.textContent = `${rangeText} · 추정변동금액 절대값 기준 정렬`;
    mainTable.innerHTML = renderInstitutionToolbar() + renderInstitutionTable(pageRows) + renderInstitutionPagination(sortedRows.length, totalPages);
    bindInstitutionToolbar();
  }

  institutionGroups.forEach((group) => {
    const block = document.querySelector(`[data-institution-group="${group.group}"]`);
    block.classList.add("hidden");
    const groupRows = rows
      .filter((row) => row.institutionGroup === group.group)
      .sort(sortInstitutionRowsByValue)
      .slice(0, 80);
    document.getElementById(group.hintId).textContent = `${groupRows.length.toLocaleString("ko-KR")}건 · 금융사별 최근 변동순`;
    document.getElementById(group.tableId).innerHTML = renderInstitutionTable(groupRows);
  });
}

function renderInstitutionGroupBoard(rows) {
  const groups = [
    institutionGroups.find((group) => group.group === "domestic"),
    institutionGroups.find((group) => group.group === "global"),
    institutionGroups.find((group) => group.group === "pension"),
  ].filter(Boolean);
  return `<div class="institutionFlowBoard">
    ${groups.map((group) => {
      const groupRows = rows.filter((row) => row.institutionGroup === group.group).slice(0, institutionState.pageSize);
      const netValue = groupRows.reduce((sum, row) => sum + (Number.isFinite(row.tradeValue) ? row.tradeValue : 0), 0);
      return `<section class="institutionFlowColumn" data-institution-group="${group.group}">
        <header>
          <div>
            <p class="eyebrow">${escapeHtml(group.group === "domestic" ? "Domestic" : group.group === "global" ? "Foreign" : "Pension")}</p>
            <h3>${escapeHtml(group.label)}</h3>
          </div>
          <span>${groupRows.length.toLocaleString("ko-KR")}건 · ${formatSignedMoney(netValue)}</span>
        </header>
        ${renderInstitutionCompactTable(groupRows)}
      </section>`;
    }).join("")}
  </div>`;
}

function renderInstitutionToolbar() {
  const columns = [
    ["date", "접수일"],
    ["obligationDate", "보고의무발생일"],
    ["share", "직전 → 이번 (지분율 변화)"],
    ["shareDelta", "증감주식수"],
    ["money", "변동금액"],
  ];
  return `<div class="institutionTableToolbar">
    <select id="institutionGroupFilter" class="filterSelect institutionGroupFilter" aria-label="금융사 그룹 필터">
      <option value="all" ${institutionState.preset === "all" ? "selected" : ""}>전체 금융사</option>
      <option value="domestic" ${institutionState.preset === "domestic" ? "selected" : ""}>국내 기관</option>
      <option value="global" ${institutionState.preset === "global" ? "selected" : ""}>외국계</option>
      <option value="pension" ${institutionState.preset === "pension" ? "selected" : ""}>연기금</option>
    </select>
    <input id="institutionBoardSearch" class="searchInput" type="search" value="${escapeHtml(institutionState.search)}" placeholder="기관, 종목명 검색" aria-label="금융사 수급 테이블 검색">
    <button id="institutionXlsBtn" class="iconButton" type="button" title="엑셀 저장">▤ XLS</button>
    <button id="institutionImgBtn" class="iconButton" type="button" title="이미지 저장">▧ IMG</button>
    <button id="institutionFilterJumpBtn" class="iconButton" type="button" title="필터 조건으로 이동">☰ 필터</button>
    <details class="institutionColumnMenu">
      <summary class="iconButton"># 열</summary>
      <div class="institutionColumnPanel">
        ${columns.map(([key, label]) => `<label><input type="checkbox" value="${key}" ${institutionState.visibleBoardColumns.has(key) ? "checked" : ""}> ${label}</label>`).join("")}
      </div>
    </details>
    <select id="institutionPageSize" class="filterSelect" aria-label="페이지당 표시 개수">
      ${[10, 20, 30].map((size) => `<option value="${size}" ${institutionState.pageSize === size ? "selected" : ""}>${size}개씩 보기</option>`).join("")}
    </select>
  </div>`;
}

function renderInstitutionQuickFilters(rows) {
  const chips = [
    ["all", "전체"],
    ["pension", "국민연금/연기금"],
    ["jp", "JP모간/외국계"],
    ["mirae", "미래에셋/국내운용사"],
  ];
  return `<div class="institutionQuickFilters" aria-label="금융사 빠른 필터">
    ${chips.map(([key, label]) => `<button class="quickChip ${institutionState.quick === key ? "active" : ""}" type="button" data-inst-quick="${key}">
      ${escapeHtml(label)}
    </button>`).join("")}
    ${renderInstitutionMicroSummary(rows)}
  </div>`;
}

function renderInstitutionMicroSummary(rows) {
  if (institutionState.quick === "all" && !institutionState.search) return "";
  const label = institutionQuickLabel();
  const buy = rows.filter((row) => row.tradeValue > 0).reduce((sum, row) => sum + row.tradeValue, 0);
  const sell = rows.filter((row) => row.tradeValue < 0).reduce((sum, row) => sum + row.tradeValue, 0);
  const topStocks = [...rows]
    .sort((a, b) => Math.abs(b.tradeValue || 0) - Math.abs(a.tradeValue || 0))
    .slice(0, 3)
    .map((row) => row.corpName)
    .filter(Boolean);
  return `<div class="institutionMicroSummary">
    <strong>${escapeHtml(label)}</strong>
    <span>선택 구간 총 매수 ${formatSignedMoney(buy)} · 총 매도 ${formatSignedMoney(sell)}${topStocks.length ? ` · 주요 종목 ${escapeHtml([...new Set(topStocks)].join(", "))}` : ""}</span>
  </div>`;
}

function institutionQuickLabel() {
  if (institutionState.search) return institutionState.search;
  if (institutionState.quick === "pension") return "국민연금/연기금";
  if (institutionState.quick === "jp") return "JP모간/외국계";
  if (institutionState.quick === "mirae") return "미래에셋/국내운용사";
  return "전체 금융사";
}

function applyInstitutionQuickFilter(key) {
  institutionState.quick = key;
  institutionState.page = 1;
  institutionState.reporter = "all";
  if (key === "pension") {
    institutionState.preset = "pension";
    institutionState.search = "";
  } else if (key === "jp") {
    institutionState.preset = "global";
    institutionState.search = "JP";
  } else if (key === "mirae") {
    institutionState.preset = "domestic";
    institutionState.search = "미래에셋";
  } else {
    institutionState.preset = "all";
    institutionState.search = "";
  }
  setupInstitutionReporters();
  renderInstitutionPage();
}

function bindInstitutionToolbar() {
  const search = document.getElementById("institutionBoardSearch");
  search?.addEventListener("input", (event) => {
    institutionState.search = event.target.value.trim();
    institutionState.quick = institutionState.search ? "custom" : "all";
    institutionState.page = 1;
    const topSearch = document.getElementById("institutionSearch");
    if (topSearch) topSearch.value = event.target.value;
    clearTimeout(institutionSearchTimer);
    institutionSearchTimer = setTimeout(renderInstitutionPage, 250);
  });
  document.getElementById("institutionXlsBtn")?.addEventListener("click", downloadInstitutionExcel);
  document.getElementById("institutionImgBtn")?.addEventListener("click", downloadInstitutionImage);
  document.getElementById("institutionGroupFilter")?.addEventListener("change", (event) => {
    institutionState.preset = event.target.value;
    institutionState.reporter = "all";
    institutionState.page = 1;
    institutionState.quick = "all";
    const topPreset = document.getElementById("institutionPreset");
    if (topPreset) topPreset.value = institutionState.preset;
    setupInstitutionReporters();
    renderInstitutionPage();
  });
  document.getElementById("institutionFilterJumpBtn")?.addEventListener("click", () => {
    const filters = document.querySelector(".curationControls");
    filters?.classList.toggle("hidden");
    filters?.scrollIntoView({ block: "center", behavior: "smooth" });
    document.getElementById("institutionPreset")?.focus();
  });
  document.getElementById("institutionPageSize")?.addEventListener("change", (event) => {
    institutionState.pageSize = Number(event.target.value) || 10;
    institutionState.page = 1;
    renderInstitutionPage();
  });
  document.querySelectorAll(".institutionColumnPanel input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) institutionState.visibleBoardColumns.add(input.value);
      else institutionState.visibleBoardColumns.delete(input.value);
      renderInstitutionPage();
    });
  });
  document.querySelectorAll("[data-inst-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.instSort || "";
      if (institutionState.sortKey === key) {
        institutionState.sortDir = institutionState.sortDir === "desc" ? "asc" : "desc";
      } else {
        institutionState.sortKey = key;
        institutionState.sortDir = "desc";
      }
      institutionState.page = 1;
      renderInstitutionPage();
    });
  });
  document.querySelectorAll("[data-inst-quick]").forEach((button) => {
    button.addEventListener("click", () => applyInstitutionQuickFilter(button.dataset.instQuick || "all"));
  });
  document.querySelectorAll("[data-inst-flow-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      institutionState.flowMode = button.dataset.instFlowMode || "buy";
      renderInstitutionPage();
    });
  });
  document.querySelectorAll("[data-inst-page]").forEach((button) => {
    button.addEventListener("click", () => {
      institutionState.page = Number(button.dataset.instPage) || 1;
      renderInstitutionPage();
    });
  });
}

function renderInstitutionCompactTable(rows) {
  if (!rows.length) return `<p class="rankEmpty">해당 조건의 공시가 없습니다.</p>`;
  const showDate = institutionState.visibleBoardColumns.has("date");
  const showShare = institutionState.visibleBoardColumns.has("share");
  const showMoney = institutionState.visibleBoardColumns.has("money");
  return `<table class="institutionCompactTable">
    <thead>
      <tr>
        <th>기관/종목</th>
        ${showDate ? "<th>접수일</th>" : ""}
        ${showShare ? "<th>직전 → 이번</th>" : ""}
        ${showMoney ? "<th>변동금액</th>" : ""}
      </tr>
    </thead>
    <tbody>
      ${rows.map(renderInstitutionCompactRow).join("")}
    </tbody>
  </table>`;
}

function renderInstitutionCompactRow(row) {
  const moneyTone = row.tradeValue > 0 ? "positive" : row.tradeValue < 0 ? "negative" : "";
  const showDate = institutionState.visibleBoardColumns.has("date");
  const showShare = institutionState.visibleBoardColumns.has("share");
  const showMoney = institutionState.visibleBoardColumns.has("money");
  return `<tr>
    <td>
      <strong title="${escapeHtml(row.reporter)}">${escapeHtml(row.reporter)}</strong>
      <em>${escapeHtml(row.corpName)} · ${escapeHtml(row.stockCode)}</em>
    </td>
    ${showDate ? `
    <td>
      <strong>${formatDate(row.date)}</strong>
      <em><a class="receiptSourceLink" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">원문보기</a></em>
    </td>` : ""}
    ${showShare ? `
    <td class="num">
      <strong>${formatPct(row.previous)} → ${formatPct(row.current)}</strong>
      <em>${formatSignedPct(row.delta)}</em>
    </td>` : ""}
    ${showMoney ? `
    <td class="num">
      <span class="metricPill ${moneyTone}">${formatSignedMoney(row.tradeValue)}</span>
      <em>${formatShareUnits(row.shareDelta)}</em>
    </td>` : ""}
  </tr>`;
}

function filteredInstitutionRows() {
  const from = fromDateInput(institutionState.from) || "00000000";
  const to = fromDateInput(institutionState.to) || "99999999";
  return institutionState.rows.filter((row) => {
    if (institutionState.preset !== "all" && row.institutionGroup !== institutionState.preset) return false;
    if (institutionState.reporter !== "all" && row.reporter !== institutionState.reporter) return false;
    if (row.date < from || row.date > to) return false;
    if (institutionState.direction === "up" && !(row.delta > 0)) return false;
    if (institutionState.direction === "down" && !(row.delta < 0)) return false;
    if (institutionState.direction === "cross" && !(row.crossed || (row.previous < 5 && row.current >= 5))) return false;
    if (institutionState.search) {
      const haystack = `${row.reporter} ${row.corpName} ${row.stockCode} ${row.market}`.toLowerCase();
      if (!haystack.includes(institutionState.search.toLowerCase())) return false;
    }
    return true;
  });
}

function sortInstitutionRows(a, b) {
  if (institutionState.reporter === "all") {
    const reporterSort = a.reporter.localeCompare(b.reporter, "ko-KR");
    if (reporterSort !== 0) return reporterSort;
  }
  const absMoneyB = Number.isFinite(b.tradeValue) ? Math.abs(b.tradeValue) : -1;
  const absMoneyA = Number.isFinite(a.tradeValue) ? Math.abs(a.tradeValue) : -1;
  if (absMoneyB !== absMoneyA) return absMoneyB - absMoneyA;
  return b.date.localeCompare(a.date);
}

function sortInstitutionRowsByValue(a, b) {
  if (institutionState.sortKey) {
    const valueA = institutionSortValue(a, institutionState.sortKey);
    const valueB = institutionSortValue(b, institutionState.sortKey);
    const dir = institutionState.sortDir === "asc" ? 1 : -1;
    if (typeof valueA === "number" || typeof valueB === "number") {
      const numA = Number.isFinite(valueA) ? valueA : -Infinity;
      const numB = Number.isFinite(valueB) ? valueB : -Infinity;
      if (numA !== numB) return (numA - numB) * dir;
    } else {
      const textSort = String(valueA ?? "").localeCompare(String(valueB ?? ""), "ko-KR");
      if (textSort !== 0) return textSort * dir;
    }
  }
  const absMoneyB = Number.isFinite(b.tradeValue) ? Math.abs(b.tradeValue) : -1;
  const absMoneyA = Number.isFinite(a.tradeValue) ? Math.abs(a.tradeValue) : -1;
  if (absMoneyB !== absMoneyA) return absMoneyB - absMoneyA;
  return b.date.localeCompare(a.date) || a.reporter.localeCompare(b.reporter, "ko-KR");
}

function institutionSortValue(row, key) {
  const map = {
    reporter: row.reporter,
    stock: row.corpName,
    group: row.institutionLabel,
    date: row.date,
    obligationDate: row.obligationDate,
    share: row.current,
    delta: row.delta,
    shareDelta: row.shareDelta,
    priceGap: row.priceGapPct,
    money: row.tradeValue,
  };
  return map[key] ?? "";
}

function renderSummary(rows) {
  return renderInstitutionCuration(rows);
  const byGroup = institutionGroups.map((group) => ({
    ...group,
    count: rows.filter((row) => row.institutionGroup === group.group).length,
  }));
  const reporters = new Set(rows.map((row) => row.reporter)).size;
  const stocks = new Set(rows.map((row) => row.stockCode)).size;
  const inflow = rows.filter((row) => row.tradeValue > 0).reduce((sum, row) => sum + row.tradeValue, 0);
  const outflow = rows.filter((row) => row.tradeValue < 0).reduce((sum, row) => sum + row.tradeValue, 0);
  const reporterLabel = institutionState.reporter === "all" ? "선택 구간 주요 금융사" : escapeHtml(institutionState.reporter);
  return `<h2>필터 요약</h2>
    <p><strong>${reporterLabel}</strong> 공시 <strong>${rows.length.toLocaleString("ko-KR")}건</strong>, 제출인 <strong>${reporters.toLocaleString("ko-KR")}곳</strong>, 관련 종목 <strong>${stocks.toLocaleString("ko-KR")}개</strong>입니다.</p>
    <p>${byGroup.map((item) => `${item.label} <strong>${item.count.toLocaleString("ko-KR")}건</strong>`).join(" · ")} · 추정 순매수 ${formatSignedMoney(inflow)} / 추정 순매도 ${formatSignedMoney(outflow)}</p>
    ${renderInstitutionCuration(rows)}`;
}

function renderInstitutionCuration(rows) {
  const domesticBuyers = aggregateInstitutionReporters(rows.filter((row) => row.institutionGroup === "domestic"))
    .filter((row) => row.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue)
    .slice(0, 5);
  const globalBuyers = aggregateInstitutionReporters(rows.filter((row) => row.institutionGroup === "global"))
    .filter((row) => row.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue)
    .slice(0, 5);
  const pensionBuyers = aggregateInstitutionReporters(rows.filter((row) => row.institutionGroup === "pension"))
    .filter((row) => row.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue)
    .slice(0, 5);

  return `<div class="institutionCuration">
    <div class="institutionCurationHead">
      <div>
        <p class="eyebrow">핵심 변동 큐레이션</p>
        <h3>기간 내 순매수가 많았던 기관을 먼저 봅니다</h3>
      </div>
      <span>${institutionState.from || "-"} ~ ${institutionState.to || "-"}</span>
    </div>
    <div class="institutionCurationGrid">
      ${renderInstitutionReporterTable("국내 기관 순매수", "운용사·증권사 등 국내 제출인", domesticBuyers, "up")}
      ${renderInstitutionReporterTable("외국계 순매수", "JP모건·모건스탠리 등 글로벌 제출인", globalBuyers, "cross")}
      ${renderInstitutionReporterTable("연기금 순매수", "국민연금·국부펀드 등", pensionBuyers, "reporter")}
    </div>
  </div>`;
}

function aggregateInstitutionReporters(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.reporter) return;
    const item = map.get(row.reporter) || {
      reporter: row.reporter,
      institutionLabel: row.institutionLabel,
      count: 0,
      stocks: new Set(),
      netValue: 0,
      latestDate: "",
    };
    item.count += 1;
    item.stocks.add(row.stockCode);
    item.netValue += Number.isFinite(row.tradeValue) ? row.tradeValue : 0;
    item.latestDate = item.latestDate > row.date ? item.latestDate : row.date;
    map.set(row.reporter, item);
  });
  return Array.from(map.values())
    .map((item) => ({ ...item, stockCount: item.stocks.size }))
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue) || b.latestDate.localeCompare(a.latestDate));
}

function renderInstitutionCurationTable(title, subtitle, rows, tone) {
  const body = rows.length
    ? rows.map((row, index) => `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.reporter)}</em></td>
        <td class="num">${formatSignedMoney(row.tradeValue)}<em>${formatPct(row.previous)} → ${formatPct(row.current)}</em></td>
      </tr>`).join("")
    : `<tr><td colspan="3" class="emptyCell">해당 조건 없음</td></tr>`;
  return `<section class="institutionCurationPanel ${tone}">
    <header>
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </header>
    <table class="institutionCurationTable">
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function renderInstitutionReporterTable(title, subtitle, rows, toneClass = "reporter") {
  const body = rows.length
    ? rows.map((row, index) => {
      const tone = row.netValue > 0 ? "positive" : row.netValue < 0 ? "negative" : "";
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.reporter)}</strong><em>${escapeHtml(row.institutionLabel)} · ${row.stockCount.toLocaleString("ko-KR")}종목 · ${row.count.toLocaleString("ko-KR")}건</em></td>
        <td class="num ${tone}">${formatSignedMoney(row.netValue)}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="3" class="emptyCell">해당 조건 없음</td></tr>`;
  return `<section class="institutionCurationPanel ${toneClass}">
    <header>
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </header>
    <table class="institutionCurationTable">
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function renderInstitutionTable(rows) {
  if (!rows.length) return `<p class="rankEmpty">해당 조건의 금융사 수급 공시가 없습니다.</p>`;
  const cols = institutionTableColumns();
  return `<div class="dataTableWrap"><table class="dataTable institutionDataTable">
    <thead><tr>${cols.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => renderInstitutionTableRow(row, cols)).join("")}</tbody>
  </table></div>`;
}

function renderInstitutionPagination(totalRows, totalPages) {
  if (totalPages <= 1) return `<div class="pagination"><span>${totalRows.toLocaleString("ko-KR")}건</span></div>`;
  const current = institutionState.page;
  const pages = [];
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return `<div class="pagination">
    <span>${((current - 1) * institutionState.pageSize + 1).toLocaleString("ko-KR")}-${Math.min(current * institutionState.pageSize, totalRows).toLocaleString("ko-KR")} / ${totalRows.toLocaleString("ko-KR")}건</span>
    <div class="pageButtons">
      <button class="pageButton" type="button" data-inst-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>이전</button>
      ${pages.map((page) => `<button class="pageButton ${page === current ? "active" : ""}" type="button" data-inst-page="${page}">${page}</button>`).join("")}
      <button class="pageButton" type="button" data-inst-page="${current + 1}" ${current >= totalPages ? "disabled" : ""}>다음</button>
    </div>
  </div>`;
}

function institutionTableColumns() {
  const optional = [
    { key: "group", label: "분류", render: (row) => `<strong>${escapeHtml(row.institutionLabel)}</strong>` },
    { key: "date", label: "접수일", render: (row) => `${formatDate(row.date)}<em><a class="receiptSourceLink" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">원문보기</a></em>` },
    { key: "obligationDate", label: "보고의무발생일", render: (row) => formatDate(row.obligationDate), className: "num" },
    { key: "share", label: "직전 → 이번", render: (row) => `${formatPct(row.previous)} → ${formatPct(row.current)}`, className: "num strongCellDark" },
    { key: "delta", label: "증감", render: (row) => formatSignedPct(row.delta), className: (row) => `num ${row.delta > 0 ? "positive" : row.delta < 0 ? "negative" : ""}` },
    { key: "shareDelta", label: "증감주식수", render: (row) => formatShareUnits(row.shareDelta), className: "num" },
    { key: "priceGap", label: "종목 가격 괴리", render: (row) => formatSignedPctPlain(row.priceGapPct), className: (row) => `num ${row.priceGapPct > 0 ? "positive" : row.priceGapPct < 0 ? "negative" : ""}` },
    { key: "money", label: "추정변동금액", render: (row) => `<span class="metricPill ${row.tradeValue > 0 ? "positive" : row.tradeValue < 0 ? "negative" : ""}">${formatSignedMoney(row.tradeValue)}</span>`, className: "num" },
  ].filter((col) => institutionState.visibleBoardColumns.has(col.key));
  return [
    { key: "reporter", label: "금융사/제출인", render: (row) => `<strong>${escapeHtml(row.reporter)}</strong><em>${escapeHtml(row.institutionLabel)}</em>` },
    { key: "stock", label: "종목", render: (row) => `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)}${row.market ? ` · ${escapeHtml(row.market)}` : ""}</em>` },
  ].concat(optional);
}

function renderInstitutionTableRow(row, cols = institutionTableColumns()) {
  return `<tr>${cols.map((col) => {
    const className = typeof col.className === "function" ? col.className(row) : (col.className || "");
    return td(col.label, col.render(row), className);
  }).join("")}</tr>`;
}

function td(label, value, className = "") {
  return `<td data-label="${escapeHtml(label)}"${className ? ` class="${className}"` : ""}>${value}</td>`;
}

function renderInstitutionTable(rows) {
  if (!rows.length) return `<p class="rankEmpty">해당 조건의 금융사 수급 공시가 없습니다.</p>`;
  const cols = institutionTableColumns();
  const grid = institutionGridTemplate(cols);
  return `<div class="institutionHoldingsCards">
    <div class="institutionHoldingHeader" style="grid-template-columns:${grid}">
      ${cols.map((col) => `<div class="tableHeadCell">
        <button class="tableHeadButton" type="button" data-inst-sort="${escapeHtml(col.key)}">
          <span>${escapeHtml(col.label)} <i>↕</i></span>
          ${col.unit ? `<small>${escapeHtml(col.unit)}</small>` : ""}
        </button>
      </div>`).join("")}
    </div>
    ${rows.map((row) => renderInstitutionTableRow(row, cols, grid)).join("")}
  </div>`;
}

function institutionTableColumns() {
  const optional = [
    { key: "group", label: "분류", width: 124, render: (row) => `<strong>${escapeHtml(row.institutionLabel)}</strong>` },
    { key: "date", label: "접수일", width: 104, render: (row) => `${formatDate(row.date)}<em><a class="receiptSourceLink" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">원문보기</a></em>` },
    { key: "obligationDate", label: "보고의무발생일", width: 126, render: (row) => formatDate(row.obligationDate), className: "num" },
    { key: "share", label: "직전 → 이번", width: 132, render: (row) => `${formatPct(row.previous)} → ${formatPct(row.current)}`, className: "num strongCellDark" },
    { key: "delta", label: "증감", width: 104, render: (row) => formatSignedPct(row.delta), className: (row) => `num ${row.delta > 0 ? "positive" : row.delta < 0 ? "negative" : ""}` },
    { key: "shareDelta", label: "증감주식수", unit: "단위: 만주", width: 136, render: (row) => formatShareUnits(row.shareDelta), className: "num" },
    { key: "priceGap", label: "종목 가격 괴리", width: 124, render: (row) => formatSignedPctPlain(row.priceGapPct), className: (row) => `num ${row.priceGapPct > 0 ? "positive" : row.priceGapPct < 0 ? "negative" : ""}` },
    { key: "money", label: "지분변동금액", unit: "단위: 억원", width: 146, render: (row) => `<span class="metricPill ${row.tradeValue > 0 ? "positive" : row.tradeValue < 0 ? "negative" : ""}">${formatSignedMoney(row.tradeValue)}</span>`, className: "num" },
  ].filter((col) => institutionState.visibleBoardColumns.has(col.key));
  return [
    { key: "reporter", label: "금융사/제출인", width: 212, render: (row) => `<strong title="${escapeHtml(row.reporter)}">${escapeHtml(row.reporter)}</strong><em>${escapeHtml(row.institutionLabel)}</em>` },
    { key: "stock", label: "종목", width: 178, render: (row) => `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)}${row.market ? ` · ${escapeHtml(row.market)}` : ""}</em>` },
  ].concat(optional);
}

function renderInstitutionTableRow(row, cols = institutionTableColumns(), grid = institutionGridTemplate(cols)) {
  return `<div class="institutionHoldingRow" style="grid-template-columns:${grid}">
    ${cols.map((col) => {
      const className = typeof col.className === "function" ? col.className(row) : (col.className || "");
      return `<div class="scanField ${className}" data-col="${escapeHtml(col.key)}">
        <span class="fieldLabel">${escapeHtml(col.label)}</span>
        <div class="institutionCellValue">${col.render(row)}</div>
      </div>`;
    }).join("")}
  </div>`;
}

function institutionGridTemplate(cols) {
  return cols.map((col) => `${col.width || 120}px`).join(" ");
}

function currentInstitutionRows() {
  return filteredInstitutionRows().sort(sortInstitutionRowsByValue);
}

function downloadInstitutionExcel() {
  const rows = currentInstitutionRows();
  const header = ["분류", "금융사/제출인", "종목", "종목코드", "접수일", "보고의무발생일", "직전지분율", "이번지분율", "증감률", "증감주식수", "보고의무발생일종가", "최근일종가", "종목가격괴리율", "추정변동금액", "DART_URL"];
  const body = rows.map((row) => [
    row.institutionLabel,
    row.reporter,
    row.corpName,
    row.stockCode,
    formatDate(row.date),
    formatDate(row.obligationDate),
    formatPct(row.previous),
    formatPct(row.current),
    formatSignedPct(row.delta),
    formatShareUnits(row.shareDelta),
    row.eventClose ?? "",
    row.currentClose ?? "",
    formatSignedPctPlain(row.priceGapPct),
    Number.isFinite(row.tradeValue) ? Math.round(row.tradeValue) : "",
    row.url,
  ]);
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadInstitutionBlob(blob, `금융사수급_${fromDateInput(institutionState.from) || "전체"}_${fromDateInput(institutionState.to) || "전체"}_${rows.length}건.xls`);
}

function downloadInstitutionImage() {
  const rows = currentInstitutionRows();
  const start = (institutionState.page - 1) * institutionState.pageSize;
  const pageRows = rows.slice(start, start + institutionState.pageSize);
  const cols = institutionTableColumns();
  const colWidths = cols.map((col) => ({
    ...col,
    width: col.key === "reporter" ? 190 : col.key === "stock" ? 160 : col.key === "money" ? 140 : col.key === "share" ? 130 : 112,
  }));
  const rowHeight = 54;
  const headerHeight = 112;
  const margin = 30;
  const width = Math.max(980, colWidths.reduce((sum, col) => sum + col.width, margin * 2));
  const height = headerHeight + 38 + pageRows.length * rowHeight + 32;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 22px Pretendard, Arial";
  ctx.fillText("금융사 수급 변동 테이블", 32, 42);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 12px Pretendard, Arial";
  ctx.fillText(`${institutionState.from || "-"} ~ ${institutionState.to || "-"} · ${start + 1}-${start + pageRows.length} / ${rows.length}건`, 32, 64);
  let x = margin;
  const headerY = 88;
  ctx.fillStyle = "#111827";
  ctx.fillRect(margin, headerY, width - margin * 2, 38);
  colWidths.forEach((col) => {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 12px Pretendard, Arial";
    ctx.fillText(col.label, x + 8, headerY + 24);
    x += col.width;
  });
  pageRows.forEach((row, rowIndex) => {
    const y = headerY + 38 + rowIndex * rowHeight;
    ctx.fillStyle = rowIndex % 2 ? "#fbfcfe" : "#ffffff";
    ctx.fillRect(margin, y, width - margin * 2, rowHeight);
    ctx.strokeStyle = "#e5eaf1";
    ctx.beginPath();
    ctx.moveTo(margin, y + rowHeight);
    ctx.lineTo(width - margin, y + rowHeight);
    ctx.stroke();
    x = margin;
    colWidths.forEach((col) => {
      const value = plainInstitutionCell(row, col.key);
      ctx.fillStyle = col.key === "money" && row.tradeValue > 0 ? "#e03131" : col.key === "money" && row.tradeValue < 0 ? "#1c64d1" : "#0f172a";
      ctx.font = "850 12px Pretendard, Arial";
      if (col.className === "num" || ["share", "delta", "shareDelta", "priceGap", "money"].includes(col.key)) {
        ctx.textAlign = "right";
        ctx.fillText(truncateText(ctx, value, col.width - 14), x + col.width - 8, y + 31);
        ctx.textAlign = "left";
      } else {
        ctx.fillText(truncateText(ctx, value, col.width - 14), x + 8, y + 31);
      }
      x += col.width;
    });
  });
  canvas.toBlob((blob) => {
    if (blob) downloadInstitutionBlob(blob, `금융사수급_${fromDateInput(institutionState.from) || "전체"}_${fromDateInput(institutionState.to) || "전체"}.png`);
  }, "image/png");
}

function plainInstitutionCell(row, key) {
  if (key === "reporter") return row.reporter;
  if (key === "stock") return `${row.corpName} ${row.stockCode}`;
  if (key === "group") return row.institutionLabel;
  if (key === "date") return formatDate(row.date);
  if (key === "obligationDate") return formatDate(row.obligationDate);
  if (key === "share") return `${formatPct(row.previous)} → ${formatPct(row.current)}`;
  if (key === "delta") return formatSignedPct(row.delta);
  if (key === "shareDelta") return formatShareUnits(row.shareDelta);
  if (key === "priceGap") return formatSignedPctPlain(row.priceGapPct);
  if (key === "money") return formatSignedMoney(row.tradeValue);
  return "";
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || "-");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}...`;
}

function downloadInstitutionBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function defaultFrom(toValue, days) {
  const date = toValue ? new Date(`${toValue}T00:00:00`) : new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function latestDateKey(rows) {
  return rows.map((row) => row.date).filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";
}

function formatDate(value) {
  const text = String(value || "");
  if (text.length !== 8) return text || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${instNumber.format(value)}%`;
}

function formatSignedPct(value) {
  if (!Number.isFinite(value)) return "-";
  return `${directionSymbol(value)}${instNumber.format(Math.abs(value))}%p`;
}

function formatSignedPctPlain(value) {
  if (!Number.isFinite(value)) return "-";
  return `${directionSymbol(value)}${instNumber.format(Math.abs(value))}%`;
}

function formatShares(value) {
  if (!Number.isFinite(value)) return "-";
  return `${directionSymbol(value)}${Math.round(Math.abs(value)).toLocaleString("ko-KR")}주`;
}

function formatShareUnits(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = directionSymbol(value);
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const units = abs / 10000;
    const digits = units >= 100 ? 0 : units >= 10 ? 1 : 2;
    return `${sign}${units.toLocaleString("ko-KR", { maximumFractionDigits: digits })}만주`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}주`;
}

function formatSignedMoney(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = directionSymbol(value);
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${sign}${Math.round(abs / 100000000).toLocaleString("ko-KR")}억원`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만원`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function directionSymbol(value) {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "";
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

function renderInstitutionCuration(rows) {
  const mode = institutionState.flowMode === "sell" ? "sell" : "buy";
  const title = mode === "buy" ? "순매수" : "순매도";
  const subtitle = mode === "buy" ? "지분변동금액 증가 기준" : "지분변동금액 감소 기준";
  const groups = [
    { key: "domestic", title: "국내 기관", caption: "운용사·증권사 등 국내 제출인" },
    { key: "global", title: "외국계", caption: "JP모간·모건스탠리 등 글로벌 제출인" },
    { key: "pension", title: "연기금", caption: "국민연금·국부펀드 등" },
  ];
  return `<div class="institutionFlowRanking">
    <div class="flowRankTabs" role="tablist" aria-label="금융사 수급 방향">
      <button class="${mode === "buy" ? "active" : ""}" type="button" data-inst-flow-mode="buy">순매수</button>
      <button class="${mode === "sell" ? "active" : ""}" type="button" data-inst-flow-mode="sell">순매도</button>
    </div>
    <div class="flowRankHead">
      <div>
        <p class="eyebrow">핵심 변동 큐레이션</p>
        <h3>${title} 큰손 랭킹</h3>
      </div>
      <span>${escapeHtml(subtitle)} · ${institutionState.from || "-"} ~ ${institutionState.to || "-"}</span>
    </div>
    <div class="flowRankGrid">
      ${groups.map((group) => renderInstitutionFlowRankColumn(group, rows, mode)).join("")}
    </div>
  </div>`;
}

function renderInstitutionFlowRankColumn(group, rows, mode) {
  const ranked = rows
    .filter((row) => row.institutionGroup === group.key)
    .filter((row) => mode === "buy" ? row.tradeValue > 0 : row.tradeValue < 0)
    .sort((a, b) => mode === "buy" ? (b.tradeValue || 0) - (a.tradeValue || 0) : (a.tradeValue || 0) - (b.tradeValue || 0))
    .slice(0, 12);
  const body = ranked.length
    ? ranked.map((row, index) => renderInstitutionFlowRankRow(row, index)).join("")
    : `<li class="flowRankEmpty">해당 조건 없음</li>`;
  return `<section class="flowRankColumn" data-flow-group="${escapeHtml(group.key)}">
    <header>
      <strong>${escapeHtml(group.title)}</strong>
      <span>${escapeHtml(group.caption)}</span>
    </header>
    <div class="flowRankMeta">
      <span>순위 · 최근 공시 기준</span>
      <span>지분변동금액</span>
    </div>
    <ol class="flowRankList">${body}</ol>
  </section>`;
}

function renderInstitutionFlowRankRow(row, index) {
  const tone = row.tradeValue > 0 ? "positive" : row.tradeValue < 0 ? "negative" : "";
  const logo = stockLogo(row.stockCode);
  return `<li class="flowRankItem">
    <span class="flowRankNo">${index + 1}</span>
    <span class="flowRankLogo"><img src="${escapeHtml(logo)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/company-placeholder.svg'"></span>
    <span class="flowRankMain">
      <strong>${escapeHtml(row.reporter || "-")}</strong>
      <em>${escapeHtml(row.corpName || "-")} · ${escapeHtml(row.stockCode || "")}</em>
    </span>
    <span class="flowRankValue ${tone}">${formatSignedMoney(row.tradeValue)}</span>
  </li>`;
}

function stockLogo(stockCode) {
  const logos = window.__COMPANY_LOGOS__ || {};
  return logos[stockCode] || "assets/company-placeholder.svg";
}

function renderInstitutionToolbar() {
  const columns = [
    ["date", "접수일"],
    ["obligationDate", "보고의무발생일"],
    ["share", "직전 → 이번 (지분율 변화)"],
    ["shareDelta", "지분변동주식수"],
    ["money", "지분변동금액"],
  ];
  return `<div class="institutionTableToolbar">
    <input id="institutionBoardSearch" class="searchInput" type="search" value="${escapeHtml(institutionState.search)}" placeholder="기관, 종목명 검색" aria-label="금융사 수급 테이블 검색">
    <button id="institutionXlsBtn" class="toolIconButton" type="button" title="엑셀 저장">${institutionIcon("file")}<span>XLS</span></button>
    <button id="institutionImgBtn" class="toolIconButton" type="button" title="이미지 저장">${institutionIcon("image")}<span>IMG</span></button>
    <details class="institutionColumnMenu">
      <summary class="toolIconButton">${institutionIcon("columns")}<span>열</span></summary>
      <div class="institutionColumnPanel">
        ${columns.map(([key, label]) => `<label><input type="checkbox" value="${key}" ${institutionState.visibleBoardColumns.has(key) ? "checked" : ""}> ${label}</label>`).join("")}
      </div>
    </details>
    <select id="institutionPageSize" class="filterSelect" aria-label="페이지당 표시 개수">
      ${[10, 20, 30].map((size) => `<option value="${size}" ${institutionState.pageSize === size ? "selected" : ""}>${size}개씩 보기</option>`).join("")}
    </select>
  </div>`;
}

function institutionIcon(type) {
  const icons = {
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="m21 15-4-4L9 19"></path></svg>',
    columns: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path><path d="M9 6v12"></path><path d="M15 6v12"></path></svg>',
  };
  return icons[type] || "";
}

function institutionTableColumns() {
  const optional = [
    { key: "date", label: "접수일", width: 106, render: (row) => `${formatDate(row.date)}<em><a class="receiptSourceLink" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">원문보기</a></em>` },
    { key: "obligationDate", label: "보고의무발생일", width: 128, render: (row) => formatDate(row.obligationDate), className: "num" },
    { key: "share", label: "직전 → 이번 (지분율 변화)", width: 174, render: (row) => `${formatPct(row.previous)} → ${formatPct(row.current)}`, className: "num strongCellDark" },
    { key: "shareDelta", label: "지분변동주식수", unit: "단위: 만주", width: 142, render: (row) => formatShareUnits(row.shareDelta), className: "num" },
    { key: "money", label: "지분변동금액", unit: "단위: 억원", width: 150, render: (row) => `<span class="metricPill ${row.tradeValue > 0 ? "positive" : row.tradeValue < 0 ? "negative" : ""}">${formatSignedMoney(row.tradeValue)}</span>`, className: "num" },
  ].filter((col) => institutionState.visibleBoardColumns.has(col.key));
  return [
    { key: "reporter", label: "금융사/제출인", width: 230, render: (row) => `<strong title="${escapeHtml(row.reporter)}">${escapeHtml(row.reporter)}</strong><em>${escapeHtml(row.institutionLabel)}</em>` },
    { key: "stock", label: "종목", width: 186, render: (row) => `<strong>${escapeHtml(row.corpName)}</strong><em>${escapeHtml(row.stockCode)}${row.market ? ` · ${escapeHtml(row.market)}` : ""}</em>` },
  ].concat(optional);
}

function plainInstitutionCell(row, key) {
  if (key === "reporter") return row.reporter;
  if (key === "stock") return `${row.corpName} ${row.stockCode}`;
  if (key === "date") return formatDate(row.date);
  if (key === "obligationDate") return formatDate(row.obligationDate);
  if (key === "share") return `${formatPct(row.previous)} → ${formatPct(row.current)}`;
  if (key === "shareDelta") return formatShareUnits(row.shareDelta);
  if (key === "money") return formatSignedMoney(row.tradeValue);
  return "";
}

function downloadInstitutionExcel() {
  const rows = currentInstitutionRows();
  const header = ["금융사/제출인", "분류", "종목", "종목코드", "접수일", "보고의무발생일", "직전지분율", "이번지분율", "지분변동주식수", "지분변동금액", "DART_URL"];
  const body = rows.map((row) => [
    row.reporter,
    row.institutionLabel,
    row.corpName,
    row.stockCode,
    formatDate(row.date),
    formatDate(row.obligationDate),
    formatPct(row.previous),
    formatPct(row.current),
    formatShareUnits(row.shareDelta),
    Number.isFinite(row.tradeValue) ? Math.round(row.tradeValue) : "",
    row.url,
  ]);
  const html = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadInstitutionBlob(blob, `금융사수급_${fromDateInput(institutionState.from) || "전체"}_${fromDateInput(institutionState.to) || "전체"}_${rows.length}건.xls`);
}
