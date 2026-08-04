import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = "Techlympics <noreply@techlympics.my>";
const CHUNK = 100;

type Recipient = { email: string; name: string };

export async function POST(req: NextRequest) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { recipients: Recipient[]; subject: string; html: string; scheduledAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recipients, subject, html, scheduledAt } = body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "recipients must be a non-empty array" }, { status: 400 });
  }
  if (!subject?.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!html?.trim()) {
    return NextResponse.json({ error: "html body is required" }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const { data, error } = await resend.batch.send(
      chunk.map((r) => ({
        from: FROM,
        to: [`${r.name} <${r.email}>`],
        subject,
        html,
        ...(scheduledAt ? { scheduledAt } : {}),
      }))
    );
    if (error) {
      failed += chunk.length;
    } else {
      sent += data?.data?.length ?? chunk.length;
    }
  }

  return NextResponse.json({ sent, failed });
}
