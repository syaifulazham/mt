import { NextResponse } from "next/server";
import * as argon2 from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  password: z.string().min(8),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.errors } }, { status: 422 });
  }

  const user = await db.organizerUser.findUnique({ where: { inviteToken: token } });
  if (!user) return NextResponse.json({ error: { code: "INVALID_TOKEN" } }, { status: 404 });

  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    return NextResponse.json({ error: { code: "TOKEN_EXPIRED" } }, { status: 410 });
  }

  const passwordHash = await argon2.hash(parsed.data.password);

  await db.organizerUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      forcePasswordChange: false,
      inviteToken: null,
      inviteExpiresAt: null,
    },
  });

  return NextResponse.json({ data: { success: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.organizerUser.findUnique({
    where: { inviteToken: token },
    select: { id: true, email: true, name: true, inviteExpiresAt: true },
  });

  if (!user) return NextResponse.json({ error: { code: "INVALID_TOKEN" } }, { status: 404 });
  if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
    return NextResponse.json({ error: { code: "TOKEN_EXPIRED" } }, { status: 410 });
  }

  return NextResponse.json({ data: { email: user.email, name: user.name } });
}
