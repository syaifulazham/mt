import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSlotConflict, planUndatedSubmissions } from "@/lib/walkin-slot-server";

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

// POST { apply?: boolean } — date helper for pending borang entries with no date
// ("Tiada tarikh"). Without `apply` it only returns the plan; with `apply` it
// recomputes the plan and saves it. See planUndatedSubmissions for the rules.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const apply = body.apply === true;
  if (apply && !WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const plan = await planUndatedSubmissions(id);
  if (!apply) return NextResponse.json({ data: plan });

  let updated = 0;
  let skipped = 0;
  for (const p of plan) {
    if (!p.slotDate) { skipped++; continue; }
    try {
      // Only entries still pending and still undated, in case they changed since the plan was made.
      const r = await db.walkInFormSubmission.updateMany({
        where: { id: p.id, status: "PENDING", slotDate: "" },
        data: { slotDate: p.slotDate },
      });
      updated += r.count;
    } catch (e) {
      if (!isSlotConflict(e)) throw e;
      skipped++;
    }
  }
  return NextResponse.json({ data: { updated, skipped } });
}
