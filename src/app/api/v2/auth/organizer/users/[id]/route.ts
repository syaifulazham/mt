import { NextResponse } from "next/server";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";

function generateRenewalPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[randomBytes(1)[0] % chars.length]).join("");
}

const patchSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "PARTICIPANTS_MANAGER", "JUDGE_COORDINATOR", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  renewPassword: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.errors } }, { status: 422 });
  }

  // Only SUPER_ADMIN can change roles to/from SUPER_ADMIN or ADMIN
  const target = await db.organizerUser.findUnique({ where: { id, deletedAt: null } });
  if (!target) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (
    parsed.data.role &&
    ["SUPER_ADMIN", "ADMIN"].includes(parsed.data.role) &&
    session.role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  // Prevent self-demotion for SUPER_ADMIN
  if (id === session.id && parsed.data.isActive === false) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cannot deactivate your own account" } }, { status: 403 });
  }

  // Password renewal — SUPER_ADMIN only, not self
  if (parsed.data.renewPassword) {
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only SUPER_ADMIN can renew passwords" } }, { status: 403 });
    }
    if (id === session.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cannot renew your own password via this action" } }, { status: 403 });
    }
    const newPassword = generateRenewalPassword();
    const passwordHash = await argon2.hash(newPassword);
    await db.organizerUser.update({
      where: { id },
      data: { passwordHash, forcePasswordChange: true },
    });
    return NextResponse.json({ data: { newPassword } });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { renewPassword: _, ...updateData } = parsed.data;
  const updated = await db.organizerUser.update({
    where: { id },
    data: updateData,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json({ data: updated });
}
