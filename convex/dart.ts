import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { strFromU8, unzipSync } from "fflate";
import { action, internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };
const sendPendingRef = makeFunctionReference<"action">("telegramActions:sendPending") as any;

type DartListItem = {
  corp_code?: string;
  corp_name?: string;
  stock_code?: string;
  corp_cls?: string;
  report_nm?: string;
  rcept_no?: string;
  rcept_dt?: string;
};

type MajorStockItem = {
  rcept_no?: string;
  report_tp?: string;
  repror?: string;
  stkrt?: string;
  stkrt_irds?: string;
  report_resn?: string;
  report_ostn?: string;
  report_de?: string;
  report_dt?: string;
};


type ExecutiveStockItem = {
  rcept_no?: string;
  rcept_dt?: string;
  corp_code?: string;
  corp_name?: string;
  repror?: string;
  isu_exctv_rgist_at?: string;
  isu_exctv_ofcps?: string;
  isu_main_shrholdr?: string;
  sp_stock_lmp_cnt?: string;
  sp_stock_lmp_irds_cnt?: string;
  sp_stock_lmp_rate?: string;
  sp_stock_lmp_irds_rate?: string;
};

type ExecutiveAlertRow = AlertRow & {
  executiveRegistration?: string;
  executiveRole?: string;
  mainShareholder?: string;
  previousShares?: number;
  currentShares?: number;
  shareDelta?: number;
  tradeUnitPrice?: number;
  tradeValue?: number;
  tradeShares?: number;
  tradeTypeLabel?: string;
};
type AlertRow = {
  receiptNo: string;
  receiptDate: string;
  corpCode: string;
  stockCode: string;
  corpName: string;
  market: string;
  reportName: string;
  url: string;
  reporter?: string;
  previousRate?: number;
  currentRate?: number;
  rateDelta?: number;
  previousShares?: number;
  currentShares?: number;
  shareDelta?: number;
  reason?: string;
  obligationDate?: string;
  buyUnitPrice?: number;
  buyTradeValue?: number;
  buyShares?: number;
  buyTradeRows?: number;
  buyPriceLabel?: string;
  buyTypeLabel?: string;
  eventClose?: number;
  eventCloseDate?: string;
  priceSource?: string;
};
type ContractAlertRow = {
  receiptNo: string;
  receiptDate: string;
  corpCode: string;
  stockCode: string;
  corpName: string;
  market: string;
  reportName: string;
  url: string;
  amount?: number;
  salesRatio?: number;
  counterparty?: string;
  content?: string;
  startDate?: string;
  endDate?: string;
  correction?: boolean;
};

type BuyTradeInfo = {
  unitPrice?: number;
  tradeValue?: number;
  shares?: number;
  rows: number;
  priceLabel: string;
  typeLabel: string;
};

type DocumentSummaryInfo = {
  reporter?: string;
  reason?: string;
  obligationDate?: string;
  previousShares?: number;
  currentShares?: number;
  shareDelta?: number;
  previousRate?: number;
  currentRate?: number;
  rateDelta?: number;
};

type EventCloseInfo = {
  close: number;
  date: string;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function ymdKst(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function nowKstText(): string {
  const text = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return `${text.replace(",", "")} KST`;
}

function isKstMonitorWindow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  return weekday !== "Sat" && weekday !== "Sun" && minutes >= 7 * 60 && minutes <= 20 * 60;
}

function formatDate(value?: string): string {
  if (!value) return "확인불가";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const raw = decodeXmlText(value).replace(/<[^>]*>/g, " ").trim();
  if (!raw) return undefined;
  if (/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(raw) || /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일$/.test(raw)) return undefined;
  const normalized = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/[,%주원]/g, "")
    .replace(/[△▲]/g, "")
    .replace(/[▽▼]/g, "-")
    .replace(/[−－–—]/g, "-")
    .replace(/\(([-+]?\d+(?:\.\d+)?)\)/g, "-$1")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "" || normalized === "-" || normalized === "－") return undefined;
  const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toSummaryNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, "").trim();
  if (normalized === "-" || normalized === "－") return 0;
  return toNumber(value);
}

function formatPercent(value?: number): string {
  if (value === undefined) return "확인불가";
  return value === 0 ? "0%" : `${value.toFixed(2)}%`;
}

function formatSignedPercent(value?: number): string {
  if (value === undefined) return "확인불가";
  const sign = value >= 0 ? "▲" : "▼";
  return `${sign} ${Math.abs(value).toFixed(2)}%`;
}

function formatShares(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "원문 확인 필요";
  return `${Math.round(value).toLocaleString("ko-KR")}주`;
}

function isFiniteNumber(value?: number): value is number {
  return value !== undefined && Number.isFinite(value);
}

function hasOwnershipMetric(row: { previousRate?: number; currentRate?: number; rateDelta?: number; previousShares?: number; currentShares?: number; shareDelta?: number }): boolean {
  const hasMeaningfulRate =
    (isFiniteNumber(row.previousRate) && row.previousRate !== 0) ||
    (isFiniteNumber(row.currentRate) && row.currentRate !== 0) ||
    (isFiniteNumber(row.rateDelta) && row.rateDelta !== 0);
  const hasMeaningfulShares =
    (isFiniteNumber(row.previousShares) && row.previousShares !== 0) ||
    (isFiniteNumber(row.currentShares) && row.currentShares !== 0) ||
    (isFiniteNumber(row.shareDelta) && row.shareDelta !== 0);
  return hasMeaningfulRate || hasMeaningfulShares;
}

function formatOwnershipChange(row: { previousRate?: number; currentRate?: number; rateDelta?: number; previousShares?: number; currentShares?: number; shareDelta?: number }): string {
  const hasPreviousRate = isFiniteNumber(row.previousRate);
  const hasCurrentRate = isFiniteNumber(row.currentRate);
  const hasMeaningfulRate =
    (hasPreviousRate && row.previousRate !== 0) ||
    (hasCurrentRate && row.currentRate !== 0) ||
    (isFiniteNumber(row.rateDelta) && row.rateDelta !== 0);
  const hasPreviousShares = isFiniteNumber(row.previousShares);
  const hasCurrentShares = isFiniteNumber(row.currentShares);
  const hasMeaningfulShares =
    (hasPreviousShares && row.previousShares !== 0) ||
    (hasCurrentShares && row.currentShares !== 0) ||
    (isFiniteNumber(row.shareDelta) && row.shareDelta !== 0);
  const lines: string[] = [];
  if (hasMeaningfulRate) {
    const previousRate = hasPreviousRate ? formatPercent(row.previousRate) : "0%";
    const currentRate = hasCurrentRate ? formatPercent(row.currentRate) : "0%";
    lines.push(`<b>보유비율:</b> ${escapeHtml(`${previousRate} → ${currentRate}`)}`);
  }
  if (hasMeaningfulShares) {
    const previousShares = hasPreviousShares ? formatShares(row.previousShares) : "0주";
    const currentShares = hasCurrentShares ? formatShares(row.currentShares) : "0주";
    lines.push(`<b>보유주식수:</b> ${escapeHtml(`${previousShares} → ${currentShares}`)}`);
  }
  if (lines.length === 0) {
    lines.push(`<b>보유정보:</b> ${escapeHtml("원문 별도 확인")}`);
  }
  return lines.join("\n");
}
function formatWon(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "N/A";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatEok(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "N/A";
  if (value >= 100000000) {
    const eok = value / 100000000;
    const rounded = eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1);
    return `${rounded}억 원`;
  }
  return `${Math.round(value / 10000).toLocaleString("ko-KR")}만 원`;
}

function formatSignedEok(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "N/A";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatEok(Math.abs(value))}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function plainTextWithCellSpaces(value: string): string {
  return decodeXmlText(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeDartBytes(bytes: Uint8Array): string {
  const candidates: string[] = [];
  for (const encoding of ["utf-8", "euc-kr"] as const) {
    try {
      candidates.push(new TextDecoder(encoding).decode(bytes));
    } catch {
      // Some runtimes do not support every legacy label.
    }
  }
  try {
    candidates.push(strFromU8(bytes));
  } catch {
    // Ignore fflate decoder fallback failures.
  }
  if (candidates.length === 0) return "";
  const score = (candidate: string) => {
    const text = plainTextWithCellSpaces(candidate);
    let value = 0;
    if (text.includes("보고자")) value += 5;
    if (text.includes("직전보고서")) value += 5;
    if (text.includes("이번보고서")) value += 5;
    if (text.includes("소유")) value += 3;
    if (text.includes("보유")) value += 3;
    value -= (candidate.match(/�/g) ?? []).length * 2;
    return value;
  };
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

function marketName(corpClass?: string): string {
  if (corpClass === "Y") return "KOSPI";
  if (corpClass === "K") return "KOSDAQ";
  return "";
}

function compactYmd(value?: string): string | undefined {
  const digits = value?.replace(/\D/g, "").slice(0, 8);
  return digits && digits.length === 8 ? digits : undefined;
}

function yahooSymbol(stockCode: string, market: string): string | undefined {
  if (!/^\d{6}$/.test(stockCode)) return undefined;
  if (market === "KOSPI") return `${stockCode}.KS`;
  if (market === "KOSDAQ") return `${stockCode}.KQ`;
  return undefined;
}

async function fetchEventClose(stockCode: string, market: string, ymd?: string): Promise<EventCloseInfo | undefined> {
  const dateKey = compactYmd(ymd);
  const symbol = yahooSymbol(stockCode, market);
  if (!dateKey || !symbol) return undefined;

  const target = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(4, 6)) - 1,
    Number(dateKey.slice(6, 8)),
  );
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(Math.floor((target - 7 * 86400000) / 1000)));
  url.searchParams.set("period2", String(Math.floor((target + 7 * 86400000) / 1000)));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");

  const response = await fetch(url, {
    headers: { "user-agent": "leeandnote-convex-dart-monitor/1.0" },
  });
  if (!response.ok) return undefined;
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  let best: EventCloseInfo | undefined;
  let bestDiff = Infinity;
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = quote.close?.[index];
    if (!Number.isFinite(close)) continue;
    const date = new Date(timestamps[index] * 1000);
    const kst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const diff = Math.abs(Date.UTC(Number(kst.slice(0, 4)), Number(kst.slice(5, 7)) - 1, Number(kst.slice(8, 10))) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { date: kst, close: Math.round(Number(close) * 100) / 100 };
    }
  }
  return best;
}

function reporterType(reporter = "", reason = ""): string {
  const text = `${reporter} ${reason}`;
  if (/Capital|Research|BlackRock|Vanguard|Global|Management|Advisors|Advisor|LLC|LP|Ltd|Limited|S\.A\.|외국/.test(text)) return "외국계";
  if (/최대주주|대표|특수관계|특별관계|오너|친인척|임원/.test(text)) return "오너·특수관계";
  if (/자산운용|투자자문|투자조합|사모|펀드|운용/.test(text)) return "기관·투자자";
  if (/은행|증권|캐피탈|저축은행/.test(text)) return "금융기관";
  return "주요주주";
}

