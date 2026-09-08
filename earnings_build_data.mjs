import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const inputPath = inputArg ? path.resolve(root, inputArg.split("=")[1]) : path.join(root, "results", "earnings_raw.json");
const fallbackJsonPath = path.join(root, "site", "data", "disclosure_signals.json");
const fallbackJsPath = path.join(root, "site", "data", "disclosure_signals.js");
const outputPath = outputArg ? path.resolve(root, outputArg.split("=")[1]) : path.join(root, "site", "data", "earnings.js");

function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function readJsAssignedJson(file, globalName) {
  const text = readText(file);
  const re = new RegExp(`window\\.${globalName}\\s*=\\s*([\\s\\S]*?);?\\s*$`);
  const match = text.match(re);
  if (!match) throw new Error(`Cannot parse ${globalName} from ${file}`);
  return JSON.parse(match[1].replace(/;\s*$/, ""));
}

function readInput() {
  if (fs.existsSync(inputPath)) return readJson(inputPath);
  if (fs.existsSync(fallbackJsonPath)) return fromDisclosureSignals(readJson(fallbackJsonPath));
  if (fs.existsSync(fallbackJsPath)) return fromDisclosureSignals(readJsAssignedJson(fallbackJsPath, "__DISCLOSURE_SIGNALS__"));
  return { quarterly: [], turnaround: [] };
}

