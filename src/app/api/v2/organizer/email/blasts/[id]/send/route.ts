import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Resend } from "resend";
import { buildEmailHtml } from "@/lib/email/templates";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM   = "Techlympics <noreply@techlympics.my>";
const CHUNK  = 100;

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const blast  = await db.emailBlast.findUnique({
    where: { id },
    include: { recipients: true },
  });

  if (!blast)            return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!blast.subject)    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!blast.htmlBody)   return NextResponse.json({ error: "Email body is required" }, { status: 400 });
  if (blast.recipients.length === 0) return NextResponse.json({ error: "No recipients" }, { status: 400 });

  const fullHtml = buildEmailHtml(blast.htmlBody, blast.includeHeader, blast.includeFooter);

  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < blast.recipients.length; i += CHUNK) {
    const chunk = blast.recipients.slice(i, i + CHUNK);
    const { data, error } = await resend.batch.send(
      chunk.map(r => ({
        from:    FROM,
        to:      [`${r.name} <${r.email}>`],
        subject: blast.subject!,
        html:    fullHtml,
        ...(blast.scheduledAt ? { scheduledAt: blast.scheduledAt.toISOString() } : {}),
      }))
    );
    if (error) {
      failed += chunk.length;
    } else {
      sent += data?.data?.length ?? chunk.length;
    }
  }

  await db.emailBlast.update({
    where: { id },
    data: {
      sentAt:    new Date(),
      sentCount: sent,
      status:    "COMPLETED",
    },
  });

  return NextResponse.json({ sent, failed });
}
