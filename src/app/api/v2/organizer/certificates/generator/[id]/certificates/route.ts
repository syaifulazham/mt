import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const PAGE_SIZE = 50;

/**
 * GET ?q=&page=&groupBy=none|state|rank|competition — certificates issued by
 * this generator job (meta.jobId). Sorted by the group so a group runs across
 * pages; `groups` holds each group's full count for the headings.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const groupBy = req.nextUrl.searchParams.get("groupBy") ?? "none";
  const groupField = groupBy === "state" ? "stateName" : groupBy === "rank" ? "rank" : groupBy === "competition" ? "competitionCode" : null;

  const where: Prisma.CertificateWhereInput = {
    meta: { path: ["jobId"], equals: id },
    ...(q && {
      OR: [
        { recipientName:   { contains: q, mode: "insensitive" } },
        { recipientIc:     { contains: q } },
        { serialNumber:    { contains: q, mode: "insensitive" } },
        { contingentName:  { contains: q, mode: "insensitive" } },
        { competitionCode: { contains: q, mode: "insensitive" } },
        { competitionName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const orderBy: Prisma.CertificateOrderByWithRelationInput[] =
    groupBy === "state" ? [{ stateName: { sort: "asc", nulls: "last" } }, { competitionCode: "asc" }, { rank: { sort: "asc", nulls: "last" } }, { serialNumber: "asc" }]
    : groupBy === "rank" ? [{ rank: { sort: "asc", nulls: "last" } }, { competitionCode: "asc" }, { serialNumber: "asc" }]
    : [{ competitionCode: "asc" }, { serialNumber: "asc" }];
  const [total, rows, groupCounts] = await Promise.all([
    db.certificate.count({ where }),
    db.certificate.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, serialNumber: true, status: true, issuedAt: true, recipientName: true, recipientIc: true,
        contingentName: true, stateName: true, competitionCode: true, competitionName: true,
        awardTitle: true, rank: true, eventName: true,
        templateVersion: { select: { version: true } },
      },
    }),
    groupField
      ? db.certificate.groupBy({ by: [groupField], where, _count: { _all: true } })
      : Promise.resolve([] as never[]),
  ]);
  const groups: Record<string, number> = {};
  for (const g of groupCounts as Record<string, unknown>[])
    groups[String(g[groupField!] ?? "")] = (g._count as { _all: number })._all;
  return NextResponse.json({ total, page, pageSize: PAGE_SIZE, rows, groups }, { headers: { "Cache-Control": "no-store" } });
}
