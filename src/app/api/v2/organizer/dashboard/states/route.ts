import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const states = await db.state.findMany({ orderBy: { name: "asc" } });

  const counts = await Promise.all(
    states.map((state) =>
      db.participant.count({
        where: {
          contingent: {
            OR: [
              { stateId: state.id },
              { school: { stateId: state.id } },
            ],
          },
        },
      })
    )
  );

  const data = states.map((state, i) => ({
    id: state.id,
    name: state.name,
    code: state.code,
    participantCount: counts[i],
  }));

  return NextResponse.json({ data });
}
