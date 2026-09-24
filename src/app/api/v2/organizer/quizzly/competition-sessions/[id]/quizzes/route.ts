import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { quizzlyConfigured, quizzlyErrorMessage, quizzlySessionQuizzes } from "@/lib/asiaspark-quizzly";

// GET /api/v2/organizer/quizzly/competition-sessions/[id]/quizzes — quizzes in one session
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!quizzlyConfigured())
    return NextResponse.json({ error: "ASIASPARK_QUIZZLY_API_KEY not found" }, { status: 503 });

  const { id } = await params;

  try {
    const { session: meta, data } = await quizzlySessionQuizzes(id);
    return NextResponse.json({ session: meta, data });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; detail?: string };
    console.error(`[quizzly] sessionQuizzes failed for ${id}:`, err.message, "| upstream:", err.detail ?? "—");
    if (err.status === 404) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: quizzlyErrorMessage(err) }, { status: err.status ?? 422 });
  }
}