function writeJs(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `window.__EARNINGS_DATA__ = ${JSON.stringify(data)};\n`, "utf8");
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, "").replace(/억원|원|%/g, "").trim();
  if (!normalized || normalized === "-" || normalized.toUpperCase() === "N/A") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toHundredMillion(value) {
  const num = numberValue(value);
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  if (abs >= 10000000) return Math.round((num / 100000000) * 100) / 100;
  if (abs >= 10000) return Math.round((num / 100) * 100) / 100;
  return num;
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

function changeRate(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function diff(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
}

function calcRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function calculateProfitStatus(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return "확인필요";
  if (previous < 0 && current > 0) return "흑자전환";
  if (previous > 0 && current < 0) return "적자전환";
  if (previous > 0 && current > 0) return "흑자지속";
  if (previous < 0 && current < 0) return Math.abs(current) < Math.abs(previous) ? "적자축소" : "적자지속";
  if (previous <= 0 && current === 0) return "적자축소";
  if (previous === 0 && current > 0) return "흑자전환";
  if (previous === 0 && current < 0) return "적자전환";
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

function normalizeQuarterly(row) {
  const sales = toHundredMillion(row.sales ?? row.매출액);
  const operatingProfit = toHundredMillion(row.operatingProfit ?? row.영업이익);
  const netIncome = toHundredMillion(row.netIncome ?? row.당기순이익 ?? row.순이익);
  return {
    stockCode: normalizeCode(row.stockCode ?? row.code ?? row.종목코드),
    corpName: stringValue(row.corpName ?? row.name ?? row.종목명),
    market: stringValue(row.market ?? row.시장구분),
    reportName: stringValue(row.reportName ?? row.보고서명),
    reportType: stringValue(row.reportType ?? classifyReportType(row.reportName ?? row.보고서명)),
    basis: stringValue(row.basis ?? row.연결별도 ?? ((row.reportName ?? row.보고서명 ?? "").includes("연결") ? "연결" : "별도/확인필요")),
    receiptAt: normalizeDateTime(row.receiptAt ?? row.rceptDt ?? row.접수시각 ?? row.접수일),
    receiptDate: normalizeDate(row.receiptDate ?? row.date ?? row.접수일),
    url: stringValue(row.url ?? row.dartUrl ?? row.DART_URL ?? row.원문링크),
    sales,
    salesYoY: numberValue(row.salesYoY ?? row.매출액YoY),
    salesQoQ: numberValue(row.salesQoQ ?? row.매출액QoQ),
    operatingProfit,
    operatingProfitYoY: numberValue(row.operatingProfitYoY ?? row.영업이익YoY),
    operatingProfitQoQ: numberValue(row.operatingProfitQoQ ?? row.영업이익QoQ),
    netIncome,
    netIncomeYoY: numberValue(row.netIncomeYoY ?? row.순이익YoY),
    netIncomeQoQ: numberValue(row.netIncomeQoQ ?? row.순이익QoQ),
    opm: numberValue(row.opm) ?? calcRatio(operatingProfit, sales),
  };
}

function normalizeTurnaround(row) {
  const currentOperatingProfit = toHundredMillion(row.currentOperatingProfit ?? row.당해영업이익 ?? row.operatingProfit ?? row.영업이익);
  const prevOperatingProfit = toHundredMillion(row.prevOperatingProfit ?? row.직전영업이익);
  const currentNetIncome = toHundredMillion(row.currentNetIncome ?? row.당해순이익 ?? row.netIncome ?? row.당기순이익);
  const prevNetIncome = toHundredMillion(row.prevNetIncome ?? row.직전순이익);
  const statusFromText = stringValue(row.status ?? row.턴어라운드);
  return {
    stockCode: normalizeCode(row.stockCode ?? row.code ?? row.종목코드),
    corpName: stringValue(row.corpName ?? row.name ?? row.종목명),
    market: stringValue(row.market ?? row.시장구분),
    reportName: stringValue(row.reportName ?? row.보고서명),
    receiptAt: normalizeDateTime(row.receiptAt ?? row.rceptDt ?? row.접수시각 ?? row.접수일),
    receiptDate: normalizeDate(row.receiptDate ?? row.date ?? row.접수일),
    url: stringValue(row.url ?? row.dartUrl ?? row.DART_URL ?? row.원문링크),
    reason: stringValue(row.reason ?? row.changeReason ?? row.변동주요원인 ?? row.reportName ?? row.보고서명),
    prevOperatingProfit,
    currentOperatingProfit,
    opChangeAmount: diff(currentOperatingProfit, prevOperatingProfit),
    opChangeRate: changeRate(currentOperatingProfit, prevOperatingProfit),
    prevNetIncome,
    currentNetIncome,
    netChangeAmount: diff(currentNetIncome, prevNetIncome),
    netChangeRate: changeRate(currentNetIncome, prevNetIncome),
    status: statusFromText || calculateProfitStatus(prevOperatingProfit, currentOperatingProfit),
    netStatus: calculateProfitStatus(prevNetIncome, currentNetIncome),
    afterHoursChangeRate: numberValue(row.afterHoursChangeRate ?? row.시간외변동률),
  };
}

function fromDisclosureSignals(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const earningsRows = rows.filter((row) => row["공시유형"] === "영업실적");
  const turnaroundRows = earningsRows.filter((row) => /매출액또는손익구조|손익구조|30%|15%/.test(String(row["보고서명"] || "")) || stringValue(row["턴어라운드"]));
  const quarterlyRows = earningsRows.filter((row) => /영업\(잠정\)실적|재무제표기준영업|분기보고서|반기보고서|사업보고서/.test(String(row["보고서명"] || "")));
  return {
    generatedAt: payload.generatedAt,
    source: `${payload.scope || "DART disclosure signals"} 변환`,
    quarterly: quarterlyRows.length ? quarterlyRows : earningsRows,
    turnaround: turnaroundRows.length ? turnaroundRows : earningsRows,
  };
}

const input = readInput();
const generatedAt = input.generatedAt || new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace("T", " ");
const data = {
  generatedAt,
  source: input.source || "DART OpenAPI earnings disclosure parser",
  quarterly: (Array.isArray(input.quarterly) ? input.quarterly : []).map(normalizeQuarterly),
  turnaround: (Array.isArray(input.turnaround) ? input.turnaround : []).map(normalizeTurnaround),
};
writeJs(outputPath, data);
console.log(`EARNINGS_QUARTERLY=${data.quarterly.length}`);
console.log(`EARNINGS_TURNAROUND=${data.turnaround.length}`);
console.log(`OUT=${outputPath}`);
