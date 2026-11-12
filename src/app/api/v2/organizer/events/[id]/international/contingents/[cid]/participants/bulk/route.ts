import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadForeignContingent, normalisePassport, parseForeignParticipant, requireInternationalAdmin } from "@/lib/international";
import {
  BULK_ERROR_LABEL, BULK_MAX_ROWS, aiCandidates, candidateFrom, candidatesFromRows, mapHeaders, mappingUsable, type BulkCandidate,
} from "@/lib/international-bulk";

type Params = { params: Promise<{ id: string; cid: string }> };

/** Each candidate checked as the form would be, plus duplicate passports (in the school, or earlier in the list). */
async function check(cid: string, list: BulkCandidate[]) {
  const existing = new Set((await db.participant.findMany({
    where: { contingentId: cid, passport: { not: null } }, select: { passport: true },
  })).map(p => p.passport!));
  const seen = new Set<string>();
  return list.map((input, index) => {
    const parsed = parseForeignParticipant(input);
    let error = "error" in parsed ? parsed.error : null;
    if (!error && "data" in parsed) {
      const pp = parsed.data.passport;
      if (existing.has(pp)) error = "DUPLICATE_PASSPORT";
      else if (seen.has(pp)) error = "DUPLICATE_IN_FILE";
      seen.add(pp);
    } else if (input.passport) seen.add(normalisePassport(input.passport));
    return { index, input, error, message: error ? BULK_ERROR_LABEL[error] ?? error : null, parsed };
  });
}

/**
 * POST — bulk registration of a foreign school's participants.
 *
 * { action: "preview", rows?, text?, useAi? } — map the uploaded rows by their
 *   headers (or, when the headers can't be matched / useAi, let Gemini read
 *   `text`) and return every row with its validation result. Nothing is saved.
 * { action: "import", participants: BulkCandidate[] } — save the valid ones;
 *   rows that fail validation or repeat a passport are skipped and listed.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireInternationalAdmin();
  if ("error" in guard) return guard.error;
  const { cid } = await params;
  const found = await loadForeignContingent(cid);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => ({})) as {
    action?: string; rows?: Record<string, unknown>[]; text?: string; useAi?: boolean; participants?: Partial<BulkCandidate>[];
  };

  if (body.action === "import") {
    const list = (Array.isArray(body.participants) ? body.participants : []).slice(0, BULK_MAX_ROWS).map(p => candidateFrom(p));
    const checked = await check(cid, list);
    const ok = checked.flatMap(c => (!c.error && "data" in c.parsed ? [c.parsed.data] : []));
    if (ok.length) await db.participant.createMany({ data: ok.map(d => ({ ...d, contingentId: cid })) });
    return NextResponse.json({
      created: ok.length,
      skipped: checked.filter(c => c.error).map(c => ({ name: c.input.name || "(tanpa nama)", message: c.message })),
    });
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, BULK_MAX_ROWS) : [];
  const headers = [...new Set(rows.flatMap(r => Object.keys(r ?? {})))];
  const mapping = mapHeaders(headers);
  let candidates: BulkCandidate[] = [];
  let usedAi = false;
  if (!body.useAi && rows.length && mappingUsable(mapping)) {
    candidates = candidatesFromRows(rows, mapping);
  } else {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "EMPTY", message: "Tiada data untuk dibaca." }, { status: 400 });
    const ai = await aiCandidates(text);
    if (!ai) return NextResponse.json({ error: "AI_FAILED", message: "Pembantu AI tidak dapat membaca data ini. Gunakan fail dengan lajur bertajuk (Nama, Pasport, Tarikh lahir, Jantina…)." }, { status: 422 });
    candidates = ai;
    usedAi = true;
  }
  if (!candidates.length) return NextResponse.json({ error: "EMPTY", message: "Tiada peserta dijumpai dalam data ini." }, { status: 400 });

  const checked = await check(cid, candidates);
  return NextResponse.json({
    usedAi, mapping,
    rows: checked.map(({ index, input, error, message }) => ({ index, input, error, message })),
  });
}
