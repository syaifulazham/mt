import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { CHUNKS, FORMATS, SORTS, loadKeyed, parseDownloadParams, planOf, type CertSort, type ChunkBy, type ZipFormat } from "@/lib/certificates/bulk-download";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const PURPOSES = ["PRINT", "SOFTCOPY", "ARCHIVE", "OTHER"] as const;
type Purpose = (typeof PURPOSES)[number];
type Advice = { format: ZipFormat; chunkBy: ChunkBy; sort: CertSort; reason: string; tips: string[]; source: "ai" | "rules" };

const SYSTEM = `You advise an event organizer on how to bulk-download competition certificates as ZIP files from a web app. Reply in Bahasa Melayu.

How the download works:
- "format" = how PDFs are arranged inside a ZIP:
  - "single": one PDF per certificate. Largest output (every PDF carries the template background) and slowest; right only when each recipient needs their own file (e.g. e-mailing individually).
  - "competition" / "state" / "contingent": one multi-page PDF per competition / state / contingent (contingent PDFs sit in a folder per state). Much smaller and faster; right for printing or for handing a school / state its certificates.
- "chunkBy" = splitting the download into several ZIP files, downloaded one after another: "none" (one ZIP), "state", "contingent", "competition", "targetGroup".
- Each ZIP is rendered on demand while it streams. One very large ZIP (several thousand certificates, or thousands of single PDFs) can take many minutes and may be cut off by a network timeout; splitting makes each part short and restartable.
- Too many ZIPs is also bad: a browser asks permission for multiple downloads and the user has many files to handle. Aim for roughly 2–30 ZIPs; avoid more than ~60.
- "sort" = the order of the certificates: the pages inside each multi-page PDF and the files inside a ZIP:
  - "competition": competition, then state, rank, contingent — results order.
  - "contingent": state, then contingent (school), competition, rank, name — each school's certificates together, ready to stack and hand out.
  - "name": recipient name A–Z — easy to find or send one person's own certificate.
  - "serial": serial number — issue order, for a complete record.
- Chunking by the same dimension as the format (e.g. format "state" + chunkBy "state") gives ZIPs holding a single PDF — acceptable but usually pointless; prefer a finer format inside a coarser chunk (e.g. chunkBy "state" + format "contingent").

The organizer states what the download is for — let that decide first, then fit it to the numbers:
- PRINT (percetakan): the files go to a printer / print vendor. Multi-page PDFs are best (few files, pages in order); group them the way the printed stacks will be sorted and handed out (usually by contingent, or by state for a state-level handover). Never "single". Sort "contingent" so each school's pages come out together (or "competition" when certificates are handed out per competition, e.g. at a prize-giving).
- SOFTCOPY (edaran salinan lembut): files are sent on to recipients. If each person should receive only their own certificate, "single" is needed — then split so no ZIP is huge; if schools / coordinators receive and forward them, one PDF per contingent, split by state, is easier. Sort "name" for individual files (easy to look up a person), "contingent" when schools forward them.
- ARCHIVE (simpanan fail): a complete, tidy record. Favour few, well-named files — one PDF per competition or per state — in one ZIP when the size allows, otherwise split coarsely. Sort "serial" (issue order) or "competition".
- OTHER: follow the organizer's note.

Choose the best "format", "chunkBy" and "sort" for that purpose and the numbers given.
Return ONLY JSON: {"format": "single"|"competition"|"state"|"contingent", "chunkBy": "none"|"state"|"contingent"|"competition"|"targetGroup", "sort": "competition"|"contingent"|"name"|"serial", "reason": string, "tips": string[]}
"reason": 1–2 sentences naming the numbers that decided it. "tips": 1–3 short practical tips (may be empty).`;

/** Deterministic advice, used when the AI is unavailable. */
function rules(s: { total: number; states: number; contingents: number; competitions: number; targetGroups: number }, purpose: Purpose): Advice {
  const grouped: ZipFormat = s.contingents > 1 ? "contingent" : s.competitions > 1 ? "competition" : "single";
  const format: ZipFormat = purpose === "ARCHIVE" ? (s.competitions > 1 ? "competition" : s.states > 1 ? "state" : grouped) : grouped;
  const sort: CertSort = purpose === "PRINT" ? "contingent"
    : purpose === "SOFTCOPY" ? (format === "single" ? "name" : "contingent")
    : purpose === "ARCHIVE" ? "serial" : "competition";
  const chunkBy: ChunkBy = s.total <= 800 ? "none" : s.states > 1 && s.states <= 40 ? "state" : s.competitions > 1 && s.competitions <= 40 ? "competition" : "none";
  return {
    format, chunkBy, sort, source: "rules",
    reason: s.total <= 800
      ? `${s.total} sijil boleh dimuat turun sebagai satu ZIP; satu PDF bagi setiap ${format === "contingent" ? "kontinjen" : format === "competition" ? "pertandingan" : "sijil"} memudahkan pengedaran.`
      : `${s.total} sijil adalah banyak untuk satu ZIP — dipecahkan kepada ${chunkBy === "state" ? `${s.states} ZIP mengikut negeri` : chunkBy === "competition" ? `${s.competitions} ZIP mengikut pertandingan` : "satu ZIP"} supaya setiap bahagian pendek dan boleh diulang.`,
    tips: ["Elakkan format “Satu PDF setiap sijil” melainkan setiap penerima memerlukan fail sendiri — saiznya jauh lebih besar."],
  };
}

