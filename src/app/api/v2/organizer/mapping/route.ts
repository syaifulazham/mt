import { NextResponse } from "next/server";
import { getAllClusters } from "@/lib/mapping-db";
import { getOrganizerSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const clusters = getAllClusters();
    return NextResponse.json({ clusters });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load mapping" }, { status: 500 });
  }
}
