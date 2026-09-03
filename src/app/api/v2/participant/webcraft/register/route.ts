import { NextResponse } from "next/server";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { db } from "@/lib/db";
import { webcraftConfigured, webcraftCreateUser, toWebcraftUserId } from "@/lib/eptim-webcraft";

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// POST /api/v2/participant/webcraft/register — create WebCraft student account
export async function POST() {
  const session = await getParticipantSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!webcraftConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    select: {
      id: true, name: true, eduLevel: true, classGrade: true,
      contingent: { select: { name: true } },
      webcraftAccess: true,
    },
  });
  if (!participant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (participant.webcraftAccess) return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });

  const webcraftUserId = toWebcraftUserId(participant.id);
  const password = randomPassword();

  try {
    await webcraftCreateUser({
      userId:   webcraftUserId,
      name:     participant.name,
      password,
      otherDetails: {
        school: participant.contingent?.name ?? undefined,
        class:  participant.classGrade ?? undefined,
        level:  participant.eduLevel ?? undefined,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    if (err.status === 401)
      return NextResponse.json({ error: "Kunci API WebCraft ditolak (EPTIM_WEBCRAFT_API_KEY). Hubungi pentadbir." }, { status: 502 });
    if (err.status !== 409)
      return NextResponse.json({ error: err.message ?? "Registration failed" }, { status: err.status ?? 502 });
    // Account already exists on the platform — record locally with unknown password
  }

  await db.participantWebcraftAccess.create({
    data: { participantId: participant.id, webcraftUserId, webcraftPassword: password },
  }).catch(() => {}); // idempotent under races

  return NextResponse.json({ ok: true, webcraftUserId });
}
