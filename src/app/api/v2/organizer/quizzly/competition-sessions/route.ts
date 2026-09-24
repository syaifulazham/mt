import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { quizzlyConfigured, quizzlyErrorMessage, quizzlyListSessions } from "@/lib/asiaspark-quizzly";

// GET /api/v2/organizer/quizzly/competition-sessions — sessions available to link
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!quizzlyConfigured())
    return NextResponse.json({ error: "ASIASPARK_QUIZZLY_API_KEY not found" }, { status: 503 });

  try {
    return NextResponse.json({ data: await quizzlyListSessions() });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error("[quizzly] listSessions failed:", err.message, "| upstream:", err.detail ?? "—");
    return NextResponse.json({ error: quizzlyErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