function xmlCell(rowXml: string, code: string): string {
  const pattern = new RegExp(`<(?:TE|TU|TD)\\b(?=[^>]*(?:ACODE|AUNIT)="${code}")[^>]*>(.*?)</(?:TE|TU|TD)>`, "is");
  const match = rowXml.match(pattern);
  return match ? decodeXmlText(match[1]) : "";
}

function xmlCells(rowXml: string): string[] {
  return [...rowXml.matchAll(/<(?:TE|TU|TD|TH)\b[^>]*>(.*?)<\/(?:TE|TU|TD|TH)>/gis)]
    .map((match) => decodeXmlText(match[1]))
    .filter((value) => value.length > 0);
}

function xmlFirstCellByCode(xml: string, code: string): string {
  const pattern = new RegExp(`<(?:TE|TU|TD)\\b(?=[^>]*(?:ACODE|AUNIT)="${code}")[^>]*>(.*?)</(?:TE|TU|TD)>`, "is");
  const match = xml.match(pattern);
  return match ? decodeXmlText(match[1]) : "";
}

function toSummaryZeroableNumber(value?: string): number | undefined {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return undefined;
  if (cleaned === "-") return 0;
  return toSummaryNumber(cleaned);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "");
}

function extractTextAfterLabel(text: string, label: string): string | undefined {
  const index = text.indexOf(label);
  if (index < 0) return undefined;
  const rest = text.slice(index + label.length, index + label.length + 180);
  const match = rest.match(/[:：]?\s*([^\n\r<]+)/);
  return match?.[1]?.trim();
}

