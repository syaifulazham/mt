import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { managerMaySee, participantMaySee } from "@/lib/pajsk/access";
import { refreshRow, rowToEntry } from "@/lib/pajsk/entries";
import { pajskFilename, renderPajskPdf, verifyUrlFor } from "@/lib/pajsk/render";
import { publicOrigin } from "@/lib/pajsk/http";

export const dynamic = "force-dynamic";

/**
 * GET — a PAJSK certificate, rendered in memory (never written to disk).
 * Access: organizers; the participant it belongs to; a manager of that
 * participant's contingent — each subject to the PAJSK (Beta) access switch.
 * The id is the row id, not the verification code, and no name or IC is in the URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await db.pajskCertificate.findUnique({ where: { id }, select: { participantId: true } });
  if (!stored) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!(await isAllowed(stored.participantId))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Re-derive first so the PDF never prints marks the certificates no longer support.
  const fresh = await refreshRow(id);
  if (!fresh?.rules) return NextResponse.json({ error: "NO_RULES" }, { status: 409 });
  if (fresh.row.status !== "VALID") return NextResponse.json({ error: "WITHDRAWN" }, { status: 410 });

  const entry = rowToEntry(fresh.rules, fresh.row);
  const bytes = await renderPajskPdf(entry, fresh.rules, verifyUrlFor(entry.code, publicOrigin(req)));
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${pajskFilename(fresh.rules, entry)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function isAllowed(participantId: string): Promise<boolean> {
  if (await getOrganizerSession()) return true;

  const participant = await getParticipantSession();
  if (participant && participant.participantId === participantId && await participantMaySee(participant.contingentId))
    return true;

  const { userId } = await clerkAuth();
  if (!userId) return false;
  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    select: { email: true, contingentManagers: { where: { status: "ACTIVE" }, select: { contingentId: true } } },
  });
  if (!manager || !(await managerMaySee(manager.email))) return false;
  const p = await db.participant.findUnique({ where: { id: participantId }, select: { contingentId: true } });
  return !!p && manager.contingentManagers.some(c => c.contingentId === p.contingentId);
}
