import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Gender, EduLevel } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contingent = await db.contingent.findUnique({ where: { id }, select: { id: true } });
  if (!contingent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { name, ic, email, phoneNumber, gender, age, eduLevel, classGrade, className, ppki } = body;

  if (!name?.trim() || !gender || !eduLevel)
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const created = await db.participant.create({
    data: {
      contingentId: id,
      name:        name.trim(),
      ic:          ic          || null,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      gender:      gender      as Gender,
      age:         age ? Number(age) : null,
      eduLevel:    eduLevel    as EduLevel,
      classGrade:  classGrade  || null,
      className:   className   || null,
      status:      "ACTIVE",
      ppki:        Boolean(ppki),
    },
    select: {
      id: true, name: true, ic: true, email: true, phoneNumber: true,
      gender: true, age: true, eduLevel: true, classGrade: true, className: true,
      status: true, ppki: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  const where = {
    contingentId: id,
    ...(q && {
      OR: [
        { name:        { contains: q, mode: "insensitive" as const } },
        { ic:          { contains: q, mode: "insensitive" as const } },
        { email:       { contains: q, mode: "insensitive" as const } },
        { className:   { contains: q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, data] = await Promise.all([
    db.participant.count({ where }),
    db.participant.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:          true,
        name:        true,
        ic:          true,
        email:       true,
        phoneNumber: true,
        gender:      true,
        age:         true,
        eduLevel:    true,
        classGrade:  true,
        className:   true,
        status:      true,
        ppki:        true,
        createdAt:   true,
      },
    }),
  ]);

  return NextResponse.json({ total, page, pageSize, data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.participantIds) ? body.participantIds : [];
  if (ids.length === 0) return NextResponse.json({ error: "No participant IDs provided" }, { status: 400 });

  const result = await db.participant.deleteMany({
    where: { id: { in: ids }, contingentId: id },
  });

  return NextResponse.json({ deleted: result.count });
}
