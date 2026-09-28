const majorEventState = { rows: [], search: "", market: "all", type: "all", from: "", to: "" };

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
  return compactText(summary).split(/[.!?。]/u)[0] || "주요경영사항";
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
    .replace(/^\s*[-:：·]\s*/u, "");
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
  return majorEventState.rows.filter((row) => {
    if (majorEventState.market !== "all" && row.market !== majorEventState.market) return false;
    if (majorEventState.type !== "all" && row.type !== majorEventState.type) return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    if (query && !`${row.corpName} ${row.stockCode} ${row.reportName} ${row.summary} ${row.secondary} ${typeMeta(row.type).label}`.toLowerCase().includes(query)) return false;
    return true;
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
    return `<div class="majorMetricBox contract"><strong>${Number.isFinite(row.amount) ? `▲ ${formatEok(row.amount)}` : row.status}</strong><em>${Number.isFinite(row.ratio) ? `매출 대비 ${row.ratio.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "금액·비중 원문 확인"}</em></div>`;
  }
  if (row.type === "clinical") {
    return `<div class="majorMetricBox clinical">${row.clinicalStage ? `<span>${majorEventEscape(row.clinicalStage)}</span>` : ""}<strong>${majorEventEscape(row.status)}</strong><em>임상 진행 단계</em></div>`;
  }
  if (row.type === "milestone") {
    const main = row.amount ? `▲ 약 ${formatEok(row.amount)}` : (row.foreignAmount?.label || row.status);
    return `<div class="majorMetricBox milestone"><strong>${majorEventEscape(main)}</strong><em>${majorEventEscape(row.foreignAmount?.label || "기술료·마일스톤")}</em></div>`;
  }
  return `<div class="majorMetricBox other"><strong>${majorEventEscape(row.status)}</strong><em>${majorEventEscape(typeMeta(row.type).label)}</em></div>`;
}

function renderPriceCell(row) {
  const change = row.price.changeRate;
  const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const changeText = Number.isFinite(change) ? `${change > 0 ? "▲" : change < 0 ? "▼" : ""}${Math.abs(change).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%` : "등락률 확인 중";
  return `<div class="majorPrice"><strong>${formatPrice(row.price.close)}</strong><em class="${changeClass}">${changeText}</em></div>`;
}

function renderMajorEvents() {
  const rows = filteredMajorEvents();
  const target = majorEventEl("majorEventList");
  if (!rows.length) {
    target.innerHTML = '<div class="emptyState">조건에 맞는 투자판단 관련 주요경영사항 공시가 없습니다.</div>';
    return;
  }
  target.innerHTML = `<div class="contractTableWrap"><table class="majorEventTable"><colgroup><col class="majorCol-stock"><col class="majorCol-date"><col class="majorCol-type"><col class="majorCol-event"><col class="majorCol-metric"><col class="majorCol-price"></colgroup><thead><tr><th>종목</th><th>접수일</th><th>유형구분</th><th>주요 사건 / 내용</th><th>핵심 지표 / 수치</th><th>최근일 종가</th></tr></thead><tbody>${rows.map((row) => `<tr>
    <td><div class="majorStockCell">${renderStockLogo(row)}<span><strong title="${majorEventEscape(row.corpName)}">${majorEventEscape(row.corpName)}</strong><em>${majorEventEscape(row.stockCode)} · ${majorEventEscape(row.market)}</em></span></div></td>
    <td><div class="majorDateCell"><strong>${majorEventDisplayDate(row.date, "-")}</strong><a href="${majorEventEscape(row.url)}" target="_blank" rel="noopener noreferrer">원문보기</a></div></td>
    <td><span class="majorTypeBadge ${row.type}">${majorEventEscape(typeMeta(row.type).label)}</span></td>
    <td><div class="majorEventContent"><strong title="${majorEventEscape(row.title)}">${majorEventEscape(row.title)}</strong><em title="${majorEventEscape(row.secondary)}">${majorEventEscape(row.secondary)}</em></div></td>
    <td>${renderMajorMetric(row)}</td>
    <td>${renderPriceCell(row)}</td>
  </tr>`).join("")}</tbody></table></div><p class="tableCount">총 ${rows.length.toLocaleString("ko-KR")}건</p>`;
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
  majorEventEl("majorEventType").addEventListener("change", (event) => { majorEventState.type = event.target.value; renderMajorEvents(); });
  majorEventEl("majorEventFrom").addEventListener("change", (event) => { majorEventState.from = event.target.value; renderMajorEvents(); });
  majorEventEl("majorEventTo").addEventListener("change", (event) => { majorEventState.to = event.target.value; renderMajorEvents(); });
  renderMajorEventCuration();
  renderMajorEvents();
}

initializeMajorEvents();
