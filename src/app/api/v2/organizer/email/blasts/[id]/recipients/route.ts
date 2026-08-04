import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const recipients = await db.emailBlastRecipient.findMany({
    where: { blastId: id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ recipients });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { recipients } = await req.json() as {
    recipients: Array<{ email: string; name: string; meta?: string }>;
  };

  if (!Array.isArray(recipients) || recipients.length === 0)
    return NextResponse.json({ error: "recipients array is required" }, { status: 400 });

  // Upsert — skip duplicates (same blast + email)
  await db.emailBlastRecipient.createMany({
    data: recipients.map((r) => ({
      blastId: id,
      email:   r.email.trim(),
      name:    r.name.trim(),
      meta:    r.meta ?? null,
    })),
    skipDuplicates: true,
  });

  const count = await db.emailBlastRecipient.count({ where: { blastId: id } });
  return NextResponse.json({ count });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Delete all recipients for this blast (clear all)
  await db.emailBlastRecipient.deleteMany({ where: { blastId: id } });
  return NextResponse.json({ ok: true });
}
