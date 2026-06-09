import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  const where = q
    ? {
        OR: [
          { name:                { contains: q, mode: "insensitive" as const } },
          { shortName:           { contains: q, mode: "insensitive" as const } },
          { state:               { name: { contains: q, mode: "insensitive" as const } } },
          { school:              { state: { name: { contains: q, mode: "insensitive" as const } } } },
          { higherInstitution:   { state: { name: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const stateSelect = { select: { name: true, code: true } };

  const [total, contingents] = await Promise.all([
    db.contingent.count({ where }),
    db.contingent.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:             true,
        name:           true,
        shortName:      true,
        contingentType: true,
        status:         true,
        createdAt:      true,
        state:             stateSelect,
        school:            { select: { state: stateSelect } },
        higherInstitution: { select: { state: stateSelect } },
        _count: {
          select: {
            managers:     true,
            participants: true,
            teams:        true,
          },
        },
      },
    }),
  ]);

  const data = contingents.map(({ school, higherInstitution, state, ...rest }) => ({
    ...rest,
    stateName: school?.state?.name ?? higherInstitution?.state?.name ?? state?.name ?? null,
    stateCode:  school?.state?.code ?? higherInstitution?.state?.code ?? state?.code ?? null,
  }));

  return NextResponse.json({ total, page, pageSize, data });
}
