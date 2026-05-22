import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const profile = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true, name: true, idType: true, idNumber: true, phone: true, address: true, nationality: true, email: true },
  });
  if (!profile) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ data: profile });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { name, idType, idNumber, phone, address } = body;

  const profile = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!profile) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.managerProfile.update({
    where: { clerkUserId: userId },
    data: {
      ...(name      !== undefined && { name:     String(name).trim() }),
      ...(idType    !== undefined && { idType }),
      ...(idNumber  !== undefined && { idNumber: String(idNumber).trim() }),
      ...(phone     !== undefined && { phone:    String(phone).trim() }),
      ...(address   !== undefined && { address:  String(address).trim() }),
    },
    select: { id: true, name: true, idType: true, idNumber: true, phone: true, address: true, nationality: true, email: true },
  });

  return NextResponse.json({ data: updated });
}
