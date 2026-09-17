import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

type DailyReportItem = {
  receiptNo: string;
  reportDate: string;
  corpName: string;
  stockCode: string;
  market: string;
  reporter: string;
  reporterType: string;
  previousRate?: number;
  currentRate?: number;
  rateDelta?: number;
  reason: string;
  obligationDate: string;
  buyUnitPrice?: number;
  buyTradeValue?: number;
  buyShares?: number;
  buyTradeRows?: number;
  buyPriceLabel: string;
  buyTypeLabel: string;
  priceSource?: string;
  url: string;
};

type ShortformScene = {
  label: string;
  headline: string;
  body: string;
  metric?: string;
  reporter?: string;
  reporterType?: string;
  reason?: string;
  market?: string;
  stockCode?: string;
  obligationDate?: string;
};

type ShortformIdea = {
  topicKey: string;
  title: string;
  angle: string;
  hook: string;
  script: string;
  scenes: ShortformScene[];
  hashtags: string[];
  sourceReceiptNos: string[];
  score: number;
};

function compactDate(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatDate(value: string): string {
  const digits = compactDate(value);
  if (digits.length !== 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function formatPercent(value?: number): string {
  return value === undefined ? "N/A" : `${value.toFixed(2)}%`;
}

function formatSignedPercent(value?: number): string {
  if (value === undefined) return "N/A";
  const sign = value > 0 ? "▲" : value < 0 ? "▼" : "-";
  return `${sign} ${Math.abs(value).toFixed(2)}%p`;
}

function formatMoney(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value === 0) return "N/A";
  const sign = value > 0 ? "+" : "-";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${sign}${Math.round(abs / 100000000).toLocaleString("ko-KR")}억 원`;
  return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만 원`;
}

function priceSourceLabel(item: DailyReportItem): string {
  if (item.priceSource === "dart-transaction-unit-price") return "공시단가";
  if (item.priceSource === "obligation-date-close") return "종가추정";
  return item.buyTypeLabel === "N/A" ? "단가 N/A" : item.buyTypeLabel;
}

function isNewFive(item: DailyReportItem): boolean {
  return (item.previousRate ?? 0) < 5 && (item.currentRate ?? 0) >= 5;
}

function direction(item: DailyReportItem): "increase" | "decrease" | "flat" {
  const delta = item.rateDelta ?? 0;
  if (delta > 0) return "increase";
  if (delta < 0) return "decrease";
  return "flat";
}

function itemScore(item: DailyReportItem): number {
  const deltaScore = Math.abs(item.rateDelta ?? 0) * 12;
  const moneyScore = Math.min(Math.abs(item.buyTradeValue ?? 0) / 100000000, 45);
  const newFiveScore = isNewFive(item) ? 35 : 0;
  const knownPriceScore = item.priceSource && item.priceSource !== "none" ? 8 : 0;
  const foreignScore = /외국|BlackRock|Fidelity|Capital|Vanguard|Morgan/i.test(`${item.reporterType} ${item.reporter}`) ? 10 : 0;
  return deltaScore + moneyScore + newFiveScore + knownPriceScore + foreignScore;
}

function selectTop(items: DailyReportItem[], limit = 5): DailyReportItem[] {
  const seen = new Set<string>();
  const selected: DailyReportItem[] = [];
  const ranked = [...items]
    .filter((item) => item.market !== "KONEX")
    .sort((a, b) => itemScore(b) - itemScore(a));

  for (const item of ranked) {
    const key = `${item.stockCode}:${item.corpName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function oneLine(item: DailyReportItem): string {
  const move = `${formatPercent(item.previousRate)}에서 ${formatPercent(item.currentRate)}로 ${formatSignedPercent(item.rateDelta)}`;
  const amount = formatMoney(item.buyTradeValue);
  const source = priceSourceLabel(item);
  return `${item.corpName}: ${item.reporter}의 보유비율이 ${move} 변동했습니다. 보고사유는 ${item.reason}. 금액은 ${amount}, 기준은 ${source}입니다.`;
}

function buildScenes(title: string, items: DailyReportItem[]): ShortformScene[] {
  const scenes: ShortformScene[] = [
    {
      label: "HOOK",
      headline: title,
      body: "오늘 나온 5% 대량보유 공시 중에서 숫자와 사유가 눈에 띄는 종목만 추렸습니다.",
      metric: `${items.length}개 종목`,
    },
  ];

  for (const item of items.slice(0, 5)) {
    const dir = direction(item) === "increase" ? "증가" : direction(item) === "decrease" ? "감소" : "변동 없음";
    scenes.push({
      label: `${item.market} · ${dir}`,
      headline: item.corpName,
      body: `${item.reporter} · ${item.reason}`,
      metric: `${formatPercent(item.previousRate)} → ${formatPercent(item.currentRate)} (${formatSignedPercent(item.rateDelta)})`,
      reporter: item.reporter,
      reporterType: item.reporterType,
      reason: item.reason,
      market: item.market,
      stockCode: item.stockCode,
      obligationDate: item.obligationDate,
    });
  }

  scenes.push({
    label: "CHECK",
    headline: "원문 확인 포인트",
    body: "공시단가인지 종가추정인지, 그리고 단순 매매인지 담보·계약 변경인지 구분해서 봐야 합니다.",
  });
  return scenes;
}

function buildScript(title: string, angle: string, items: DailyReportItem[]): string {
  const lines = [
    title,
    "",
    `오늘의 관전 포인트는 ${angle}입니다.`,
    "",
    ...items.map((item, index) => `${index + 1}. ${oneLine(item)}`),
    "",
    "주의할 점은 금액 기준입니다. 공시 세부변동내역이 있으면 공시단가를 쓰고, 없으면 보고의무발생일 종가 기준 추정치가 들어갑니다.",
    "매수·매도 추천이 아니라 DART 공시를 빠르게 읽기 위한 요약입니다.",
  ];
  return lines.join("\n");
}

function makeIdea(topicKey: string, title: string, angle: string, items: DailyReportItem[], hashtags: string[]): ShortformIdea | undefined {
  const selected = selectTop(items, 5);
  if (!selected.length) return undefined;
  return {
    topicKey,
    title,
    angle,
    hook: `${selected[0].corpName} 포함, 오늘 5% 공시에서 눈에 띈 TOP ${selected.length}`,
    script: buildScript(title, angle, selected),
    scenes: buildScenes(title, selected),
    hashtags,
    sourceReceiptNos: selected.map((item) => item.receiptNo),
    score: selected.reduce((sum, item) => sum + itemScore(item), 0),
  };
}

async function readDailyItems(ctx: any, reportDate: string): Promise<DailyReportItem[]> {
  return await ctx.db
    .query("dailyReportItems")
    .withIndex("by_reportDate", (q: any) => q.eq("reportDate", compactDate(reportDate)))
    .take(300);
}

function buildIdeas(items: DailyReportItem[], reportDate: string): ShortformIdea[] {
  const date = formatDate(reportDate);
  const increase = items.filter((item) => (item.rateDelta ?? 0) > 0);
  const decrease = items.filter((item) => (item.rateDelta ?? 0) < 0);
  const ideas = [
    makeIdea(
      "daily_top5",
      `${date} 오늘의 주요 5% 공시 TOP 5`,
      "증가와 감소를 함께 본 종합 TOP 5",
      items.filter((item) => (item.rateDelta ?? 0) !== 0 || Math.abs(item.buyTradeValue ?? 0) > 0 || isNewFive(item)),
      ["5퍼센트공시", "대량보유공시", "국내주식", "공시리뷰"],
    ),
    makeIdea(
      "daily_top5_increase",
      `${date} 지분 증가 5% 공시 TOP 5`,
      "보유비율이 증가한 공시만 추린 증가형 TOP 5",
      increase,
      ["지분증가", "5퍼센트공시", "장내매수", "공시체크"],
    ),
    makeIdea(
      "daily_top5_decrease",
      `${date} 지분 감소 5% 공시 TOP 5`,
      "보유비율이 감소한 공시만 추린 감소형 TOP 5",
      decrease,
      ["지분감소", "5퍼센트공시", "대량보유", "공시분석"],
    ),
  ];

  return ideas.filter((entry): entry is ShortformIdea => Boolean(entry)).sort((a, b) => b.score - a.score);
}

export const listIdeas = query({
  args: {
    reportDate: v.union(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const reportDate = compactDate(String(args.reportDate));
    const items = await readDailyItems(ctx, reportDate);
    return buildIdeas(items as DailyReportItem[], reportDate);
  },
});

export const saveDraft = mutation({
  args: {
    reportDate: v.union(v.string(), v.number()),
    topicKey: v.string(),
  },
  handler: async (ctx, args) => {
    const reportDate = compactDate(String(args.reportDate));
    const items = await readDailyItems(ctx, reportDate);
    const selected = buildIdeas(items as DailyReportItem[], reportDate).find((entry) => entry.topicKey === args.topicKey);
    if (!selected) throw new Error(`No shortform idea for ${args.topicKey} on ${reportDate}`);

    const now = Date.now();
    const draftKey = `${reportDate}:${selected.topicKey}`;
    const existing = await ctx.db
      .query("shortformDrafts")
      .withIndex("by_draftKey", (q) => q.eq("draftKey", draftKey))
      .unique();
    const payload = {
      draftKey,
      reportDate,
      topicKey: selected.topicKey,
      title: selected.title,
      angle: selected.angle,
      hook: selected.hook,
      script: selected.script,
      scenesJson: JSON.stringify(selected.scenes),
      hashtags: selected.hashtags,
      sourceReceiptNos: selected.sourceReceiptNos,
      status: "draft" as const,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("shortformDrafts", { ...payload, createdAt: now });
  },
});

export const listDrafts = query({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
  },
  handler: async (ctx, args) => {
    if (args.reportDate) {
      return await ctx.db
        .query("shortformDrafts")
        .withIndex("by_reportDate", (q) => q.eq("reportDate", compactDate(String(args.reportDate ?? ""))))
        .order("desc")
        .take(50);
    }
    return await ctx.db.query("shortformDrafts").withIndex("by_status").order("desc").take(50);
  },
});