function cleanSummaryValue(value?: string): string | undefined {
  const cleaned = value
    ?.replace(/[:：]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned && cleaned !== "-" ? cleaned : undefined;
}

function extractRowValue(rows: string[][], label: string): string | undefined {
  const normalizedLabel = normalizeText(label);
  for (const cells of rows) {
    const index = cells.findIndex((cell) => normalizeText(cell).includes(normalizedLabel));
    if (index < 0) continue;
    for (const cell of cells.slice(index + 1)) {
      const value = cleanSummaryValue(cell);
      if (value) return value;
    }
  }
  return undefined;
}

function ownershipLineFromCells(cells: string[]): { shares?: number; rate?: number } | undefined {
  const numericCells = cells
    .map((cell, index) => ({ index, text: normalizeText(cell), value: toSummaryZeroableNumber(cell) }))
    .filter((cell): cell is { index: number; text: string; value: number } => cell.value !== undefined);
  if (numericCells.length < 2) return undefined;

  const candidates: Array<{ shares: number; rate: number; score: number }> = [];
  for (let index = 0; index < numericCells.length - 1; index += 1) {
    const shares = numericCells[index].value;
    const rate = numericCells[index + 1].value;
    if (Math.abs(shares) > 100000000000 || Math.abs(rate) > 100) continue;
    const adjacentBonus = numericCells[index + 1].index - numericCells[index].index <= 2 ? 3 : 0;
    const rateBonus = Math.abs(rate) <= 100 ? 2 : 0;
    const shareBonus = Math.abs(shares) >= 1 || shares === 0 ? 1 : 0;
    candidates.push({ shares, rate, score: adjacentBonus + rateBonus + shareBonus + index / 100 });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  return { shares: candidates[0].shares, rate: candidates[0].rate };
}

function extractOwnershipLinesFromPlain(text: string): Pick<DocumentSummaryInfo, "previousShares" | "currentShares" | "previousRate" | "currentRate"> {
  const result: Pick<DocumentSummaryInfo, "previousShares" | "currentShares" | "previousRate" | "currentRate"> = {};
  const plain = plainTextWithCellSpaces(text).replace(/직전\s+보고서/g, "직전보고서").replace(/이번\s+보고서/g, "이번보고서");
  const datePattern = "(?:\\d{4}[.\\-]\\d{1,2}[.\\-]\\d{1,2}|\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일)";
  const numberPattern = "(?:[-－]|[-+▲△▼▽]?\\d[\\d,]*(?:\\.\\d+)?)";
  const rowPattern = new RegExp(`(직전보고서|이번보고서)\\s+${datePattern}\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})`, "g");

  for (const match of plain.matchAll(rowPattern)) {
    const firstShares = toSummaryZeroableNumber(match[2]);
    const firstRate = toSummaryZeroableNumber(match[3]);
    const stockShares = toSummaryZeroableNumber(match[4]);
    const stockRate = toSummaryZeroableNumber(match[5]);
    const shares = stockShares ?? firstShares;
    const rate = stockRate ?? firstRate;
    if (match[1] === "직전보고서") {
      result.previousShares = shares;
      result.previousRate = rate;
    } else {
      result.currentShares = shares;
      result.currentRate = rate;
    }
  }

  const parseMarkerRow = (marker: "직전보고서" | "이번보고서") => {
    const markerIndex = plain.indexOf(marker);
    if (markerIndex < 0) return undefined;
    const otherMarker = marker === "직전보고서" ? "이번보고서" : "총감";
    const nextIndex = plain.indexOf(otherMarker, markerIndex + marker.length);
    const segment = plain
      .slice(markerIndex, nextIndex > markerIndex ? nextIndex : markerIndex + 420)
      .replace(new RegExp(datePattern), " ");
    const tokens = [...segment.matchAll(/[-－]|[-+▲△▼▽]?\d[\d,]*(?:\.\d+)?/g)]
      .map((match) => toSummaryZeroableNumber(match[0]))
      .filter((value): value is number => value !== undefined);
    if (tokens.length >= 4) {
      return { shares: tokens[2], rate: tokens[3] };
    }
    if (tokens.length >= 2) {
      return { shares: tokens[0], rate: tokens[1] };
    }
    return undefined;
  };

  const previous = parseMarkerRow("직전보고서");
  const current = parseMarkerRow("이번보고서");
  if (previous) {
    result.previousShares ??= previous.shares;
    result.previousRate ??= previous.rate;
  }
  if (current) {
    result.currentShares ??= current.shares;
    result.currentRate ??= current.rate;
  }

  return result;
}

function extractOwnershipLinesFromRows(rows: string[][]): Pick<DocumentSummaryInfo, "previousShares" | "currentShares" | "previousRate" | "currentRate"> {
  const result: Pick<DocumentSummaryInfo, "previousShares" | "currentShares" | "previousRate" | "currentRate"> = {};
  const sectionLabels = [
    "보유주식등의수및보유비율",
    "소유특정증권등의수및소유비율",
    "소유주식등의수및소유비율",
  ];

  for (let index = 0; index < rows.length; index += 1) {
    const rowText = normalizeText(rows[index].join(" "));
    if (!sectionLabels.some((label) => rowText.includes(label))) continue;

    const directNumbers = rows[index].map((cell) => toSummaryNumber(cell)).filter((value): value is number => value !== undefined);
    if (directNumbers.length >= 4) {
      result.previousShares = directNumbers[0];
      result.previousRate = directNumbers[1];
      result.currentShares = directNumbers[2];
      result.currentRate = directNumbers[3];
      return result;
    }

    for (const cells of rows.slice(index + 1, index + 32)) {
      const label = normalizeText(cells.join(" "));
      const parsed = ownershipLineFromCells(cells);
      if (!parsed) continue;

      if (label.includes("직전보고")) {
        result.previousShares = parsed.shares ?? result.previousShares;
        result.previousRate = parsed.rate ?? result.previousRate;
      }
      if (label.includes("이번보고")) {
        result.currentShares = parsed.shares ?? result.currentShares;
        result.currentRate = parsed.rate ?? result.currentRate;
      }
      if (
        result.previousShares !== undefined &&
        result.currentShares !== undefined &&
        result.previousRate !== undefined &&
        result.currentRate !== undefined
      ) {
        return result;
      }
    }
  }

  for (const cells of rows) {
    const label = normalizeText(cells.join(" "));
    const parsed = ownershipLineFromCells(cells);
    if (!parsed) continue;
    if (label.includes("직전보고")) {
      result.previousShares ??= parsed.shares;
      result.previousRate ??= parsed.rate;
    }
    if (label.includes("이번보고")) {
      result.currentShares ??= parsed.shares;
      result.currentRate ??= parsed.rate;
    }
  }

  return result;
}

function extractDocumentSummaryInfo(text?: string): DocumentSummaryInfo {
  if (!text) return {};
  const plain = decodeXmlText(text);
  const rows = [...text.matchAll(/<TR\b[^>]*>.*?<\/TR>/gis)].map((match) => xmlCells(match[0]));
  let previousShares: number | undefined;
  let currentShares: number | undefined;
  let previousRate: number | undefined;
  let currentRate: number | undefined;

  const executivePreviousShares = toSummaryZeroableNumber(xmlFirstCellByCode(text, "BFR_UN_CNT")) ?? toSummaryZeroableNumber(xmlFirstCellByCode(text, "BFR_PS_CPT_CNT"));
  const executiveCurrentShares = toSummaryNumber(xmlFirstCellByCode(text, "AFR_UN_CNT")) ?? toSummaryNumber(xmlFirstCellByCode(text, "AFR_PS_CPT_CNT"));
  const executiveShareDelta = toSummaryNumber(xmlFirstCellByCode(text, "MDF_UN_CNT")) ?? toSummaryNumber(xmlFirstCellByCode(text, "MDF_PS_CPT_CNT"));
  const executivePreviousRate = toSummaryZeroableNumber(xmlFirstCellByCode(text, "BFR_UN_RT")) ?? toSummaryZeroableNumber(xmlFirstCellByCode(text, "BFR_PS_CPT_RT"));
  const executiveCurrentRate = toSummaryNumber(xmlFirstCellByCode(text, "AFR_UN_RT")) ?? toSummaryNumber(xmlFirstCellByCode(text, "AFR_PS_CPT_RT"));
  const executiveRateDelta = toSummaryNumber(xmlFirstCellByCode(text, "MDF_UN_RT")) ?? toSummaryNumber(xmlFirstCellByCode(text, "MDF_PS_CPT_RT"));
  const majorPreviousShares = toSummaryZeroableNumber(xmlFirstCellByCode(text, "SUM_BMT_CNT"));
  const majorCurrentShares = toSummaryNumber(xmlFirstCellByCode(text, "SUM_TMT_CNT"));
  const majorPreviousRate = toSummaryZeroableNumber(xmlFirstCellByCode(text, "SUM_BMT_RT"));
  const majorCurrentRate = toSummaryNumber(xmlFirstCellByCode(text, "SUM_TMT_RT"));

  if (executiveCurrentRate !== undefined) currentRate = executiveCurrentRate;
  if (executivePreviousRate !== undefined) previousRate = executivePreviousRate;
  if (executiveCurrentShares !== undefined) currentShares = executiveCurrentShares;
  if (executivePreviousShares !== undefined) previousShares = executivePreviousShares;
  if (previousRate === undefined && currentRate !== undefined && executiveRateDelta !== undefined) previousRate = Number((currentRate - executiveRateDelta).toFixed(4));
  if (previousShares === undefined && currentShares !== undefined && executiveShareDelta !== undefined) previousShares = currentShares - executiveShareDelta;
  previousShares ??= majorPreviousShares;
  currentShares ??= majorCurrentShares;
  previousRate ??= majorPreviousRate;
  currentRate ??= majorCurrentRate;

  const ownership = extractOwnershipLinesFromRows(rows);
  previousShares ??= ownership.previousShares;
  currentShares ??= ownership.currentShares;
  previousRate ??= ownership.previousRate;
  currentRate ??= ownership.currentRate;

  const plainOwnership = extractOwnershipLinesFromPlain(text);
  const hasPlainOwnershipPair =
    plainOwnership.previousShares !== undefined &&
    plainOwnership.currentShares !== undefined &&
    plainOwnership.previousRate !== undefined &&
    plainOwnership.currentRate !== undefined;
  if (hasPlainOwnershipPair) {
    // Tagged summary cells are authoritative; plain text can include unrelated columns.
    previousShares ??= plainOwnership.previousShares;
    currentShares ??= plainOwnership.currentShares;
    previousRate ??= plainOwnership.previousRate;
    currentRate ??= plainOwnership.currentRate;
  }

  if (previousRate === undefined || currentRate === undefined) {
    const datePattern = "(?:\\d{4}[.\\-]\\d{2}[.\\-]\\d{2}|\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일)";
    const executiveOwnershipPattern = new RegExp(
      `직전보고서\\s+${datePattern}\\s+([\\d,]+)\\s+([\\d.]+)\\s+([\\d,]+)\\s+([\\d.]+)\\s+이번보고서\\s+${datePattern}\\s+([\\d,]+)\\s+([\\d.]+)\\s+([\\d,]+)\\s+([\\d.]+)`,
      "s",
    );
    const match = plain.match(executiveOwnershipPattern);
    if (match) {
      previousShares = toSummaryNumber(match[1]) ?? previousShares;
      previousRate = toSummaryNumber(match[2]) ?? previousRate;
      currentShares = toSummaryNumber(match[5]) ?? currentShares;
      currentRate = toSummaryNumber(match[6]) ?? currentRate;
    }
  }

  const reporter = extractRowValue(rows, "보고자") ?? cleanSummaryValue(extractTextAfterLabel(plain, "보고자"));
  const reason = extractRowValue(rows, "보고사유") ?? cleanSummaryValue(extractTextAfterLabel(plain, "보고사유"));
  const obligationDate = extractRowValue(rows, "보고의무발생일") ?? cleanSummaryValue(extractTextAfterLabel(plain, "보고의무발생일"));
  const rateDelta = previousRate !== undefined && currentRate !== undefined
    ? Number((currentRate - previousRate).toFixed(4))
    : undefined;
  const shareDelta = previousShares !== undefined && currentShares !== undefined
    ? currentShares - previousShares
    : undefined;

  return {
    reporter,
    reason,
    obligationDate,
    previousShares,
    currentShares,
    shareDelta,
    previousRate,
    currentRate,
    rateDelta,
  };
}

async function getDartViewerDocumentText(receiptNo: string): Promise<string | undefined> {
  const mainUrl = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`;
  const mainResponse = await fetch(mainUrl, {
    headers: { "user-agent": "leeandnote-convex-dart-monitor/1.0" },
  });
  if (!mainResponse.ok) return undefined;
  const mainHtml = await mainResponse.text();
  const matches = [...mainHtml.matchAll(/viewDoc\([`'"](\d+)[`'"],\s*[`'"](\d+)[`'"],\s*[`'"]([^`'"]*)[`'"],\s*[`'"]([^`'"]*)[`'"],\s*[`'"]([^`'"]*)[`'"],\s*[`'"]([^`'"]*)[`'"]/g)];
  const docs = new Map<string, RegExpMatchArray>();
  for (const match of matches) {
    const key = `${match[1]}:${match[2]}:${match[3]}:${match[4]}:${match[5]}:${match[6]}`;
    docs.set(key, match);
  }
  if (docs.size === 0) return undefined;

  const texts: string[] = [];
  for (const match of [...docs.values()].slice(0, 20)) {
    const [, rcpNo, dcmNo, eleId, offset, length, dtd] = match;
    const viewerUrl = dartRequestUrl("https://dart.fss.or.kr/report/viewer.do", "/dart/report/viewer.do");
    viewerUrl.searchParams.set("rcpNo", rcpNo);
    viewerUrl.searchParams.set("dcmNo", dcmNo);
    viewerUrl.searchParams.set("eleId", eleId);
    viewerUrl.searchParams.set("offset", offset);
    viewerUrl.searchParams.set("length", length);
    viewerUrl.searchParams.set("dtd", dtd);
    const viewerResponse = await fetch(viewerUrl, { headers: dartRequestHeaders() });
    if (viewerResponse.ok) texts.push(await viewerResponse.text());
  }
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function dartRequestUrl(directUrl: string, proxyPath: string): URL {
  const proxyBase = process.env.DART_PROXY_BASE_URL?.replace(/\/$/, "");
  return new URL(proxyBase ? `${proxyBase}${proxyPath}` : directUrl);
}

function dartRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "user-agent": "leeandnote-convex-dart-monitor/1.0" };
  if (process.env.DART_PROXY_SECRET) headers["x-dart-proxy-secret"] = process.env.DART_PROXY_SECRET;
  return headers;
}

async function getDartDocumentText(apiKey: string, receiptNo: string): Promise<string | undefined> {
  const url = dartRequestUrl("https://opendart.fss.or.kr/api/document.xml", "/opendart/api/document.xml");
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("rcept_no", receiptNo);
  const response = await fetch(url, { headers: dartRequestHeaders() });
  if (!response.ok) {
    console.warn(`OpenDART document HTTP ${response.status}: ${receiptNo}`);
    return undefined;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    const files = unzipSync(bytes);
    const first = Object.values(files)[0];
    return first ? decodeDartBytes(first) : undefined;
  } catch (error) {
    console.warn(`Failed to unzip DART document ${receiptNo}; trying raw XML text:`, error);
    let rawText = "";
    try {
      rawText = new TextDecoder("utf-8").decode(bytes);
    } catch {
      try {
        rawText = new TextDecoder("euc-kr").decode(bytes);
      } catch {
        rawText = strFromU8(bytes);
      }
    }
    if (rawText.includes("파일이 존재하지 않습니다") || rawText.includes("<status>014</status>")) {
      return await getDartViewerDocumentText(receiptNo);
    }
    return rawText;
  }
}

async function extractBuyTradeInfo(apiKey: string, receiptNo: string, documentText?: string): Promise<BuyTradeInfo> {
  const fallback: BuyTradeInfo = {
    rows: 0,
    priceLabel: "N/A (담보/상속 등)",
    typeLabel: "N/A",
  };
  const text = documentText ?? await getDartDocumentText(apiKey, receiptNo);
  if (!text || !text.includes("취득/처분단가")) return fallback;

  let totalValue = 0;
  let totalShares = 0;
  let rows = 0;
  const methodLabels = new Set<string>();
  for (const match of text.matchAll(/<TR\b[^>]*>.*?<\/TR>/gis)) {
    const rowXml = match[0];
    if (!rowXml.includes("MDF_SDK_CNT") || !rowXml.includes("HLD_UNT_PR")) continue;

    const method = xmlCell(rowXml, "HLD_MTH");
    const remark = xmlCell(rowXml, "RMK");
    const methodText = `${method} ${remark}`;
    const isSimpleBuy = /장내\s*매수|장내매수|장외\s*매수|장외매수/.test(methodText);
    const isExcluded = /담보|질권|상속|증여|수증|대여|차입|반환|전환|소각|합병|분할|주요계약/.test(methodText);
    if (!isSimpleBuy || isExcluded) continue;

    const shareDelta = toNumber(xmlCell(rowXml, "MDF_SDK_CNT"));
    const unitPrice = toNumber(xmlCell(rowXml, "HLD_UNT_PRJ")) ?? toNumber(xmlCell(rowXml, "HLD_UNT_PRG"));
    if (shareDelta === undefined || unitPrice === undefined || shareDelta <= 0 || unitPrice <= 0) continue;

    totalShares += shareDelta;
    totalValue += shareDelta * unitPrice;
    rows += 1;
    if (/장내\s*매수|장내매수/.test(methodText)) methodLabels.add("장내매수");
    if (/장외\s*매수|장외매수/.test(methodText)) methodLabels.add("장외매수");
  }

  if (rows <= 0 || totalShares <= 0 || totalValue <= 0) return fallback;
  return {
    unitPrice: Math.round(totalValue / totalShares),
    tradeValue: Math.round(totalValue),
    shares: Math.round(totalShares),
    rows,
    priceLabel: `${formatWon(totalValue / totalShares)} (총 ${formatEok(totalValue)})`,
    typeLabel: [...methodLabels].join("/") || "장내/장외매수",
  };
}

async function applyEventCloseFallback(row: AlertRow, summary: DocumentSummaryInfo, buyTrade: BuyTradeInfo): Promise<BuyTradeInfo & {
  eventClose?: number;
  eventCloseDate?: string;
  priceSource?: string;
}> {
  const eventClose = await fetchEventClose(row.stockCode, row.market, summary.obligationDate ?? row.receiptDate);

  if (buyTrade.rows > 0 && buyTrade.unitPrice !== undefined && buyTrade.tradeValue !== undefined) {
    return {
      ...buyTrade,
      eventClose: eventClose?.close,
      eventCloseDate: eventClose?.date,
      priceSource: "dart-transaction-unit-price",
    };
  }

  const shareDelta = summary.shareDelta;
  if (shareDelta === undefined || shareDelta === 0) {
    return {
      ...buyTrade,
      eventClose: eventClose?.close,
      eventCloseDate: eventClose?.date,
      priceSource: eventClose ? "obligation-date-close-only" : "none",
    };
  }

  const reasonText = String(summary.reason ?? row.reason ?? "");
  const neutralOwnership = /담보|질권|계약변경|주식담보|대여|차입|반환|공동보유|특별관계/.test(reasonText) && !/장내매수|장외매수|매수|취득|장내매도|장외매도|매도|처분/.test(reasonText);
  const rateUnchanged = summary.rateDelta !== undefined && Math.abs(summary.rateDelta) < 0.005;
  const tradeLike = /장내매수|장외매수|매수|취득|장내매도|장외매도|매도|처분/.test(reasonText);
  if ((neutralOwnership && rateUnchanged) || !tradeLike) {
    return {
      ...buyTrade,
      eventClose: eventClose?.close,
      eventCloseDate: eventClose?.date,
      priceSource: eventClose ? "obligation-date-close-only" : "none",
    };
  }

  if (!eventClose) {
    return { ...buyTrade, priceSource: "none" };
  }

  const tradeValue = Math.round(eventClose.close * shareDelta);
  return {
    unitPrice: eventClose.close,
    tradeValue,
    shares: Math.abs(Math.round(shareDelta)),
    rows: 0,
    priceLabel: `보고의무발생일 종가 ${formatWon(eventClose.close)} 기준 (${formatSignedEok(tradeValue)})`,
    typeLabel: "종가추정",
    eventClose: eventClose.close,
    eventCloseDate: eventClose.date,
    priceSource: "obligation-date-close",
  };
}

async function dartGet(path: string, params: Record<string, string | number>) {
  const url = dartRequestUrl(`https://opendart.fss.or.kr/api/${path}`, `/opendart/api/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: dartRequestHeaders() });
  if (!response.ok) {
    throw new Error(`OpenDART HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.status !== "000" && body.status !== "013") {
    throw new Error(`OpenDART ${body.status}: ${body.message}`);
  }
  return body;
}

async function listMajorHoldingReports(apiKey: string, reportDate: string): Promise<DartListItem[]> {
  const all: DartListItem[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const body = await dartGet("list.json", {
      crtfc_key: apiKey,
      bgn_de: reportDate,
      end_de: reportDate,
      pblntf_ty: "D",
      page_no: page,
      page_count: 100,
    });
    if (body.status === "013") break;
    const items = (body.list ?? []) as DartListItem[];
    all.push(
      ...items.filter((item) => {
        const name = item.report_nm ?? "";
        return (
          (item.corp_cls === "Y" || item.corp_cls === "K") &&
          (name.includes("주식등의대량보유상황보고서(일반)") ||
            name.includes("주식등의대량보유상황보고서(약식)"))
        );
      }),
    );
    if (page >= Number(body.total_page ?? 1)) break;
  }
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.rcept_no ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


async function listExecutiveHoldingReports(apiKey: string, reportDate: string): Promise<DartListItem[]> {
  const all: DartListItem[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const body = await dartGet("list.json", {
      crtfc_key: apiKey,
      bgn_de: reportDate,
      end_de: reportDate,
      pblntf_ty: "D",
      page_no: page,
      page_count: 100,
    });
    if (body.status === "013") break;
    const items = (body.list ?? []) as DartListItem[];
    all.push(
      ...items.filter((item) => {
        const name = item.report_nm ?? "";
        return (
          (item.corp_cls === "Y" || item.corp_cls === "K") &&
          name.includes("임원") &&
          name.includes("주요주주") &&
          name.includes("소유상황보고서")
        );
      }),
    );
    if (page >= Number(body.total_page ?? 1)) break;
  }
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.rcept_no ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function listContractReports(apiKey: string, reportDate: string): Promise<DartListItem[]> {
  const all: DartListItem[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const body = await dartGet("list.json", {
      crtfc_key: apiKey,
      bgn_de: reportDate,
      end_de: reportDate,
      page_no: page,
      page_count: 100,
    });
    if (body.status === "013") break;
    const items = (body.list ?? []) as DartListItem[];
    all.push(
      ...items.filter((item) => {
        const name = item.report_nm ?? "";
        return (
          (item.corp_cls === "Y" || item.corp_cls === "K") &&
          /단일판매[ㆍ·]?공급계약체결/.test(name)
        );
      }),
    );
    if (page >= Number(body.total_page ?? 1)) break;
  }
  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.rcept_no ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueContractRows(rows: ContractAlertRow[]): ContractAlertRow[] {
  const seen = new Set<string>();
  const unique: ContractAlertRow[] = [];
  for (const row of rows) {
    const key = row.receiptNo || `${row.receiptDate}:${row.stockCode}:${row.amount ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function cleanContractValue(value?: string): string | undefined {
  const cleaned = value
    ?.replace(/\s+/g, " ")
    .replace(/^[:：\-]+/, "")
    .trim();
  return cleaned && cleaned !== "-" ? cleaned : undefined;
}

function normalizeContractCounterparty(value?: string): string | undefined {
  const cleaned = cleanContractValue(value);
  if (!cleaned) return undefined;
  if (/^(?:의\s*)?지정업체$/.test(cleaned) || /영업비밀|비공개|기밀/.test(cleaned)) {
    return "영업비밀 보호 비공개";
  }
  return cleaned;
}

function contractTextBetween(text: string, labels: string[], endLabels: string[], maxLength = 300): string | undefined {
  const plain = plainTextWithCellSpaces(text);
  for (const label of labels) {
    const index = plain.indexOf(label);
    if (index < 0) continue;
    const start = index + label.length;
    const rest = plain.slice(start, start + maxLength);
    let end = rest.length;
    for (const endLabel of endLabels) {
      const candidate = rest.indexOf(endLabel);
      if (candidate >= 0 && candidate < end) end = candidate;
    }
    const value = cleanContractValue(rest.slice(0, end));
    if (value) return value;
  }
  return undefined;
}

function contractNumberAfterLabels(text: string, labels: string[]): number | undefined {
  const plain = plainTextWithCellSpaces(text);
  for (const label of labels) {
    const index = plain.indexOf(label);
    if (index < 0) continue;
    const segment = plain.slice(index + label.length, index + label.length + 180);
    const parsed = toNumber(segment);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function contractDateAfter(text: string, label: string): string | undefined {
  const plain = plainTextWithCellSpaces(text);
  const pattern = new RegExp(`${label}\\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})`);
  return cleanContractValue(plain.match(pattern)?.[1]);
}


function contractTableValue(rows: string[][], labels: string[]): string | undefined {
  const normalizedLabels = labels.map((label) => normalizeText(label));
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    const cellIndex = cells.findIndex((cell) => {
      const normalized = normalizeText(cell);
      return normalizedLabels.some((label) => normalized.includes(label));
    });
    if (cellIndex < 0) continue;

    for (const cell of cells.slice(cellIndex + 1)) {
      const value = cleanContractValue(cell);
      if (value && !normalizedLabels.some((label) => normalizeText(value).includes(label))) return value;
    }

    for (const nextCells of rows.slice(rowIndex + 1, rowIndex + 6)) {
      const value = cleanContractValue(nextCells[cellIndex]);
      if (value && !normalizedLabels.some((label) => normalizeText(value).includes(label))) return value;
    }
  }
  return undefined;
}

function saneContractAmount(value?: number): number | undefined {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) >= 1000000 ? value : undefined;
}

function saneContractRatio(value?: number): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 10000 ? value : undefined;
}

function contractNumberFromTable(rows: string[][], labels: string[]): number | undefined {
  return toNumber(contractTableValue(rows, labels));
}
function extractContractInfo(text?: string): Partial<ContractAlertRow> {
  if (!text) return {};
  const rows = [...text.matchAll(/<TR\b[^>]*>.*?<\/TR>/gis)].map((match) => xmlCells(match[0]));
  let amount = saneContractAmount(
    contractNumberFromTable(rows, ["계약금액", "계약 금액", "총 계약금액"]) ??
      contractNumberAfterLabels(text, ["계약금액", "계약 금액", "총 계약금액"]),
  );
  const recentSales = saneContractAmount(
    contractNumberFromTable(rows, ["최근매출액", "최근 매출액"]) ??
      contractNumberAfterLabels(text, ["최근매출액", "최근 매출액"]),
  );
  let salesRatio = saneContractRatio(
    contractNumberFromTable(rows, ["매출액대비", "매출액 대비", "최근매출액대비", "최근 매출액 대비"]) ??
      contractNumberAfterLabels(text, ["매출액대비", "매출액 대비", "최근매출액대비", "최근 매출액 대비"]),
  );
  if (amount === undefined && recentSales !== undefined && salesRatio !== undefined && salesRatio > 0) {
    amount = saneContractAmount(Math.round(recentSales * (salesRatio / 100)));
  }
  if (salesRatio === undefined && amount !== undefined && recentSales !== undefined && recentSales !== 0) {
    salesRatio = saneContractRatio(Math.round((amount / recentSales) * 1000) / 10);
  }
  const counterparty = normalizeContractCounterparty(
    extractRowValue(rows, "계약상대방") ??
      contractTextBetween(text, ["계약상대방", "계약상대"], ["- 최근", "- 주요사업", "- 회사와", "판매ㆍ공급지역", "판매·공급지역", "계약기간"], 260),
  );
  const content =
    cleanContractValue(extractRowValue(rows, "판매ㆍ공급계약 내용")) ??
    cleanContractValue(extractRowValue(rows, "판매·공급계약 내용")) ??
    contractTextBetween(text, ["판매ㆍ공급계약 내용", "판매·공급계약 내용", "체결계약명", "계약명"], ["2. 계약내역", "2. 계약 내용", "계약내역", "계약금액", "조건부 계약여부"], 360);
  const startDate = contractDateAfter(text, "시작일") ?? contractDateAfter(text, "계약기간\\s*시작일");
  const endDate = contractDateAfter(text, "종료일");
  return {
    amount,
    salesRatio,
    counterparty: counterparty || "영업비밀 보호 비공개",
    content,
    startDate,
    endDate,
  };
}

async function enrichContract(apiKey: string, row: ContractAlertRow): Promise<ContractAlertRow> {
  try {
    const documentText = await getDartDocumentText(apiKey, row.receiptNo);
    return { ...row, ...extractContractInfo(documentText) };
  } catch (error) {
    console.warn(`Failed to enrich contract ${row.receiptNo}:`, error);
    return row;
  }
}

function formatContractEok(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "확인불가";
  if (value >= 100000000) return `${Math.round(value / 100000000).toLocaleString("ko-KR")}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatContractRatio(value?: number): string {
  return value === undefined || !Number.isFinite(value) ? "확인불가" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function buildContractMessage(rows: ContractAlertRow[], _reportDate: string): string {
  const uniqueRows = uniqueContractRows(rows).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const lines: string[] = [];
  const timestamp = escapeHtml(nowKstText());
  const titleName = uniqueRows.length > 1 ? `${uniqueRows[0]?.corpName ?? "공시"}등` : uniqueRows[0]?.corpName ?? "공시";

  lines.push(`<b>[대형수주보고공시 - ${escapeHtml(titleName)}]</b>`);
  lines.push(timestamp);
  lines.push("");

  uniqueRows.forEach((row) => {
    if (uniqueRows.length > 1) lines.push(`<b>${escapeHtml(row.corpName)}</b>`);
    lines.push(`<b>계약금액:</b> ${escapeHtml(formatContractEok(row.amount))}`);
    lines.push(`<b>매출액 대비:</b> ${escapeHtml(formatContractRatio(row.salesRatio))}`);
    lines.push(`<b>계약상대방:</b> ${escapeHtml(row.counterparty || "영업비밀 보호 비공개")}`);
    lines.push(`<b>계약기간:</b> ${escapeHtml(`${formatDate(row.startDate)} ~ ${formatDate(row.endDate)}`)}`);
    lines.push(`<b>내용:</b> ${escapeHtml(row.content || row.reportName)}`);
    lines.push(`${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)} · <a href="${row.url}">원문 보기</a>`);
    lines.push("");
  });

  return normalizeMessageHtml(lines.join("\n"));
}
async function listDisclosureReports(apiKey: string, reportDate: string, pblntfTy?: string): Promise<DartListItem[]> {
  const all: DartListItem[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const params: Record<string, string | number> = {
      crtfc_key: apiKey,
      bgn_de: reportDate,
      end_de: reportDate,
      page_no: page,
      page_count: 100,
    };
    if (pblntfTy) params.pblntf_ty = pblntfTy;
    const body = await dartGet("list.json", params);
    if (body.status === "013") break;
    const items = (body.list ?? []) as DartListItem[];
    all.push(...items);
    if (page >= Number(body.total_page ?? 1)) break;
  }
  return all;
}

async function enrichMajorStock(apiKey: string, row: AlertRow): Promise<AlertRow> {
  const documentText = await getDartDocumentText(apiKey, row.receiptNo);
  const rawBuyTrade = await extractBuyTradeInfo(apiKey, row.receiptNo, documentText);
  const summary = extractDocumentSummaryInfo(documentText);
  const buyTrade = await applyEventCloseFallback(row, summary, rawBuyTrade);
  try {
    const body = await dartGet("majorstock.json", {
      crtfc_key: apiKey,
      corp_code: row.corpCode,
      bsns_year: new Date().getFullYear(),
      reprt_code: "11011",
    });
    const item = ((body.list ?? []) as MajorStockItem[]).find((candidate) => candidate.rcept_no === row.receiptNo);
    if (!item) {
      return {
        ...row,
        reporter: summary.reporter ?? row.reporter,
        previousShares: summary.previousShares ?? row.previousShares,
        currentShares: summary.currentShares ?? row.currentShares,
        shareDelta: summary.shareDelta ?? row.shareDelta,
        previousRate: summary.previousRate ?? row.previousRate,
        currentRate: summary.currentRate ?? row.currentRate,
        rateDelta: summary.rateDelta ?? row.rateDelta,
        reason: summary.reason ?? row.reason,
        obligationDate: summary.obligationDate ?? row.obligationDate,
        buyUnitPrice: buyTrade.unitPrice,
        buyTradeValue: buyTrade.tradeValue,
        buyShares: buyTrade.shares,
        buyTradeRows: buyTrade.rows,
        buyPriceLabel: buyTrade.priceLabel,
        buyTypeLabel: buyTrade.typeLabel,
        eventClose: buyTrade.eventClose,
        eventCloseDate: buyTrade.eventCloseDate,
        priceSource: buyTrade.priceSource,
      };
    }
    const current = toNumber(item.stkrt);
    const delta = toNumber(item.stkrt_irds);
    return {
      ...row,
      reporter: item.repror ?? summary.reporter,
      previousShares: summary.previousShares ?? row.previousShares,
      currentShares: summary.currentShares ?? row.currentShares,
      shareDelta: summary.shareDelta ?? row.shareDelta,
      currentRate: current ?? summary.currentRate,
      previousRate: current !== undefined && delta !== undefined ? Number((current - delta).toFixed(4)) : summary.previousRate,
      rateDelta: delta ?? summary.rateDelta,
      reason: item.report_resn ?? summary.reason,
      obligationDate: item.report_ostn ?? item.report_de ?? item.report_dt ?? summary.obligationDate ?? row.receiptDate,
      buyUnitPrice: buyTrade.unitPrice,
      buyTradeValue: buyTrade.tradeValue,
      buyShares: buyTrade.shares,
      buyTradeRows: buyTrade.rows,
      buyPriceLabel: buyTrade.priceLabel,
      buyTypeLabel: buyTrade.typeLabel,
      eventClose: buyTrade.eventClose,
      eventCloseDate: buyTrade.eventCloseDate,
      priceSource: buyTrade.priceSource,
    };
  } catch (error) {
    console.warn(`Failed to enrich ${row.receiptNo}:`, error);
    return {
      ...row,
      reporter: summary.reporter ?? row.reporter,
      previousShares: summary.previousShares ?? row.previousShares,
      currentShares: summary.currentShares ?? row.currentShares,
      shareDelta: summary.shareDelta ?? row.shareDelta,
      previousRate: summary.previousRate ?? row.previousRate,
      currentRate: summary.currentRate ?? row.currentRate,
      rateDelta: summary.rateDelta ?? row.rateDelta,
      reason: summary.reason ?? row.reason,
      obligationDate: summary.obligationDate ?? row.obligationDate,
      buyUnitPrice: buyTrade.unitPrice,
      buyTradeValue: buyTrade.tradeValue,
      buyShares: buyTrade.shares,
      buyTradeRows: buyTrade.rows,
      buyPriceLabel: buyTrade.priceLabel,
      buyTypeLabel: buyTrade.typeLabel,
      eventClose: buyTrade.eventClose,
      eventCloseDate: buyTrade.eventCloseDate,
      priceSource: buyTrade.priceSource,
    };
  }
}

function normalizeReasonText(reason: string): string {
  return reason
    .replace(/(^|\n)\s*\d+\.\s*/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeMessageHtml(message: string): string {
  return message
    .replace(/(^|\n)(\s*(?:<(?:b|strong)>\s*)?)\d+\.\s*/g, "$1$2")
    .trim();
}

function uniqueAlertRows(rows: AlertRow[]): AlertRow[] {
  const seen = new Set<string>();
  const unique: AlertRow[] = [];
  for (const row of rows) {
    const key = row.receiptNo || `${row.receiptDate}:${row.stockCode}:${row.corpName}:${row.reporter ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}


function displayReporterName(value?: string): string {
  const text = (value ?? "보고자 확인중").trim();
  return text.length > 22 ? `${text.slice(0, 20)}...` : text;
}

function messageReporterKind(reporter: string, reason: string): string {
  const kind = reporterType(reporter, reason);
  return kind === "외국계" ? "외국법인" : kind;
}
function buildMessage(rows: AlertRow[], _reportDate: string): string {
  const uniqueRows = uniqueAlertRows(rows);
  const lines: string[] = [];
  const timestamp = escapeHtml(nowKstText());
  const titleName = uniqueRows.length > 1 ? `${uniqueRows[0]?.corpName ?? "공시"}등` : uniqueRows[0]?.corpName ?? "공시";

  lines.push(`<b>[5%보고공시 - ${escapeHtml(titleName)}]</b>`);
  lines.push(timestamp);
  lines.push("");

  uniqueRows.forEach((row) => {
    const reporter = row.reporter ?? "보고자 확인중";
    const reason = normalizeReasonText(row.reason ?? row.reportName);
    const kind = messageReporterKind(reporter, reason);
    if (uniqueRows.length > 1) lines.push(`<b>${escapeHtml(row.corpName)}</b>`);
    lines.push(`<b>보고자:</b> ${escapeHtml(displayReporterName(reporter))}/${escapeHtml(kind)}`);
    lines.push(formatOwnershipChange(row));
    lines.push(`<b>보고사유:</b> ${escapeHtml(reason)}`);
    lines.push(`<b>보고의무발생일:</b> ${escapeHtml(formatDate(row.obligationDate ?? row.receiptDate))}`);
    lines.push(`${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)} · <a href="${row.url}">원문 보기</a>`);
    lines.push("");
  });

  return normalizeMessageHtml(lines.join("\n"));
}


function uniqueExecutiveRows(rows: ExecutiveAlertRow[]): ExecutiveAlertRow[] {
  const seen = new Set<string>();
  const unique: ExecutiveAlertRow[] = [];
  for (const row of rows) {
    const key = row.receiptNo || `${row.receiptDate}:${row.stockCode}:${row.corpName}:${row.reporter ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

async function enrichExecutiveStock(apiKey: string, row: ExecutiveAlertRow): Promise<ExecutiveAlertRow> {
  let summary: DocumentSummaryInfo = {};
  try {
    const documentText = await getDartDocumentText(apiKey, row.receiptNo);
    summary = extractDocumentSummaryInfo(documentText);
  } catch (error) {
    console.warn(`Failed to read executive document ${row.receiptNo}:`, error);
  }

  let apiItem: ExecutiveStockItem | undefined;
  try {
    const body = await dartGet("elestock.json", {
      crtfc_key: apiKey,
      corp_code: row.corpCode,
    });
    apiItem = ((body.list ?? []) as ExecutiveStockItem[]).find((candidate) => candidate.rcept_no === row.receiptNo);
  } catch (error) {
    console.warn(`Failed to enrich executive ${row.receiptNo}:`, error);
  }

  const apiCurrentShares = toNumber(apiItem?.sp_stock_lmp_cnt);
  const apiShareDelta = toNumber(apiItem?.sp_stock_lmp_irds_cnt);
  const apiCurrentRate = toNumber(apiItem?.sp_stock_lmp_rate);
  const apiRateDelta = toNumber(apiItem?.sp_stock_lmp_irds_rate);
  const preferSummaryShares =
    summary.currentShares !== undefined &&
    (apiCurrentShares === undefined || (apiCurrentShares === 0 && summary.currentShares !== 0));
  const preferSummaryRate =
    summary.currentRate !== undefined &&
    (apiCurrentRate === undefined || (apiCurrentRate === 0 && summary.currentRate !== 0));

  const currentShares = preferSummaryShares ? summary.currentShares : apiCurrentShares ?? summary.currentShares;
  const shareDelta =
    summary.shareDelta !== undefined && (apiShareDelta === undefined || (apiShareDelta === 0 && summary.shareDelta !== 0))
      ? summary.shareDelta
      : apiShareDelta ?? summary.shareDelta;
  const previousShares =
    summary.previousShares !== undefined && preferSummaryShares
      ? summary.previousShares
      : currentShares !== undefined && shareDelta !== undefined
        ? currentShares - shareDelta
        : summary.previousShares;
  const currentRate = preferSummaryRate ? summary.currentRate : apiCurrentRate ?? summary.currentRate ?? row.currentRate;
  const rateDelta =
    summary.rateDelta !== undefined && (apiRateDelta === undefined || (apiRateDelta === 0 && summary.rateDelta !== 0))
      ? summary.rateDelta
      : apiRateDelta ?? summary.rateDelta ?? row.rateDelta;
  const previousRate =
    summary.previousRate !== undefined && preferSummaryRate
      ? summary.previousRate
      : currentRate !== undefined && rateDelta !== undefined
        ? Number((currentRate - rateDelta).toFixed(4))
        : summary.previousRate ?? row.previousRate;
  const obligationDate = summary.obligationDate ?? row.obligationDate ?? row.receiptDate;
  const eventClose = await fetchEventClose(row.stockCode, row.market, obligationDate);
  const tradeValue = eventClose && shareDelta !== undefined ? Math.round(eventClose.close * shareDelta) : undefined;
  const tradeShares = shareDelta !== undefined ? Math.abs(Math.round(shareDelta)) : undefined;
  const tradeTypeLabel = shareDelta === undefined || shareDelta === 0 ? "변동 없음" : shareDelta > 0 ? "보유 증가" : "보유 감소";

  return {
    ...row,
    reporter: apiItem?.repror ?? summary.reporter ?? row.reporter,
    executiveRegistration: apiItem?.isu_exctv_rgist_at ?? row.executiveRegistration,
    executiveRole: apiItem?.isu_exctv_ofcps ?? row.executiveRole,
    mainShareholder: apiItem?.isu_main_shrholdr ?? row.mainShareholder,
    previousShares,
    currentShares,
    shareDelta,
    previousRate,
    currentRate,
    rateDelta,
    reason: row.reason ?? "임원·주요주주 소유상황 변동",
    obligationDate,
    tradeUnitPrice: eventClose?.close,
    tradeValue,
    tradeShares,
    tradeTypeLabel,
    eventClose: eventClose?.close,
    eventCloseDate: eventClose?.date,
    priceSource: eventClose ? "obligation-date-close" : "none",
  };
}

function executiveReporterType(row: ExecutiveAlertRow): string {
  const reporter = row.reporter ?? "";
  const classified = messageReporterKind(reporter, row.reason ?? "");
  if (classified === "외국법인") return classified;
  const bits = [row.executiveRole, row.mainShareholder, row.executiveRegistration].filter((value) => value && value !== "-").join(" · ");
  return bits || classified;
}

function buildExecutiveMessage(rows: ExecutiveAlertRow[], _reportDate: string): string {
  const uniqueRows = uniqueExecutiveRows(rows).filter(hasOwnershipMetric);
  const lines: string[] = [];
  const timestamp = escapeHtml(nowKstText());
  const titleName = uniqueRows.length > 1 ? `${uniqueRows[0]?.corpName ?? "공시"}등` : uniqueRows[0]?.corpName ?? "공시";

  lines.push(`<b>[임원보고공시 - ${escapeHtml(titleName)}]</b>`);
  lines.push(timestamp);
  lines.push("");

  uniqueRows.forEach((row) => {
    const reporter = row.reporter ?? "보고자 확인중";
    const kind = executiveReporterType(row);
    const reason = normalizeReasonText(row.reason ?? row.reportName);
    if (uniqueRows.length > 1) lines.push(`<b>${escapeHtml(row.corpName)}</b>`);
    lines.push(`<b>보고자:</b> ${escapeHtml(displayReporterName(reporter))}/${escapeHtml(kind)}`);
    lines.push(formatOwnershipChange(row));
    lines.push(`<b>보고사유:</b> ${escapeHtml(reason)}`);
    lines.push(`<b>보고의무발생일:</b> ${escapeHtml(formatDate(row.obligationDate ?? row.receiptDate))}`);
    lines.push(`${escapeHtml(row.stockCode)} · ${escapeHtml(row.market)} · <a href="${row.url}">원문 보기</a>`);
    lines.push("");
  });

  return normalizeMessageHtml(lines.join("\n"));
}

type PollArgs = {
  reportDate?: string | number;
  force?: boolean;
  limit?: number;
};

async function pollMajorHoldingsHandler(ctx: any, args: PollArgs): Promise<any> {
  if (!args.force && !isKstMonitorWindow()) {
    return { skipped: "outside KST monitor window", found: 0, enqueued: 0 };
  }

  const apiKey = env("DART_API_KEY");
  const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
  const reports = await listMajorHoldingReports(apiKey, reportDate);
  if (reports.length === 0) return { found: 0, enqueued: 0 };

  const candidates = uniqueAlertRows(reports.map((item) => ({
      receiptNo: item.rcept_no ?? "",
      receiptDate: item.rcept_dt ?? reportDate,
      corpCode: item.corp_code ?? "",
      stockCode: item.stock_code ?? "",
      corpName: item.corp_name ?? "",
      market: marketName(item.corp_cls),
      reportName: item.report_nm ?? "",
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
    })).filter((item) => item.receiptNo && item.corpCode) as AlertRow[]);

  const enrichedRows = (await Promise.all(
    candidates.slice(0, Math.max(args.limit ?? 20, 50)).map((row: AlertRow) => enrichMajorStock(apiKey, row)),
  )) as AlertRow[];
  const sendableRows = uniqueAlertRows(enrichedRows).filter(hasOwnershipMetric);
  if (sendableRows.length === 0) {
    return { found: reports.length, enqueued: 0, skippedMissingOwnership: enrichedRows.length };
  }

  await ctx.runMutation(internal.dart.upsertDailyReportItems, { reportDate, rows: sendableRows });

  const unseen: AlertRow[] = await ctx.runMutation(internal.dart.filterAndRecordDisclosures, {
    force: args.force ?? false,
    rows: sendableRows.map((row) => ({
      receiptNo: row.receiptNo,
      receiptDate: row.receiptDate,
      corpCode: row.corpCode,
      stockCode: row.stockCode,
      corpName: row.corpName,
      market: row.market,
      reportName: row.reportName,
      url: row.url,
    })),
  });
  const unseenReceiptNos = new Set(unseen.map((row: AlertRow) => row.receiptNo));
  const rows = sendableRows.filter((row: AlertRow) => unseenReceiptNos.has(row.receiptNo)).slice(0, args.limit ?? 20);
  if (rows.length === 0) return { found: reports.length, enqueued: 0 };

  const message = buildMessage(rows, reportDate);
  const receiptKey = [...new Set(rows.map((row) => row.receiptNo))].sort().join(",");
  const id = await ctx.runMutation(internal.dart.createTelegramNotification, {
    dedupeKey: `dart-holdings-convex-cron:${reportDate}:${receiptKey}`,
    reportDate,
    messageHtml: message,
    receiptNos: rows.map((row) => row.receiptNo),
  });
  await ctx.runMutation(internal.dart.upsertDailyReportItems, { reportDate, rows });
  await ctx.scheduler.runAfter(0, sendPendingRef, { id });
  return { found: reports.length, enqueued: rows.length };
}

export const pollMajorHoldings = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollMajorHoldingsHandler(ctx, args);
  },
});

export const pollMajorHoldingsCron = internalAction({
  args: {},
  handler: async (ctx) => {
    return await pollMajorHoldingsHandler(ctx, {});
  },
});

export const pollMajorHoldingsInternal = internalAction({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollMajorHoldingsHandler(ctx, args);
  },
});

async function backfillDailyReportItemsHandler(ctx: any, args: {
  reportDate?: string | number;
  limit?: number;
}) {
  const apiKey = env("DART_API_KEY");
  const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
  const reports = await listMajorHoldingReports(apiKey, reportDate);
  const rows = (await Promise.all(
    reports.slice(0, args.limit ?? 100).map((item) => enrichMajorStock(apiKey, {
      receiptNo: item.rcept_no ?? "",
      receiptDate: item.rcept_dt ?? reportDate,
      corpCode: item.corp_code ?? "",
      stockCode: item.stock_code ?? "",
      corpName: item.corp_name ?? "",
      market: marketName(item.corp_cls),
      reportName: item.report_nm ?? "",
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
    })),
  )) as AlertRow[];
  const cleanRows = uniqueAlertRows(rows).filter((row) => row.receiptNo && row.corpCode);
  if (cleanRows.length > 0) {
    await ctx.runMutation(internal.dart.upsertDailyReportItems, { reportDate, rows: cleanRows });
  }
  return { reportDate, found: reports.length, upserted: cleanRows.length };
}

export const backfillDailyReportItems = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await backfillDailyReportItemsHandler(ctx, args);
  },
});

export const backfillDailyReportItemsInternal = internalAction({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await backfillDailyReportItemsHandler(ctx, args);
  },
});

export const checkDart = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
  },
  handler: async (_ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
    const reports = await listMajorHoldingReports(apiKey, reportDate);
    return {
      ok: true,
      reportDate,
      majorHoldingReports: reports.length,
      sample: reports.slice(0, 3).map((item) => ({
        receiptNo: item.rcept_no,
        corpName: item.corp_name,
        stockCode: item.stock_code,
        reportName: item.report_nm,
      })),
    };
  },
});

export const debugDartList = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
  },
  handler: async (_ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
    const byD = await listDisclosureReports(apiKey, reportDate, "D");
    const all = await listDisclosureReports(apiKey, reportDate);
    const pick = (items: DartListItem[]) => items
      .filter((item) => {
        const name = item.report_nm ?? "";
        return name.includes("대량보유") || name.includes("주요주주") || name.includes("특정증권") || name.includes("5%");
      })
      .slice(0, 20)
      .map((item) => ({
        receiptNo: item.rcept_no,
        receiptDate: item.rcept_dt,
        corpName: item.corp_name,
        stockCode: item.stock_code,
        corpClass: item.corp_cls,
        reportName: item.report_nm,
      }));
    return {
      reportDate,
      pblntfDTotal: byD.length,
      allTotal: all.length,
      pblntfDMatches: pick(byD),
      allMatches: pick(all),
    };
  },
});

export const previewMajorHoldingsMessage = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
    const reports = await listMajorHoldingReports(apiKey, reportDate);
    const rows = uniqueAlertRows((await Promise.all(
      reports.slice(0, args.limit ?? 3).map((item) => enrichMajorStock(apiKey, {
        receiptNo: item.rcept_no ?? "",
        receiptDate: item.rcept_dt ?? reportDate,
        corpCode: item.corp_code ?? "",
        stockCode: item.stock_code ?? "",
        corpName: item.corp_name ?? "",
        market: marketName(item.corp_cls),
        reportName: item.report_nm ?? "",
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
      })),
    )) as AlertRow[]);
    return {
      reportDate,
      rows: rows.length,
      message: buildMessage(rows, reportDate),
    };
  },
});


async function pollExecutiveHoldingsHandler(ctx: any, args: PollArgs): Promise<any> {
  if (!args.force && !isKstMonitorWindow()) {
    return { skipped: "outside KST monitor window", found: 0, enqueued: 0 };
  }

  const apiKey = env("DART_API_KEY");
  const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
  const reports = await listExecutiveHoldingReports(apiKey, reportDate);
  if (reports.length === 0) return { found: 0, enqueued: 0 };

  const candidates = uniqueExecutiveRows(reports.map((item) => ({
      receiptNo: item.rcept_no ?? "",
      receiptDate: item.rcept_dt ?? reportDate,
      corpCode: item.corp_code ?? "",
      stockCode: item.stock_code ?? "",
      corpName: item.corp_name ?? "",
      market: marketName(item.corp_cls),
      reportName: item.report_nm ?? "",
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
    })).filter((item) => item.receiptNo && item.corpCode) as ExecutiveAlertRow[]);

  const enrichedRows = (await Promise.all(
    candidates.slice(0, Math.max(args.limit ?? 20, 50)).map((row: ExecutiveAlertRow) => enrichExecutiveStock(apiKey, row)),
  )) as ExecutiveAlertRow[];
  const sendableRows = uniqueExecutiveRows(enrichedRows).filter(hasOwnershipMetric);
  if (sendableRows.length === 0) {
    return { found: reports.length, enqueued: 0, skippedMissingOwnership: enrichedRows.length };
  }

  await ctx.runMutation(internal.dart.upsertExecutiveDailyReportItems, { reportDate, rows: sendableRows });

  const unseen: ExecutiveAlertRow[] = await ctx.runMutation(internal.dart.filterAndRecordExecutiveDisclosures, {
    force: args.force ?? false,
    rows: sendableRows.map((row) => ({
      receiptNo: row.receiptNo,
      receiptDate: row.receiptDate,
      corpCode: row.corpCode,
      stockCode: row.stockCode,
      corpName: row.corpName,
      market: row.market,
      reportName: row.reportName,
      url: row.url,
    })),
  });
  const unseenReceiptNos = new Set(unseen.map((row: ExecutiveAlertRow) => row.receiptNo));
  const rows = sendableRows.filter((row: AlertRow) => unseenReceiptNos.has(row.receiptNo)).slice(0, args.limit ?? 20);
  if (rows.length === 0) return { found: reports.length, enqueued: 0 };

  const message = buildExecutiveMessage(rows, reportDate);
  const receiptKey = [...new Set(rows.map((row) => row.receiptNo))].sort().join(",");
  const id = await ctx.runMutation(internal.dart.createTelegramNotification, {
    dedupeKey: `dart-executive-convex-cron:${reportDate}:${receiptKey}`,
    reportDate,
    messageHtml: message,
    receiptNos: rows.map((row) => row.receiptNo),
  });
  await ctx.runMutation(internal.dart.upsertExecutiveDailyReportItems, { reportDate, rows });
  await ctx.scheduler.runAfter(0, sendPendingRef, { id });
  return { found: reports.length, enqueued: rows.length };
}

export const pollExecutiveHoldings = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollExecutiveHoldingsHandler(ctx, args);
  },
});

export const pollExecutiveHoldingsInternal = internalAction({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollExecutiveHoldingsHandler(ctx, args);
  },
});
async function pollContractReportsHandler(ctx: any, args: PollArgs): Promise<any> {
  if (!args.force && !isKstMonitorWindow()) {
    return { skipped: "outside KST monitor window", found: 0, enqueued: 0 };
  }

  const apiKey = env("DART_API_KEY");
  const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
  if (reportDate < "20260902") {
    return { skipped: "contract alerts start from 2026-09-02", found: 0, enqueued: 0 };
  }

  const reports = await listContractReports(apiKey, reportDate);
  if (reports.length === 0) return { found: 0, enqueued: 0 };

  const candidates = uniqueContractRows(reports.map((item) => ({
    receiptNo: item.rcept_no ?? "",
    receiptDate: item.rcept_dt ?? reportDate,
    corpCode: item.corp_code ?? "",
    stockCode: item.stock_code ?? "",
    corpName: item.corp_name ?? "",
    market: marketName(item.corp_cls),
    reportName: item.report_nm ?? "",
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
    correction: /기재정정|정정/.test(item.report_nm ?? ""),
  })).filter((item) => item.receiptNo && item.corpCode && item.stockCode) as ContractAlertRow[]);

  const enrichedRows = uniqueContractRows((await Promise.all(
    candidates.slice(0, Math.max(args.limit ?? 20, 50)).map((row: ContractAlertRow) => enrichContract(apiKey, row)),
  )) as ContractAlertRow[]).filter((row) => row.amount !== undefined || row.salesRatio !== undefined);
  if (enrichedRows.length === 0) return { found: reports.length, enqueued: 0, skippedMissingContractFields: candidates.length };

  await ctx.runMutation(internal.dart.upsertContractDailyReportItems, {
    reportDate,
    rows: enrichedRows,
  });

  const unseen: AlertRow[] = await ctx.runMutation(internal.dart.filterAndRecordDisclosures, {
    force: args.force ?? false,
    rows: enrichedRows.map((row) => ({
      receiptNo: row.receiptNo,
      receiptDate: row.receiptDate,
      corpCode: row.corpCode,
      stockCode: row.stockCode,
      corpName: row.corpName,
      market: row.market,
      reportName: row.reportName,
      url: row.url,
    })),
  });
  const unseenReceiptNos = new Set(unseen.map((row: ContractAlertRow) => row.receiptNo));
  const rows = enrichedRows.filter((row: ContractAlertRow) => unseenReceiptNos.has(row.receiptNo)).sort((a: ContractAlertRow, b: ContractAlertRow) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, args.limit ?? 20);
  if (rows.length === 0) return { found: reports.length, enqueued: 0 };

  const receiptKey = [...new Set(rows.map((row) => row.receiptNo))].sort().join(",");
  const id = await ctx.runMutation(internal.dart.createTelegramNotification, {
    dedupeKey: `dart-contracts-convex-cron:${reportDate}:${receiptKey}`,
    reportDate,
    messageHtml: buildContractMessage(rows, reportDate),
    receiptNos: rows.map((row) => row.receiptNo),
  });
  await ctx.scheduler.runAfter(0, sendPendingRef, { id });
  return { found: reports.length, enqueued: rows.length };
}

export const pollContractReports = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollContractReportsHandler(ctx, args);
  },
});

export const pollContractReportsInternal = internalAction({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await pollContractReportsHandler(ctx, args);
  },
});

export const backfillContractDailyReportItems = action({
  args: {
    reportDate: v.union(v.string(), v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = String(args.reportDate).replace(/\D/g, "").slice(0, 8);
    const reports = await listContractReports(apiKey, reportDate);
    const candidates = uniqueContractRows(reports.map((item) => ({
      receiptNo: item.rcept_no ?? "",
      receiptDate: item.rcept_dt ?? reportDate,
      corpCode: item.corp_code ?? "",
      stockCode: item.stock_code ?? "",
      corpName: item.corp_name ?? "",
      market: marketName(item.corp_cls),
      reportName: item.report_nm ?? "",
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
      correction: /기재정정|정정/.test(item.report_nm ?? ""),
    })).filter((item) => item.receiptNo && item.corpCode && item.stockCode) as ContractAlertRow[]);
    const rows = uniqueContractRows((await Promise.all(
      candidates.slice(0, args.limit ?? 100).map((row) => enrichContract(apiKey, row)),
    )) as ContractAlertRow[]).filter((row) => row.amount !== undefined || row.salesRatio !== undefined);
    if (rows.length > 0) {
      await ctx.runMutation(internal.dart.upsertContractDailyReportItems, { reportDate, rows });
    }
    return {
      reportDate,
      found: reports.length,
      upserted: rows.length,
      counterparties: rows.filter((row) => row.counterparty).length,
    };
  },
});

export const upsertContractDailyReportItems = internalMutation({
  args: {
    reportDate: v.string(),
    rows: v.array(v.object({
      receiptNo: v.string(),
      receiptDate: v.string(),
      corpCode: v.string(),
      stockCode: v.string(),
      corpName: v.string(),
      market: v.string(),
      reportName: v.string(),
      url: v.string(),
      amount: v.optional(v.number()),
      salesRatio: v.optional(v.number()),
      counterparty: v.optional(v.string()),
      content: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      correction: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("contractDailyReportItems")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", row.receiptNo))
        .unique();
      const payload = {
        reportDate: args.reportDate,
        receiptNo: row.receiptNo,
        corpCode: row.corpCode,
        corpName: row.corpName,
        stockCode: row.stockCode,
        market: row.market,
        reportName: row.reportName,
        amount: row.amount,
        salesRatio: row.salesRatio,
        counterparty: row.counterparty,
        content: row.content,
        startDate: row.startDate,
        endDate: row.endDate,
        correction: row.correction ?? false,
        url: row.url,
      };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("contractDailyReportItems", { ...payload, createdAt: now });
    }
  },
});

export const previewContractReportsMessage = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
    const reports = await listContractReports(apiKey, reportDate);
    const rows = uniqueContractRows((await Promise.all(
      reports.slice(0, args.limit ?? 3).map((item) => enrichContract(apiKey, {
        receiptNo: item.rcept_no ?? "",
        receiptDate: item.rcept_dt ?? reportDate,
        corpCode: item.corp_code ?? "",
        stockCode: item.stock_code ?? "",
        corpName: item.corp_name ?? "",
        market: marketName(item.corp_cls),
        reportName: item.report_nm ?? "",
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
        correction: /기재정정|정정/.test(item.report_nm ?? ""),
      })),
    )) as ContractAlertRow[]);
    return { reportDate, rows: rows.length, message: buildContractMessage(rows, reportDate) };
  },
});

async function backfillExecutiveDailyReportItemsHandler(ctx: any, args: {
  reportDate?: string | number;
  limit?: number;
}) {
  const apiKey = env("DART_API_KEY");
  const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
  const reports = await listExecutiveHoldingReports(apiKey, reportDate);
  const rows = (await Promise.all(
    reports.slice(0, args.limit ?? 100).map((item) => enrichExecutiveStock(apiKey, {
      receiptNo: item.rcept_no ?? "",
      receiptDate: item.rcept_dt ?? reportDate,
      corpCode: item.corp_code ?? "",
      stockCode: item.stock_code ?? "",
      corpName: item.corp_name ?? "",
      market: marketName(item.corp_cls),
      reportName: item.report_nm ?? "",
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
    })),
  )) as ExecutiveAlertRow[];
  const cleanRows = uniqueExecutiveRows(rows).filter((row) => row.receiptNo && row.corpCode);
  if (cleanRows.length > 0) {
    await ctx.runMutation(internal.dart.upsertExecutiveDailyReportItems, { reportDate, rows: cleanRows });
  }
  return { reportDate, found: reports.length, upserted: cleanRows.length };
}

export const backfillExecutiveDailyReportItems = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await backfillExecutiveDailyReportItemsHandler(ctx, args);
  },
});

export const backfillExecutiveDailyReportItemsInternal = internalAction({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await backfillExecutiveDailyReportItemsHandler(ctx, args);
  },
});

export const previewExecutiveHoldingsMessage = action({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = env("DART_API_KEY");
    const reportDate = args.reportDate ? String(args.reportDate).replace(/\D/g, "").slice(0, 8) : ymdKst();
    const reports = await listExecutiveHoldingReports(apiKey, reportDate);
    const rows = uniqueExecutiveRows((await Promise.all(
      reports.slice(0, args.limit ?? 3).map((item) => enrichExecutiveStock(apiKey, {
        receiptNo: item.rcept_no ?? "",
        receiptDate: item.rcept_dt ?? reportDate,
        corpCode: item.corp_code ?? "",
        stockCode: item.stock_code ?? "",
        corpName: item.corp_name ?? "",
        market: marketName(item.corp_cls),
        reportName: item.report_nm ?? "",
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no ?? ""}`,
      })),
    )) as ExecutiveAlertRow[]);
    return {
      reportDate,
      rows: rows.length,
      message: buildExecutiveMessage(rows, reportDate),
    };
  },
});

