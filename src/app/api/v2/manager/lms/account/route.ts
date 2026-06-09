import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { eptimEdu, eptimEduConfigured } from "@/lib/eptimedu";

function randomPassword(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

const LOGIN_URL = `${process.env.EPTIMEDU_BASE_URL ?? ""}/auth/login`;

/** GET — check whether this manager has an eptim-edu account */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const username = emailToUsername(manager.email);

  // Check DB first; fall back to live API check if no lmsUserId stored yet
  if (manager.lmsUserId) {
    try {
      const result = await eptimEdu.userExists(username);
      const user   = result?.user ?? null;
      return NextResponse.json({
        registered: true,
        username,
        loginUrl:   LOGIN_URL,
        loginCount: user?.loginCount ?? 0,
        lastLoginAt: user?.lastLoginAt ?? null,
      });
    } catch {
      return NextResponse.json({
        registered: true,
        username,
        loginUrl:   LOGIN_URL,
        loginCount: 0,
        lastLoginAt: null,
      });
    }
  }

  // No lmsUserId — check live
  try {
    const result = await eptimEdu.userExists(username);
    if (result?.exists) {
      await db.managerProfile.update({
        where: { clerkUserId: userId },
        data: { lmsUserId: result.user.id },
      });
      return NextResponse.json({
        registered: true,
        username,
        loginUrl:   LOGIN_URL,
        loginCount: result.user?.loginCount ?? 0,
        lastLoginAt: result.user?.lastLoginAt ?? null,
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ registered: false, username, loginUrl: LOGIN_URL });
}

/** POST — create an eptim-edu account for this manager */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!eptimEduConfigured())
    return NextResponse.json({ error: "EPTIMEDU_NOT_CONFIGURED" }, { status: 503 });

  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const username = emailToUsername(manager.email);
  const password = randomPassword(8);

  try {
    const check = await eptimEdu.userExists(username);
    let lmsUserId: string;
    let finalPassword = password;

    if (check?.exists) {
      lmsUserId     = check.user.id;
      finalPassword = manager.lmsPassword ?? password; // reuse stored password if exists
    } else {
      const created = await eptimEdu.createUser({
        username,
        password,
        name:  manager.name,
        email: manager.email,
      });
      lmsUserId = created.id;
    }

    await db.managerProfile.update({
      where: { clerkUserId: userId },
      data: { lmsUserId, lmsPassword: finalPassword },
    });

    return NextResponse.json({
      username,
      password: finalPassword,
      loginUrl: LOGIN_URL,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "EptimEdu API error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
