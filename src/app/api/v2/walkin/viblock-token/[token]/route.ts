import { NextRequest, NextResponse } from "next/server";
import { viblockConfigured, viblockGetToken } from "@/lib/viblock";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!viblockConfigured()) {
    return NextResponse.json({ error: "VIBLOCK_NOT_CONFIGURED" }, { status: 400 });
  }

  const { token } = await params;

  try {
    const data = await viblockGetToken(token);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch token info" },
      { status: err.status ?? 502 },
    );
  }
}
