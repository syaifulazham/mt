import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function emailToUsername(email: string): string {
  return email
    .toLowerCase()
    .replace(/@/g, "_at_")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
    .padEnd(3, "x");
}

/** POST — generate a one-time SSO token and return the eptim-edu login URL */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  if (!manager.lmsUserId)
    return NextResponse.json({ error: "NOT_REGISTERED" }, { status: 404 });

  const username = emailToUsername(manager.email);

  try {
    const result = await eptimEdu.createSsoToken(username);
    return NextResponse.json({ loginUrl: result.loginUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    console.error("[lms/account/signin POST] eptim-edu error:", msg, { username });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
