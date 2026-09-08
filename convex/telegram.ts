import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };
const sendPendingRef = makeFunctionReference<"action">("telegramActions:sendPending") as any;

const MAX_ATTEMPTS = 3;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function normalizeBotToken(token: string): string {
  return token.startsWith("bot") ? token.slice(3) : token;
}

function normalizeMessageHtml(message: string): string {
  return message
    .replace(/(^|\n)(\s*(?:<(?:b|strong)>\s*)?)\d+\.\s*/g, "$1$2")
    .trim();
}

function isLegacyPublicAlert(message: string): boolean {
  return message.includes("[장중 대량보유 공시 알림]") || message.includes("대량보유 공시:");
}

export const enqueue = mutation({
  args: {
    dedupeKey: v.string(),
    reportDate: v.string(),
    messageHtml: v.string(),
    source: v.optional(v.string()),
    sendNow: v.optional(v.boolean()),
    ingestSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.CONVEX_INGEST_SECRET;
    if (expectedSecret && args.ingestSecret !== expectedSecret) {
      throw new Error("Invalid ingest secret");
    }

    const existing = await ctx.db
      .query("telegramNotifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();

    const now = Date.now();
    const messageHtml = normalizeMessageHtml(args.messageHtml);
    if (isLegacyPublicAlert(messageHtml)) {
      throw new Error("Legacy public Telegram message format is disabled. Use Convex DART pollers.");
    }
    let id = existing?._id;

    if (existing) {
      if (existing.status === "sent" || existing.status === "sending") {
        return { id, status: existing.status, deduped: true };
      }

      await ctx.db.patch(existing._id, {
        reportDate: args.reportDate,
        messageHtml,
        source: args.source,
        status: "pending",
        updatedAt: now,
      });
    } else {
      id = await ctx.db.insert("telegramNotifications", {
        dedupeKey: args.dedupeKey,
        reportDate: args.reportDate,
        messageHtml,
        source: args.source,
        status: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.sendNow ?? true) {
      await ctx.scheduler.runAfter(0, sendPendingRef, { id });
    }

    return { id, status: "pending", deduped: false };
  },
});

export const listRecent = query({
  args: {
    reportDate: v.optional(v.union(v.string(), v.number())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.reportDate !== undefined) {
      const reportDate = String(args.reportDate).replace(/\D/g, "").slice(0, 8);
      return await ctx.db
        .query("telegramNotifications")
        .withIndex("by_reportDate", (q) => q.eq("reportDate", reportDate))
        .order("desc")
        .take(args.limit ?? 20);
    }
    return await ctx.db
      .query("telegramNotifications")
      .withIndex("by_reportDate")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const getForSend = internalQuery({
  args: {
    id: v.id("telegramNotifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const markSending = internalMutation({
  args: {
    id: v.id("telegramNotifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification) {
      throw new Error("Notification not found");
    }

    if (notification.status === "sent" || notification.status === "sending") {
      return { shouldSend: false, attempts: notification.attempts };
    }

    if (notification.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(args.id, {
        status: "failed",
        updatedAt: Date.now(),
        lastError: `Max attempts reached (${MAX_ATTEMPTS})`,
      });
      return { shouldSend: false, attempts: notification.attempts };
    }

    const attempts = notification.attempts + 1;
    await ctx.db.patch(args.id, {
      status: "sending",
      attempts,
      updatedAt: Date.now(),
    });
    return { shouldSend: true, attempts };
  },
});

export const markSent = internalMutation({
  args: {
    id: v.id("telegramNotifications"),
    telegramMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "sent",
      telegramMessageId: args.telegramMessageId,
      updatedAt: now,
      sentAt: now,
      lastError: undefined,
    });
  },
});

export const markFailed = internalMutation({
  args: {
    id: v.id("telegramNotifications"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.id);
    if (!notification) {
      return;
    }

    const nextStatus = notification.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    await ctx.db.patch(args.id, {
      status: nextStatus,
      lastError: args.error,
      updatedAt: Date.now(),
    });

    if (nextStatus === "pending") {
      const delayMs = Math.min(60000, 5000 * Math.pow(2, notification.attempts - 1));
      await ctx.scheduler.runAfter(delayMs, sendPendingRef, { id: args.id });
    }
  },
});

export const markBlocked = internalMutation({
  args: {
    id: v.id("telegramNotifications"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      lastError: args.error,
      updatedAt: Date.now(),
    });
  },
});
