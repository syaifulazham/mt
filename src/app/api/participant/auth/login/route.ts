import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/participant-password";
import { createParticipantSession, participantSessionCookieOptions } from "@/lib/auth/participant-session";

export async function POST(req: NextRequest) {
  const { ic, password } = await req.json();
  if (!ic?.trim())       return NextResponse.json({ error: "IC_REQUIRED" }, { status: 400 });
  if (!password?.trim()) return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 400 });

  const participant = await db.participant.findFirst({
    where: { ic: ic.trim(), status: "ACTIVE" },
    select: { id: true, name: true, passwordHash: true },
  });

  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (!participant.passwordHash)
    return NextResponse.json({ error: "NO_PASSWORD" }, { status: 403 });

  const valid = await verifyPassword(participant.passwordHash, password.trim());
  if (!valid) return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });

  const token = await createParticipantSession(participant.id);

  const res = NextResponse.json({ ok: true, name: participant.name });
  res.cookies.set(participantSessionCookieOptions(token));
  return res;
}
