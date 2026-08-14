import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { vibeBlocksConfigured, vibeBlocksListEvents } from "@/lib/vibeblocks";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!vibeBlocksConfigured())
    return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });

  try {
    const data = await vibeBlocksListEvents();
    return NextResponse.json({ events: data.events ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    console.error("[vibeblocks] listEvents failed:", err.message, err.body);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch VibeBlocks events" },
      { status: 502 },
    );
  }
}
