import { createHmac } from "node:crypto";

/**
 * Signed, short-lived deep link that connects a portal account to the Techlympics
 * Telegram bot (AiRimau). Must match techlympics-bot/src/auth/linkToken.ts.
 *
 * Env (add to GitHub secrets + deploy.yml):
 *   TELEGRAM_LINK_SECRET   — same value as the bot's LINK_TOKEN_SECRET (openssl rand -hex 32)
 *   TELEGRAM_BOT_USERNAME  — e.g. TechlympicsHelperBot
 */

export type TelegramAccountKind = "m" | "o"; // m = ManagerProfile.id, o = OrganizerUser.id

export function createTelegramLinkToken(kind: TelegramAccountKind, accountId: string, ttlSeconds = 15 * 60): string {
  const secret = process.env.TELEGRAM_LINK_SECRET;
  if (!secret || secret.length < 32) throw new Error("TELEGRAM_LINK_SECRET is not set");
  if (!/^[A-Za-z0-9]{1,30}$/.test(accountId)) throw new Error("accountId must be 1-30 chars of [A-Za-z0-9]");
  const exp = Math.floor(Date.now() / 1000 + ttlSeconds).toString(36);
  const body = `${kind}_${accountId}_${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 16);
  return `${body}_${sig}`;
}

export function telegramDeepLink(kind: TelegramAccountKind, accountId: string): string {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) throw new Error("TELEGRAM_BOT_USERNAME is not set");
  return `https://t.me/${bot}?start=${createTelegramLinkToken(kind, accountId)}`;
}

/** Absolute URL on the public origin (behind nginx, req.url is 127.0.0.1:3310). */
export function appUrl(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
}
