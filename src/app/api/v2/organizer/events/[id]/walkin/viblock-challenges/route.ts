import { NextResponse } from "next/server";
import { viblockConfigured, viblockGetChallenges } from "@/lib/viblock";

export async function GET() {
  if (!viblockConfigured()) {
    return NextResponse.json({ error: "VIBLOCK_NOT_CONFIGURED" }, { status: 400 });
  }

  try {
    const data = await viblockGetChallenges();
    return NextResponse.json({ challenges: data?.challenges ?? [] });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; body?: unknown };
    console.error("[viblock] getChallenges failed:", err.message, "status:", err.status, "body:", err.body);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch challenges", viblockStatus: err.status, detail: err.body },
      { status: 502 },
    );
  }
}
