import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { droneConfigured, droneListChallenges } from "@/lib/drone";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!droneConfigured())
    return NextResponse.json({ error: "DRONE_NOT_CONFIGURED" }, { status: 400 });

  try {
    const data = await droneListChallenges();
    return NextResponse.json({ challenges: data?.challenges ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    console.error("[drone] listChallenges failed:", err.message, err.body);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch drone challenges" },
      { status: 502 },
    );
  }
}
