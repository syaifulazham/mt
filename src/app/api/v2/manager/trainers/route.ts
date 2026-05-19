import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// ── GET /api/v2/manager/trainers  ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: { contingentManagers: { select: { contingentId: true } } },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ data: [] });

  const trainers = await db.trainer.findMany({
    where: {
      contingentId: { in: contingentIds },
      ...(q && {
        OR: [
          { name:  { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { ic:    { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    include: {
      teams: {
        include: {
          team: { select: { id: true, name: true, competition: { select: { name: true, code: true } } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: trainers });
}

// ── POST /api/v2/manager/trainers  ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        where: { role: { in: ["OWNER", "MANAGER"] } },
        select: { contingentId: true },
      },
    },
  });
  if (!manager) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const contingentIds = manager.contingentManagers.map((cm) => cm.contingentId);
  if (contingentIds.length === 0) return NextResponse.json({ error: "NO_CONTINGENT" }, { status: 400 });

  const body = await req.json();
  const { name, ic, email, phoneNumber, contingentId } = body;

  if (!name?.trim()) return NextResponse.json({ error: "MISSING_NAME" }, { status: 400 });
  if (!contingentId)  return NextResponse.json({ error: "MISSING_CONTINGENT" }, { status: 400 });
  if (!contingentIds.includes(contingentId))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const trainer = await db.trainer.create({
    data: {
      name:        name.trim(),
      ic:          ic?.trim()          || null,
      email:       email?.trim()       || null,
      phoneNumber: phoneNumber?.trim() || null,
      contingentId,
    },
    include: {
      teams: { include: { team: { select: { id: true, name: true, competition: { select: { name: true, code: true } } } } } },
    },
  });

  return NextResponse.json({ data: trainer }, { status: 201 });
}