// POST { purpose: PRINT | SOFTCOPY | ARCHIVE | OTHER, note? } (same query as
// ../download) — Pembantu AI: the format and split that suit what the download
// is for and this job's numbers, with the reason. Falls back to fixed rules.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const job = await db.certGeneratorJob.findUnique({ where: { id }, select: { templateId: true, source: true } });
  if (!job) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { filters } = parseDownloadParams(req.nextUrl.searchParams);
  const body = await req.json().catch(() => ({})) as { purpose?: string; note?: string };
  const purpose: Purpose = (PURPOSES as readonly string[]).includes(body.purpose ?? "") ? body.purpose as Purpose : "OTHER";
  const note = String(body.note ?? "").trim().slice(0, 400);
  const all = await loadKeyed(id, filters.q);
  const plan = planOf(all, filters, "single", "none");
  const rows = (dim: "state" | "targetGroup" | "competition") => planOf(all, filters, "single", dim).chunks;
  const byState = rows("state"), byGroup = rows("targetGroup"), byComp = rows("competition");
  const contingents = planOf(all, filters, "contingent", "none").files;
  const stats = { total: plan.total, states: byState.length, contingents, competitions: byComp.length, targetGroups: byGroup.length };
  if (!plan.total) return NextResponse.json({ error: "Tiada sijil untuk dimuat turun." }, { status: 404 });

  const fallback = rules(stats, purpose);
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ advice: fallback, stats });
  try {
    const top = (list: { label: string; certs: number }[], n = 8) =>
      [...list].sort((a, b) => b.certs - a.certs).slice(0, n).map(c => `${c.label}: ${c.certs}`).join("; ");
    const template = await db.certTemplate.findUnique({ where: { id: job.templateId }, select: { name: true } });
    const prompt = [
      `Purpose of the download: ${purpose}${note ? ` — organizer's note: "${note}"` : ""}.`,
      `Template: ${template?.name ?? "—"} (source: ${job.source}).`,
      `Certificates to download (after the current filters): ${plan.total}.`,
      `States: ${byState.length} — largest: ${top(byState)}.`,
      `Contingents (schools): ${contingents} — about ${Math.round(plan.total / Math.max(1, contingents))} certificates each.`,
      `Competitions: ${byComp.length} — largest: ${top(byComp)}.`,
      `Target groups: ${byGroup.length} — ${top(byGroup)}.`,
      `Active filters: ${[filters.q && `search "${filters.q}"`, filters.states.length && `${filters.states.length} state(s)`, filters.targetGroups.length && `${filters.targetGroups.length} target group(s)`, filters.competitions.length && `${filters.competitions.length} competition(s)`].filter(Boolean).join(", ") || "none"}.`,
    ].join("\n");
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
      model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json", temperature: 0.2 }, systemInstruction: SYSTEM,
    });
    const res = await model.generateContent(prompt);
    const raw = JSON.parse(res.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as Partial<Advice>;
    if (!(FORMATS as readonly string[]).includes(raw.format ?? "") || !(CHUNKS as readonly string[]).includes(raw.chunkBy ?? "")) throw new Error("bad advice");
    const advice: Advice = {
      format: raw.format as ZipFormat, chunkBy: raw.chunkBy as ChunkBy,
      // The purpose's rule-based order when the model leaves it out.
      sort: (SORTS as readonly string[]).includes(raw.sort ?? "") ? raw.sort as CertSort : fallback.sort,
      source: "ai",
      reason: String(raw.reason ?? "").slice(0, 600),
      tips: (Array.isArray(raw.tips) ? raw.tips : []).map(t => String(t).slice(0, 240)).slice(0, 3),
    };
    return NextResponse.json({ advice, stats });
  } catch (e) {
    console.error("[certificates] download advice failed:", e);
    return NextResponse.json({ advice: fallback, stats });
  }
}
