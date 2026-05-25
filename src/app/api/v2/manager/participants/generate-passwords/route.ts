import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { generateInitialPassword, hashPassword } from "@/lib/auth/participant-password";

// POST /api/v2/manager/participants/generate-passwords
// Body: { participantIds?: string[]; mode: "skip" | "reset" }
//   mode "skip"  → only generate for those without a password
//   mode "reset" → overwrite all (reset to initial)
//   if participantIds is omitted → target all participants in manager's contingents
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0)
    return NextResponse.json({ error: "NO_CONTINGENT" }, { status: 400 });

  const body = await req.json();
  const { participantIds, mode } = body as {
    participantIds?: string[];
    mode: "skip" | "reset";
  };

  if (mode !== "skip" && mode !== "reset")
    return NextResponse.json({ error: "INVALID_MODE" }, { status: 400 });

  const where = {
    contingentId: { in: contingentIds },
    ...(participantIds?.length ? { id: { in: participantIds } } : {}),
    ...(mode === "skip" ? { passwordHash: null } : {}),
  };

  const participants = await db.participant.findMany({
    where,
    select: { id: true, name: true, ic: true },
  });

  if (participants.length === 0)
    return NextResponse.json({ data: [], skipped: 0 });

  const results: { id: string; name: string; initialPassword: string }[] = [];

  await Promise.all(
    participants.map(async (p) => {
      if (!p.ic) return; // can't generate without IC
      const plain = generateInitialPassword(p.name, p.ic);
      const hash  = await hashPassword(plain);
      await db.participant.update({ where: { id: p.id }, data: { passwordHash: hash } });
      results.push({ id: p.id, name: p.name, initialPassword: plain });
    })
  );

  const skipped = participants.length - results.length;
  return NextResponse.json({ data: results, skipped });
}
