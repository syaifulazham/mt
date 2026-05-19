import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type     = searchParams.get("type") ?? "contingents";
  const q        = searchParams.get("q") ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));
  const skip     = (page - 1) * pageSize;

  if (type === "contingents") {
    const where = q ? {
      OR: [
        { name:      { contains: q, mode: "insensitive" as const } },
        { shortName: { contains: q, mode: "insensitive" as const } },
        { school:    { name: { contains: q, mode: "insensitive" as const } } },
        { higherInstitution: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {};
    const [data, total] = await Promise.all([
      db.contingent.findMany({
        where, skip, take: pageSize, orderBy: { name: "asc" },
        include: {
          school:            { select: { id: true, name: true } },
          higherInstitution: { select: { id: true, name: true } },
          state:             { select: { id: true, name: true } },
          _count: { select: { participants: true, teams: true, managers: true } },
        },
      }),
      db.contingent.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  }

  if (type === "managers") {
    const where = q ? {
      OR: [
        { name:  { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { school: { name: { contains: q, mode: "insensitive" as const } } },
        { higherInstitution: { name: { contains: q, mode: "insensitive" as const } } },
      ],
      deletedAt: null,
    } : { deletedAt: null };
    const [data, total] = await Promise.all([
      db.managerProfile.findMany({
        where, skip, take: pageSize, orderBy: { name: "asc" },
        include: {
          school:            { select: { id: true, name: true } },
          higherInstitution: { select: { id: true, name: true } },
          _count: { select: { contingentManagers: true } },
        },
      }),
      db.managerProfile.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  }

  if (type === "participants") {
    const where = q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { ic:   { contains: q, mode: "insensitive" as const } },
        { contingent: { name: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {};
    const [data, total] = await Promise.all([
      db.participant.findMany({
        where, skip, take: pageSize, orderBy: { name: "asc" },
        include: {
          contingent: { select: { id: true, name: true, contingentType: true } },
          _count: { select: { teamMembers: true } },
        },
      }),
      db.participant.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  }

  if (type === "teams") {
    const where = q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { competition: { name: { contains: q, mode: "insensitive" as const } } },
        { competition: { code: { contains: q, mode: "insensitive" as const } } },
        { contingent:  { name: { contains: q, mode: "insensitive" as const } } },
      ],
    } : {};
    const [data, total] = await Promise.all([
      db.team.findMany({
        where, skip, take: pageSize, orderBy: { name: "asc" },
        include: {
          competition: { select: { id: true, code: true, name: true, participationType: true } },
          contingent:  { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      }),
      db.team.count({ where }),
    ]);
    return NextResponse.json({ data, total, page, pageSize });
  }

  return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
}
