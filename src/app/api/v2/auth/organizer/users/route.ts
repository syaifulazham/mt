import { NextResponse } from "next/server";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";
import { createUserSchema } from "@/lib/validations/organizer";

// Generates a readable random password: 3 segments of 4 chars separated by dashes
// e.g. "aK7x-9mPq-Zr2w"  — easy to read aloud or copy
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: 4 }, () => chars[randomBytes(1)[0] % chars.length]).join("");
  return `${segment()}-${segment()}-${segment()}`;
}

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const users = await db.organizerUser.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      forcePasswordChange: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: users });
}

export async function POST(req: Request) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.errors } }, { status: 422 });
  }

  if (
    ["SUPER_ADMIN", "ADMIN"].includes(parsed.data.role) &&
    session.role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only SUPER_ADMIN can create ADMIN accounts" } }, { status: 403 });
  }

  const existing = await db.organizerUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: { code: "CONFLICT", message: "Email already registered" } }, { status: 409 });
  }

  const plainPassword = generatePassword();
  const passwordHash = await argon2.hash(plainPassword);

  const user = await db.organizerUser.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
      forcePasswordChange: false,
      createdById: session.id,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  // Return plaintext password once — it is never stored or retrievable again
  return NextResponse.json({ data: { ...user, temporaryPassword: plainPassword } }, { status: 201 });
}
