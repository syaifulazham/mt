import { NextResponse } from "next/server";
import * as argon2 from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";

const schema = z.object({
  password:        z.string().min(8),
  currentPassword: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });

  // Voluntary change: verify current password first
  if (parsed.data.currentPassword) {
    const user = await db.organizerUser.findUnique({
      where: { id: session.id },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash)
      return NextResponse.json({ error: { code: "NO_PASSWORD", message: "No existing password found." } }, { status: 400 });

    const valid = await argon2.verify(user.passwordHash, parsed.data.currentPassword);
    if (!valid)
      return NextResponse.json({ error: { code: "WRONG_PASSWORD", message: "Kata laluan semasa tidak betul." } }, { status: 401 });
  }

  const passwordHash = await argon2.hash(parsed.data.password);
  await db.organizerUser.update({
    where: { id: session.id },
    data: { passwordHash, forcePasswordChange: false },
  });

  return NextResponse.json({ data: { success: true } });
}
