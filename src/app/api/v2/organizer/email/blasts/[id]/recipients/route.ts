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

  // Enrich recipients with user type / contingent / state / event details
  const emails = [...new Set(recipients.map(r => r.email.toLowerCase()))];

  const [managers, organizers] = await Promise.all([
    db.managerProfile.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      include: {
        contingentManagers: {
          where: { status: "ACTIVE" },
          include: {
            contingent: {
              include: {
                state: { select: { name: true } },
                school: { include: { state: { select: { name: true } } } },
                higherInstitution: { include: { state: { select: { name: true } } } },
                teams: {
                  include: {
                    teamEvents: { include: { event: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.organizerUser.findMany({
      where: { email: { in: emails, mode: "insensitive" }, isActive: true },
      select: { email: true },
    }),
  ]);

  const orgSet = new Set(organizers.map(o => o.email.toLowerCase()));
  const mgrMap = new Map(managers.map(m => [m.email.toLowerCase(), m]));

  const enriched = recipients.map(r => {
    const email = r.email.toLowerCase();
    const mgr = mgrMap.get(email);
    if (mgr) {
      const contingents = mgr.contingentManagers.map(cm => cm.contingent.name);
      const states = [...new Set(
        mgr.contingentManagers
          .map(cm => cm.contingent.state?.name ?? cm.contingent.school?.state?.name ?? cm.contingent.higherInstitution?.state?.name ?? null)
          .filter((s): s is string => s !== null),
      )];
      const events = [...new Set(
        mgr.contingentManagers.flatMap(cm =>
          cm.contingent.teams.flatMap(t => t.teamEvents.map(te => te.event.name)),
        ),
      )];
      return {
        ...r,
        userType:   "manager" as const,
        contingent: contingents.join(", ") || null,
        state:      states.join(", ") || null,
        event:      events.join(", ") || null,
      };
    }
    if (orgSet.has(email)) {
      return { ...r, userType: "organizer" as const, contingent: null, state: null, event: null };
    }
    return { ...r, userType: "custom" as const, contingent: null, state: null, event: null };
  });

  return NextResponse.json({ recipients: enriched });
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
