import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { appUrl, telegramDeepLink } from "@/lib/telegram-link";

// GET /api/v2/organizer/telegram-link
// "Sambung Telegram" in the Organizer portal → opens the bot with a 15-min single-use token.
// The bot reads role/isActive from bot.organizer_accounts, so deactivating the user also cuts the bot off.
// /api/v2/organizer is not covered by the middleware matcher, so the session is checked here.
export async function GET() {
  const user = await getOrganizerSession();
  if (!user) {
    const login = appUrl("/organizer/login");
    login.searchParams.set("callbackUrl", "/api/v2/organizer/telegram-link");
    return NextResponse.redirect(login);
  }
  // Don't hand out a link mid-login (TOTP not yet verified / password change pending).
  if (user.totpPending || user.forcePasswordChange) return NextResponse.redirect(appUrl("/organizer/login"));

  return NextResponse.redirect(telegramDeepLink("o", user.id));
}
