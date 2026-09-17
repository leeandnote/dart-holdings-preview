import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };
const markSendingRef = makeFunctionReference<"mutation">("telegram:markSending") as any;
const getForSendRef = makeFunctionReference<"query">("telegram:getForSend") as any;
const markSentRef = makeFunctionReference<"mutation">("telegram:markSent") as any;
const markFailedRef = makeFunctionReference<"mutation">("telegram:markFailed") as any;
const markBlockedRef = makeFunctionReference<"mutation">("telegram:markBlocked") as any;

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

export const sendPending = internalAction({
  args: {
    id: v.id("telegramNotifications"),
  },
  handler: async (ctx, args) => {
    const sendState = await ctx.runMutation(markSendingRef, { id: args.id });
    if (!sendState.shouldSend) {
      return sendState;
    }

    const notification = await ctx.runQuery(getForSendRef, { id: args.id });
    if (!notification) {
      return { shouldSend: false, reason: "missing" };
    }

    const messageHtml = normalizeMessageHtml(notification.messageHtml);
    if (isLegacyPublicAlert(messageHtml)) {
      const error = "Blocked legacy public Telegram message format.";
      await ctx.runMutation(markBlockedRef, { id: args.id, error });
      return { sent: false, blocked: true, error };
    }

    try {
      const token = normalizeBotToken(getEnv("TELEGRAM_BOT_TOKEN"));
      const chatId = getEnv("TELEGRAM_CHAT_ID");
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageHtml,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.description ?? `Telegram API HTTP ${response.status}`);
      }

      await ctx.runMutation(markSentRef, {
        id: args.id,
        telegramMessageId: body.result?.message_id,
      });
      return { sent: true, attempts: sendState.attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(markFailedRef, { id: args.id, error: message });
      return { sent: false, attempts: sendState.attempts, error: message };
    }
  },
});
