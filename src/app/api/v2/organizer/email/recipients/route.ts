import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireOrganizerRole("SUPER_ADMIN", "ADMIN");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q") ?? "";
  const stateId = searchParams.get("stateId") ?? "";
  const eventId = searchParams.get("eventId") ?? "";

  if (type === "events") {
    const events = await db.event.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { startDate: "desc" },
      take: 50,
    });
    return NextResponse.json({ events });
  }

  if (type === "managers") {
    const managers = await db.contingentManager.findMany({
      where: {
        status: "ACTIVE",
        manager: q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : undefined,
        contingent: stateId
          ? { OR: [{ stateId }, { school: { stateId } }, { higherInstitution: { stateId } }] }
          : undefined,
      },
      include: {
        manager: { select: { email: true, name: true } },
        contingent: { select: { name: true } },
      },
      take: 500,
    });

    const recipients = managers.map((m) => ({
      email: m.manager.email,
      name: m.manager.name,
      meta: m.contingent.name,
    }));

    return NextResponse.json({ recipients });
  }

  // Contingent managers filtered by event — contingent must have ≥1 team in that event
  if (type === "event") {
    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const managers = await db.contingentManager.findMany({
      where: {
        status: "ACTIVE",
        contingent: {
          teams: { some: { teamEvents: { some: { eventId } } } },
        },
        ...(q
          ? {
              manager: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        manager: { select: { email: true, name: true } },
        contingent: { select: { name: true } },
      },
      distinct: ["managerId"],
      take: 500,
    });

    const recipients = managers.map((m) => ({
      email: m.manager.email,
      name: m.manager.name,
      meta: m.contingent.name,
    }));

    return NextResponse.json({ recipients });
  }

  return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
}
