import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  dartDisclosures: defineTable({
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
    notifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_receiptNo", ["receiptNo"])
    .index("by_receiptDate", ["receiptDate"]),

  dailyReportItems: defineTable({
    reportDate: v.string(),
    receiptNo: v.string(),
    corpName: v.string(),
    stockCode: v.string(),
    market: v.string(),
    reporter: v.string(),
    reporterType: v.string(),
    previousRate: v.optional(v.number()),
    currentRate: v.optional(v.number()),
    rateDelta: v.optional(v.number()),
    previousShares: v.optional(v.number()),
    currentShares: v.optional(v.number()),
    shareDelta: v.optional(v.number()),
    reason: v.string(),
    obligationDate: v.string(),
    buyUnitPrice: v.optional(v.number()),
    buyTradeValue: v.optional(v.number()),
    buyShares: v.optional(v.number()),
    buyTradeRows: v.optional(v.number()),
    buyPriceLabel: v.string(),
    buyTypeLabel: v.string(),
    eventClose: v.optional(v.number()),
    eventCloseDate: v.optional(v.string()),
    priceSource: v.optional(v.string()),
    url: v.string(),
    createdAt: v.number(),
  })
    .index("by_reportDate", ["reportDate"])
    .index("by_receiptNo", ["receiptNo"])
    .index("by_stockDate", ["stockCode", "reportDate"]),


  executiveDisclosures: defineTable({
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
    notifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_receiptNo", ["receiptNo"])
    .index("by_receiptDate", ["receiptDate"]),

  executiveDailyReportItems: defineTable({
    reportDate: v.string(),
    receiptNo: v.string(),
    corpName: v.string(),
    stockCode: v.string(),
    market: v.string(),
    reporter: v.string(),
    reporterType: v.string(),
    executiveRegistration: v.string(),
    executiveRole: v.string(),
    mainShareholder: v.string(),
    previousShares: v.optional(v.number()),
    currentShares: v.optional(v.number()),
    shareDelta: v.optional(v.number()),
    previousRate: v.optional(v.number()),
    currentRate: v.optional(v.number()),
    rateDelta: v.optional(v.number()),
    reason: v.string(),
    obligationDate: v.string(),
    tradeUnitPrice: v.optional(v.number()),
    tradeValue: v.optional(v.number()),
    tradeShares: v.optional(v.number()),
    tradeTypeLabel: v.string(),
    eventClose: v.optional(v.number()),
    eventCloseDate: v.optional(v.string()),
    priceSource: v.optional(v.string()),
    url: v.string(),
    createdAt: v.number(),
  })
    .index("by_reportDate", ["reportDate"])
    .index("by_receiptNo", ["receiptNo"])
    .index("by_stockDate", ["stockCode", "reportDate"]),
  telegramNotifications: defineTable({
    dedupeKey: v.string(),
    reportDate: v.string(),
    messageHtml: v.string(),
    source: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    telegramMessageId: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_status", ["status"])
    .index("by_reportDate", ["reportDate"]),

  shortformDrafts: defineTable({
    draftKey: v.string(),
    reportDate: v.string(),
    topicKey: v.string(),
    title: v.string(),
    angle: v.string(),
    hook: v.string(),
    script: v.string(),
    scenesJson: v.string(),
    hashtags: v.array(v.string()),
    sourceReceiptNos: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("rendered"),
      v.literal("uploaded"),
      v.literal("archived"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_draftKey", ["draftKey"])
    .index("by_reportDate", ["reportDate"])
    .index("by_status", ["status"]),
});



