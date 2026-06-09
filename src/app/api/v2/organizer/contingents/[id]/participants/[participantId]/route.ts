import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Gender, EduLevel } from "@prisma/client";

type Params = { params: Promise<{ id: string; participantId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, participantId } = await params;

  const existing = await db.participant.findUnique({ where: { id: participantId } });
  if (!existing || existing.contingentId !== id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, ic, email, phoneNumber, gender, age, eduLevel, classGrade, className, status, ppki } = body;

  if (!name?.trim() || !gender || !eduLevel)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const updated = await db.participant.update({
    where: { id: participantId },
    data: {
      name:        name.trim(),
      ic:          ic          || null,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      gender:      gender      as Gender,
      age:         age ? Number(age) : null,
      eduLevel:    eduLevel    as EduLevel,
      classGrade:  classGrade  || null,
      className:   className   || null,
      status:      status      ?? "ACTIVE",
      ppki:        Boolean(ppki),
    },
    select: {
      id: true, name: true, ic: true, email: true, phoneNumber: true,
      gender: true, age: true, eduLevel: true, classGrade: true, className: true,
      status: true, ppki: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}
