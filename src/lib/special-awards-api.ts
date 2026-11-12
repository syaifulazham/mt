import { NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const AWARD_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
export const awardErr = (error: string, message: string, status = 400) => NextResponse.json({ error, message }, { status });

/** Organizer session (writers only when `write`) and the event, or the error response. */
export async function awardGuard(eventId: string, write: boolean) {
  const session = await getOrganizerSession();
  if (!session) return { res: awardErr("UNAUTHORIZED", "Sila log masuk.", 401) };
  if (write && !AWARD_WRITE_ROLES.includes(session.role)) return { res: awardErr("FORBIDDEN", "Tiada kebenaran.", 403) };
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return { res: awardErr("NOT_FOUND", "Acara tidak dijumpai.", 404) };
  return { session };
}

export type AwardInput = {
  name: string; basis: "COMPETITION" | "CUSTOM"; recipientType: "TEAM" | "INDIVIDUAL";
  eventCompetitionId: string | null; method: "TEMPLATE" | "CUSTOM"; templateIds: string[]; places: number;
};

/**
 * Validates an award form. COMPETITION needs one of the event's competitions;
 * TEMPLATE needs COMPETITION and templates assigned to that competition.
 */
export async function parseAwardInput(eventId: string, body: Record<string, unknown>): Promise<{ data: AwardInput } | { res: NextResponse }> {
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!name) return { res: awardErr("NAME_REQUIRED", "Nama anugerah diperlukan.") };
  const basis = body.basis === "CUSTOM" ? "CUSTOM" : "COMPETITION";
  const recipientType = body.recipientType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM";
  const places = Number(body.places ?? 1);
  if (!Number.isInteger(places) || places < 1 || places > 50) return { res: awardErr("INVALID_PLACES", "Bilangan pemenang antara 1 dan 50.") };
  let eventCompetitionId: string | null = null;
  let method: "TEMPLATE" | "CUSTOM" = "CUSTOM";
  let templateIds: string[] = [];
  if (basis === "COMPETITION") {
    const ec = await db.eventCompetition.findFirst({
      where: { id: String(body.eventCompetitionId ?? ""), eventId },
      select: { id: true, competition: { select: { participationType: true } }, judgingTemplates: { select: { judgingTemplateId: true } } },
    });
    if (!ec) return { res: awardErr("COMPETITION_REQUIRED", "Pilih pertandingan.") };
    eventCompetitionId = ec.id;
    if (body.method === "TEMPLATE") {
      // Scores are per team: an individual award of a team competition is picked by hand.
      if (recipientType === "INDIVIDUAL" && ec.competition.participationType !== "INDIVIDUAL")
        return { res: awardErr("INDIVIDUAL_NEEDS_CUSTOM", "Markah dinilai bagi pasukan — anugerah individu bagi pertandingan berpasukan perlu dipilih secara manual.") };
      method = "TEMPLATE";
      const allowed = new Set(ec.judgingTemplates.map(t => t.judgingTemplateId));
      templateIds = [...new Set((Array.isArray(body.templateIds) ? body.templateIds : []).map(String))].filter(id => allowed.has(id));
      if (!templateIds.length) return { res: awardErr("TEMPLATE_REQUIRED", "Pilih sekurang-kurangnya satu templat penghakiman pertandingan ini.") };
    }
  }
  return { data: { name, basis, recipientType, eventCompetitionId, method, templateIds, places } };
}
