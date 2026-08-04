import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY is not configured on the server." }, { status: 503 });

  const { to, subject, body } = await req.json();
  if (!to?.trim() || !subject?.trim() || !body?.trim())
    return NextResponse.json({ error: "to, subject, and body are required." }, { status: 400 });

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: "Techlympics <noreply@techlympics.my>",
    to: [to.trim()],
    subject: subject.trim(),
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${body.trim().replace(/\n/g, "<br>")}</div>`,
    text: body.trim(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 422 });
  return NextResponse.json({ id: data?.id });
}
