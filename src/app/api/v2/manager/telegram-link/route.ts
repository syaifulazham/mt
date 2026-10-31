import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { appUrl, telegramDeepLink } from "@/lib/telegram-link";

// GET /api/v2/manager/telegram-link
// "Sambung Telegram" button in the Manager portal → opens the bot with a 15-min single-use token.
// Already behind clerkMiddleware (isManagerRoute matches /api/v2/manager(.*)).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(appUrl("/manager/sign-in"));

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true, deletedAt: true },
  });
  if (!manager || manager.deletedAt) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  return NextResponse.redirect(telegramDeepLink("m", manager.id));
}
