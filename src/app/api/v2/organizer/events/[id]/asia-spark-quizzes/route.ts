import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { quizzlyConfigured } from "@/lib/asiaspark-quizzly";
import { quizzlyMonitorOverview, quizzlyMonitorQuiz } from "@/lib/quizzlyMonitor";

export const dynamic = "force-dynamic";

/**
 * GET — Asia Spark Quizzes monitoring.
 *   (no params)      the event's Quizzly competitions, quizzes and registered counts (MT only, fast)
 *   ?ecId&quizId     one quiz: its registered participants with progress and score from Quizzly
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const ecId = req.nextUrl.searchParams.get("ecId");
  const quizId = req.nextUrl.searchParams.get("quizId");
  const noStore = { headers: { "Cache-Control": "no-store" } };

  if (!ecId || !quizId)
    return NextResponse.json({ competitions: await quizzlyMonitorOverview(eventId) }, noStore);

  if (!quizzlyConfigured())
    return NextResponse.json({ error: "Asia Spark Quizzly belum dikonfigurasi (ASIASPARK_QUIZZLY_URL / ASIASPARK_QUIZZLY_API_KEY)." }, { status: 503 });
  try {
    const rows = await quizzlyMonitorQuiz(eventId, ecId, quizId);
    if (!rows) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ rows, fetchedAt: new Date().toISOString() }, noStore);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; name?: string };
    const msg = err.name === "AbortError" ? "Asia Spark Quizzly tidak menjawab dalam masa — cuba muat semula."
      : err.status === 401 || err.status === 403 ? "Kunci API Asia Spark Quizzly ditolak atau tiada skop results:read."
      : (err.message ?? "Sambungan ke Asia Spark Quizzly gagal.");
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
