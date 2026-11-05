import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { vibeBlocksConfigured, vibeBlocksListEvents } from "@/lib/vibeblocks";
import { asGameProvider, gameLabel } from "@/lib/game-provider";

// GET ?provider=vibeblocks|techtriathlon — events on that game platform.
export async function GET(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const p = asGameProvider(req.nextUrl.searchParams.get("provider"));

  if (!vibeBlocksConfigured(p))
    return NextResponse.json({ error: "VIBEBLOCKS_NOT_CONFIGURED" }, { status: 400 });

  try {
    const data = await vibeBlocksListEvents(p);
    return NextResponse.json({ events: data.events ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    console.error(`[${p}] listEvents failed:`, err.message, err.body);
    return NextResponse.json(
      { error: err.message ?? `Failed to fetch ${gameLabel(p)} events` },
      { status: 502 },
    );
  }
}
