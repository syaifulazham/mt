import { NextRequest, NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { verifyPassword, hashPassword } from "@/lib/auth/participant-password";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword?.trim() || !newPassword?.trim())
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  if (newPassword.trim().length < 6)
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: { passwordHash: true },
  });

  if (!participant?.passwordHash)
    return NextResponse.json({ error: "NO_PASSWORD" }, { status: 403 });

  const valid = await verifyPassword(participant.passwordHash, currentPassword.trim());
  if (!valid) return NextResponse.json({ error: "WRONG_CURRENT" }, { status: 401 });

  const newHash = await hashPassword(newPassword.trim());
  await db.participant.update({
    where: { id: session.participantId },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ ok: true });
}
