import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";

const schema = z.object({ code: z.string().length(6) });

export async function POST(req: Request) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  }

  const user = await db.organizerUser.findUnique({ where: { id: session.id } });
  if (!user?.totpSecretEnc) {
    return NextResponse.json({ error: { code: "TOTP_NOT_CONFIGURED" } }, { status: 400 });
  }

  const secret = decrypt(user.totpSecretEnc);
  const valid = authenticator.verify({ token: parsed.data.code, secret });
  if (!valid) {
    return NextResponse.json({ error: { code: "INVALID_TOTP_CODE" } }, { status: 401 });
  }

  return NextResponse.json({ data: { success: true } });
}
