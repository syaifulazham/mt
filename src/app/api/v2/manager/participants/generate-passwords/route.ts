import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { generateInitialPassword, hashPassword } from "@/lib/auth/participant-password";

type GenResult = { id: string; name: string; initialPassword: string; eduLevel: string; classGrade: string | null };

// POST /api/v2/manager/participants/generate-passwords
// Body: { participantIds?: string[]; mode: "skip" | "reset" }
// Streams NDJSON progress:
//   {"type":"total","total":N}
//   {"type":"progress","processed":N,"total":N}  (after each batch of 10)
//   {"type":"done","data":[...],"skipped":N}
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
    select: { id: true, name: true, ic: true, eduLevel: true, classGrade: true },
  });

  if (participants.length === 0)
    return NextResponse.json({ data: [], skipped: 0 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      const results: GenResult[] = [];
      let processed = 0;
      const total = participants.length;
      send({ type: "total", total });

      // Process in batches of 10 — argon2 is CPU-intensive; running all
      // concurrently on large contingents exhausts memory and causes timeouts.
      const BATCH = 10;
      for (let i = 0; i < participants.length; i += BATCH) {
        await Promise.all(
          participants.slice(i, i + BATCH).map(async (p) => {
            if (!p.ic) { processed++; return; }
            const plain = generateInitialPassword(p.name, p.ic);
            const hash  = await hashPassword(plain);
            await db.participant.update({ where: { id: p.id }, data: { passwordHash: hash } });
            results.push({ id: p.id, name: p.name, initialPassword: plain, eduLevel: p.eduLevel, classGrade: p.classGrade });
            processed++;
          })
        );
        send({ type: "progress", processed, total });
      }

      send({ type: "done", data: results, skipped: total - results.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
