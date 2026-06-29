import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// POST /api/v2/organizer/judging/templates/[id]/replicate
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;

  const source = await db.judgingTemplate.findUnique({
    where: { id },
    include: {
      criterions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy:  { order: "asc" },
      },
    },
  });

  if (!source) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Build a unique code: append -2, -3, … until free
  let newCode = `${source.code}-2`;
  let suffix  = 2;
  while (await db.judgingTemplate.findUnique({ where: { code: newCode } })) {
    suffix++;
    newCode = `${source.code}-${suffix}`;
    if (newCode.length > 16) newCode = newCode.slice(0, 13) + `-${suffix}`;
  }

  const copy = await db.$transaction(async (tx) => {
    const tpl = await tx.judgingTemplate.create({
      data: {
        name:        `${source.name} (Salinan)`,
        code:        newCode,
        description: source.description,
      },
    });

    for (const c of source.criterions) {
      const criterion = await tx.judgingCriterion.create({
        data: {
          templateId: tpl.id,
          name:       c.name,
          type:       c.type,
          order:      c.order,
          maxScore:   c.maxScore,
          minScore:   c.minScore,
          maxTime:    c.maxTime,
        },
      });

      for (const opt of c.options) {
        await tx.judgingOption.create({
          data: {
            criterionId: criterion.id,
            label:       opt.label,
            weight:      opt.weight,
            order:       opt.order,
          },
        });
      }
    }

    return tx.judgingTemplate.findUnique({
      where: { id: tpl.id },
      include: { _count: { select: { criterions: true } } },
    });
  });

  return NextResponse.json({ template: copy }, { status: 201 });
}
