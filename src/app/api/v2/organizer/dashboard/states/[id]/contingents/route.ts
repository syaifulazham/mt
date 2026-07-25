import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const TYPE_FILTER: Record<string, Prisma.ContingentWhereInput> = {
  PRIMARY:       { contingentType: "SCHOOL",       school: { level: "PRIMARY"   } },
  SECONDARY:     { contingentType: "SCHOOL",       school: { level: "SECONDARY" } },
  HIGHER:        { contingentType: "HIGHER"       },
  INDEPENDENT:   { contingentType: "INDEPENDENT"  },
  INTERNATIONAL: { contingentType: "INTERNATIONAL"},
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: stateId } = await params;
  const type = req.nextUrl.searchParams.get("type") ?? "";

  const typeFilter = TYPE_FILTER[type];
  if (!typeFilter) return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });

  const stateOR: Prisma.ContingentWhereInput["OR"] = [
    { stateId },
    { school: { stateId } },
  ];

  const contingents = await db.contingent.findMany({
    where: { AND: [{ OR: stateOR }, typeFilter] },
    select: {
      id: true,
      name: true,
      shortName: true,
      school: {
        select: {
          name: true,
          ppdCode: true,
          district: { select: { name: true } },
        },
      },
      higherInstitution: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: contingents.map((c) => ({
      id:              c.id,
      name:            c.name,
      shortName:       c.shortName ?? null,
      ppd:             c.school?.district?.name ?? c.school?.ppdCode ?? null,
      schoolName:      c.school?.name ?? null,
      institutionName: c.higherInstitution?.name ?? null,
    })),
  });
}