export const filterAndRecordDisclosures = internalMutation({
  args: {
    force: v.boolean(),
    rows: v.array(v.object({
      receiptNo: v.string(),
      receiptDate: v.string(),
      corpCode: v.string(),
      stockCode: v.string(),
      corpName: v.string(),
      market: v.string(),
      reportName: v.string(),
      url: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const unseen = [];
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("dartDisclosures")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", row.receiptNo))
        .unique();
      if (!existing) {
        await ctx.db.insert("dartDisclosures", { ...row, createdAt: now });
        unseen.push(row);
      } else if (args.force) {
        unseen.push(row);
      }
    }
    return unseen;
  },
});

export const upsertDailyReportItems = internalMutation({
  args: {
    reportDate: v.string(),
    rows: v.array(v.object({
      receiptNo: v.string(),
      receiptDate: v.string(),
      corpCode: v.string(),
      stockCode: v.string(),
      corpName: v.string(),
      market: v.string(),
      reportName: v.string(),
      url: v.string(),
      reporter: v.optional(v.string()),
      previousRate: v.optional(v.number()),
      currentRate: v.optional(v.number()),
      rateDelta: v.optional(v.number()),
      previousShares: v.optional(v.number()),
      currentShares: v.optional(v.number()),
      shareDelta: v.optional(v.number()),
      reason: v.optional(v.string()),
      obligationDate: v.optional(v.string()),
      buyUnitPrice: v.optional(v.number()),
      buyTradeValue: v.optional(v.number()),
      buyShares: v.optional(v.number()),
      buyTradeRows: v.optional(v.number()),
      buyPriceLabel: v.optional(v.string()),
      buyTypeLabel: v.optional(v.string()),
      eventClose: v.optional(v.number()),
      eventCloseDate: v.optional(v.string()),
      priceSource: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const reporter = row.reporter ?? "보고자 확인중";
      const reason = normalizeReasonText(row.reason ?? row.reportName);
      const existing = await ctx.db
        .query("dailyReportItems")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", row.receiptNo))
        .unique();
      const payload = {
        reportDate: args.reportDate,
        receiptNo: row.receiptNo,
        corpName: row.corpName,
        stockCode: row.stockCode,
        market: row.market,
        reporter,
        reporterType: reporterType(reporter, reason),
        previousRate: row.previousRate,
        currentRate: row.currentRate,
        rateDelta: row.rateDelta,
        previousShares: row.previousShares,
        currentShares: row.currentShares,
        shareDelta: row.shareDelta,
        reason,
        obligationDate: row.obligationDate ?? row.receiptDate,
        buyUnitPrice: row.buyUnitPrice,
        buyTradeValue: row.buyTradeValue,
        buyShares: row.buyShares,
        buyTradeRows: row.buyTradeRows,
        buyPriceLabel: row.buyPriceLabel ?? "N/A (담보/상속 등)",
        buyTypeLabel: row.buyTypeLabel ?? "N/A",
        eventClose: row.eventClose,
        eventCloseDate: row.eventCloseDate,
        priceSource: row.priceSource,
        url: row.url,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("dailyReportItems", { ...payload, createdAt: now });
      }
    }
  },
});


export const filterAndRecordExecutiveDisclosures = internalMutation({
  args: {
    force: v.boolean(),
    rows: v.array(v.object({
      receiptNo: v.string(),
      receiptDate: v.string(),
      corpCode: v.string(),
      stockCode: v.string(),
      corpName: v.string(),
      market: v.string(),
      reportName: v.string(),
      url: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const unseen = [];
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("executiveDisclosures")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", row.receiptNo))
        .unique();
      if (!existing) {
        await ctx.db.insert("executiveDisclosures", { ...row, createdAt: now });
        unseen.push(row);
      } else if (args.force) {
        unseen.push(row);
      }
    }
    return unseen;
  },
});

export const upsertExecutiveDailyReportItems = internalMutation({
  args: {
    reportDate: v.string(),
    rows: v.array(v.object({
      receiptNo: v.string(),
      receiptDate: v.string(),
      corpCode: v.string(),
      stockCode: v.string(),
      corpName: v.string(),
      market: v.string(),
      reportName: v.string(),
      url: v.string(),
      reporter: v.optional(v.string()),
      executiveRegistration: v.optional(v.string()),
      executiveRole: v.optional(v.string()),
      mainShareholder: v.optional(v.string()),
      previousShares: v.optional(v.number()),
      currentShares: v.optional(v.number()),
      shareDelta: v.optional(v.number()),
      previousRate: v.optional(v.number()),
      currentRate: v.optional(v.number()),
      rateDelta: v.optional(v.number()),
      reason: v.optional(v.string()),
      obligationDate: v.optional(v.string()),
      tradeUnitPrice: v.optional(v.number()),
      tradeValue: v.optional(v.number()),
      tradeShares: v.optional(v.number()),
      tradeTypeLabel: v.optional(v.string()),
      eventClose: v.optional(v.number()),
      eventCloseDate: v.optional(v.string()),
      priceSource: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of uniqueExecutiveRows(args.rows as ExecutiveAlertRow[])) {
      const reporter = row.reporter ?? "보고자 확인중";
      const reason = normalizeReasonText(row.reason ?? row.reportName);
      const existing = await ctx.db
        .query("executiveDailyReportItems")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", row.receiptNo))
        .unique();
      const payload = {
        reportDate: args.reportDate,
        receiptNo: row.receiptNo,
        corpName: row.corpName,
        stockCode: row.stockCode,
        market: row.market,
        reporter,
        reporterType: executiveReporterType(row),
        executiveRegistration: row.executiveRegistration ?? "",
        executiveRole: row.executiveRole ?? "",
        mainShareholder: row.mainShareholder ?? "",
        previousShares: row.previousShares,
        currentShares: row.currentShares,
        shareDelta: row.shareDelta,
        previousRate: row.previousRate,
        currentRate: row.currentRate,
        rateDelta: row.rateDelta,
        reason,
        obligationDate: row.obligationDate ?? row.receiptDate,
        tradeUnitPrice: row.tradeUnitPrice,
        tradeValue: row.tradeValue,
        tradeShares: row.tradeShares,
        tradeTypeLabel: row.tradeTypeLabel ?? "N/A",
        eventClose: row.eventClose,
        eventCloseDate: row.eventCloseDate,
        priceSource: row.priceSource,
        url: row.url,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("executiveDailyReportItems", { ...payload, createdAt: now });
      }
    }
  },
});

export const createTelegramNotification = internalMutation({
  args: {
    dedupeKey: v.string(),
    reportDate: v.string(),
    messageHtml: v.string(),
    receiptNos: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("telegramNotifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    const messageHtml = normalizeMessageHtml(args.messageHtml);
    if (existing) {
      if (existing.status !== "sent" && existing.status !== "sending") {
        await ctx.db.patch(existing._id, { messageHtml, updatedAt: now });
      }
      return existing._id;
    }

    const id = await ctx.db.insert("telegramNotifications", {
      dedupeKey: args.dedupeKey,
      reportDate: args.reportDate,
      messageHtml,
      source: "convex-cron",
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    for (const receiptNo of args.receiptNos) {
      const disclosure = await ctx.db
        .query("dartDisclosures")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", receiptNo))
        .unique();
      if (disclosure) await ctx.db.patch(disclosure._id, { notifiedAt: now });

      const executiveDisclosure = await ctx.db
        .query("executiveDisclosures")
        .withIndex("by_receiptNo", (q) => q.eq("receiptNo", receiptNo))
        .unique();
      if (executiveDisclosure) await ctx.db.patch(executiveDisclosure._id, { notifiedAt: now });
    }
    return id;
  },
});

export const listRecentDisclosures = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("dartDisclosures").withIndex("by_receiptDate").order("desc").take(args.limit ?? 50);
  },
});

export const listDailyReportItems = query({
  args: {
    reportDate: v.union(v.string(), v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reportDate = String(args.reportDate).replace(/\D/g, "").slice(0, 8);
    return await ctx.db
      .query("dailyReportItems")
      .withIndex("by_reportDate", (q) => q.eq("reportDate", reportDate))
      .take(args.limit ?? 100);
  },
});

export const listDailyReportDates = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("dailyReportItems").withIndex("by_reportDate").order("desc").take(500);
    return [...new Set(rows.map((row) => row.reportDate))].sort().reverse();
  },
});

export const listDailyReportItemsRange = query({
  args: {
    bgnDe: v.optional(v.union(v.string(), v.number())),
    endDe: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bgnDe = String(args.bgnDe ?? "00000000").replace(/\D/g, "").slice(0, 8);
    const endDe = String(args.endDe ?? "99999999").replace(/\D/g, "").slice(0, 8);
    const takeLimit = Math.min(Math.max(args.limit ?? 3000, 1), 5000);
    const rows = await ctx.db.query("dailyReportItems").withIndex("by_reportDate").order("desc").take(takeLimit);
    return rows.filter((row) => row.reportDate >= bgnDe && row.reportDate <= endDe);
  },
});







export const listExecutiveDailyReportItems = query({
  args: {
    reportDate: v.union(v.string(), v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reportDate = String(args.reportDate).replace(/\D/g, "").slice(0, 8);
    return await ctx.db
      .query("executiveDailyReportItems")
      .withIndex("by_reportDate", (q) => q.eq("reportDate", reportDate))
      .take(args.limit ?? 100);
  },
});

export const listExecutiveDailyReportDates = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("executiveDailyReportItems").withIndex("by_reportDate").order("desc").take(500);
    return [...new Set(rows.map((row) => row.reportDate))].sort().reverse();
  },
});

export const listExecutiveDailyReportItemsRange = query({
  args: {
    bgnDe: v.optional(v.union(v.string(), v.number())),
    endDe: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bgnDe = String(args.bgnDe ?? "00000000").replace(/\D/g, "").slice(0, 8);
    const endDe = String(args.endDe ?? "99999999").replace(/\D/g, "").slice(0, 8);
    const takeLimit = Math.min(Math.max(args.limit ?? 3000, 1), 5000);
    const rows = await ctx.db.query("executiveDailyReportItems").withIndex("by_reportDate").order("desc").take(takeLimit);
    return rows.filter((row) => row.reportDate >= bgnDe && row.reportDate <= endDe);
  },
});

export const listContractDailyReportItems = query({
  args: {
    reportDate: v.union(v.string(), v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reportDate = String(args.reportDate).replace(/\D/g, "").slice(0, 8);
    return await ctx.db
      .query("contractDailyReportItems")
      .withIndex("by_reportDate", (q) => q.eq("reportDate", reportDate))
      .take(args.limit ?? 100);
  },
});

export const listContractDailyReportItemsRange = query({
  args: {
    bgnDe: v.optional(v.union(v.string(), v.number())),
    endDe: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bgnDe = String(args.bgnDe ?? "00000000").replace(/\D/g, "").slice(0, 8);
    const endDe = String(args.endDe ?? "99999999").replace(/\D/g, "").slice(0, 8);
    const takeLimit = Math.min(Math.max(args.limit ?? 3000, 1), 5000);
    const rows = await ctx.db.query("contractDailyReportItems").withIndex("by_reportDate").order("desc").take(takeLimit);
    return rows.filter((row) => row.reportDate >= bgnDe && row.reportDate <= endDe);
  },
});





















