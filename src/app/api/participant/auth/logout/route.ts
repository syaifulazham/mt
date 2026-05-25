import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteParticipantSession, clearParticipantSessionCookie } from "@/lib/auth/participant-session";

export async function POST() {
  const jar   = await cookies();
  const token = jar.get("pt_session")?.value;
  if (token) await deleteParticipantSession(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearParticipantSessionCookie());
  return res;
}
