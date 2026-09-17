import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CertStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 25;

/**
 * The issued-certificate browser. Reads `certificates` only — no join into
 * participants, teams or events — so it keeps working for a season whose
 * operational data has been purged.
 */
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q        = (searchParams.get("q") ?? "").trim();
  const seasonId = searchParams.get("seasonId") ?? "";
  const status   = searchParams.get("status") ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZE), 10)));

  const where: Prisma.CertificateWhereInput = {
    ...(seasonId && { seasonId }),
    ...(status && { status: status as CertStatus }),
    ...(q && {
      OR: [
        { serialNumber:   { contains: q, mode: "insensitive" } },
        { uniqueCode:     { contains: q, mode: "insensitive" } },
        { recipientName:  { contains: q, mode: "insensitive" } },
        { recipientIc:    { contains: q } },
        { contingentName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    db.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, serialNumber: true, uniqueCode: true, status: true, issuedAt: true,
        recipientName: true, recipientType: true, recipientIc: true,
        contingentName: true, teamName: true, competitionName: true, awardTitle: true,
        season:          { select: { id: true, code: true, name: true, archivedAt: true } },
        templateVersion: { select: { id: true, version: true, template: { select: { id: true, name: true, targetType: true } } } },
      },
    }),
    // A count over 117 k rows with a text filter is the slow part of this page;
    // it is exact rather than estimated because organizers reconcile these totals.
    db.certificate.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}
