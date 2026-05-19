import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";

const patchSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "PARTICIPANTS_MANAGER", "JUDGE_COORDINATOR", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
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

  const updated = await db.organizerUser.update({
    where: { id },
    data: parsed.data,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json({ data: updated });
}
