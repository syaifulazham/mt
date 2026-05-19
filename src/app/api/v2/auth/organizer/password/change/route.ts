import { NextResponse } from "next/server";
import * as argon2 from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";

const schema = z.object({ password: z.string().min(8) });

export async function POST(req: Request) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  }

  const passwordHash = await argon2.hash(parsed.data.password);
  await db.organizerUser.update({
    where: { id: session.id },
    data: { passwordHash, forcePasswordChange: false },
  });

  return NextResponse.json({ data: { success: true } });
}
