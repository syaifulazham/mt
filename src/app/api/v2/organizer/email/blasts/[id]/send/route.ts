import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Resend } from "resend";
import { buildEmailHtml } from "@/lib/email/templates";

const FROM   = "Techlympics <noreply@techlympics.my>";
const CHUNK  = 100;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let scope: "all" | "pending" | "resend" = "all";
  try {
    const body = await req.json();
    if (body?.scope === "pending" || body?.scope === "resend") scope = body.scope;
  } catch { /* empty body → default scope */ }

  const { id } = await params;
  const blast  = await db.emailBlast.findUnique({
    where: { id },
    include: { recipients: true },
  });

  if (!blast)            return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!blast.subject)    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!blast.htmlBody)   return NextResponse.json({ error: "Email body is required" }, { status: 400 });
  if (blast.recipients.length === 0) return NextResponse.json({ error: "No recipients" }, { status: 400 });

  const fullHtml = buildEmailHtml(blast.htmlBody, blast.includeHeader ?? true, blast.includeFooter ?? true);

  // Atomically reset state before starting — prevents stale sentCount if request is cancelled mid-flight
  if (scope === "resend") {
    await db.$transaction([
      db.emailBlastRecipient.updateMany({
        where: { blastId: id },
        data: { status: "PENDING", sentAt: null },
      }),
      db.emailBlast.update({
        where: { id },
        data: { status: "IN_PROGRESS", sentCount: 0 },
      }),
    ]);
  } else {
    await db.emailBlast.update({
      where: { id },
      data: { status: "IN_PROGRESS", sentCount: 0 },
    });
  }

  // Re-fetch recipients AFTER the reset so targets reflects the current PENDING set
  const fresh = await db.emailBlastRecipient.findMany({ where: { blastId: id } });

  const targets = scope === "pending"
    ? fresh.filter(r => r.status === "PENDING" || r.status === "FAILED")
    : fresh;

  if (targets.length === 0)
    return NextResponse.json({ error: "No pending recipients" }, { status: 400 });

  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
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
      await db.emailBlastRecipient.updateMany({
        where: { id: { in: chunk.map(r => r.id) } },
        data: { status: "FAILED" },
      });
    } else {
      sent += data?.data?.length ?? chunk.length;
      await db.emailBlastRecipient.updateMany({
        where: { id: { in: chunk.map(r => r.id) } },
        data: { status: "SENT", sentAt: new Date() },
      });
    }
    // Update progress after each chunk so the poller can read it
    await db.emailBlast.update({
      where: { id },
      data: { sentCount: sent },
    });
  }

  await db.emailBlast.update({
    where: { id },
    data: {
      sentAt: new Date(),
      sentCount: sent,
      status: "COMPLETED",
    },
  });

  return NextResponse.json({ sent, failed });
}
