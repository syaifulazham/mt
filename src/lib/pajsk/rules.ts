/**
 * PAJSK rules are data, not code: one JSON document per Techlympics year
 * (`pajsk_rules_<year>`, as in Azril's handoff). The organizer's copy lives in
 * app_settings under that key; a bundled `rules/<year>.json` is the default
 * until the organizer saves one. Next year needs a new document only.
 *
 * Decided rules for 2026 (handoff §4 — do not re-decide without the user):
 *   Pelibatan  — every participant: Pelibatan I, Peringkat Kebangsaan = 17
 *   Pencapaian — places 1–5 = 17/16/15/14/13 (Kebangsaan), at any stage
 *   Results shown to 5th place; medals for 1st–3rd only
 *   Certificate colour by highest stage reached; marks always per BSKK
 */
import { z } from "zod";
import { db } from "@/lib/db";
import rules2026 from "./rules/2026.json";

export const STAGES = ["KEBANGSAAN", "NEGERI", "SEKOLAH"] as const;
export type Stage = (typeof STAGES)[number];
/** Highest first. */
export const STAGE_ORDER: Record<Stage, number> = { KEBANGSAAN: 3, NEGERI: 2, SEKOLAH: 1 };

const stageEnum = z.enum(STAGES);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const marks = z.number().int().min(0).max(100);

export const pajskRulesSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  programme: z.string().min(1).max(120),
  reference: z.string().max(200).default(""),
  pelibatan: z.object({ label: z.string().min(1).max(60), level: z.string().min(1).max(60), marks }),
  pencapaian: z.object({
    level: z.string().min(1).max(60),
    marksByPlace: z.record(z.string().regex(/^\d+$/), marks),
  }),
  placesShown: z.number().int().min(1).max(20),
  medals: z.record(z.string().regex(/^\d+$/), z.string().min(1).max(30)),
  stages: z.object({
    KEBANGSAAN: z.object({ label: z.string().min(1).max(60), colour: hex }),
    NEGERI:     z.object({ label: z.string().min(1).max(60), colour: hex }),
    SEKOLAH:    z.object({ label: z.string().min(1).max(60), colour: hex }),
  }),
  /** certificates.meta.distLevel → stage. */
  distLevelStages: z.record(z.string(), stageEnum),
  /**
   * certificates.eventId → stage; overrides distLevel (covers certificates not
   * distributed yet). Keyed by event, not template: one template ("Sijil
   * Penyertaan - Semua Zon") is issued for zone and national events alike.
   */
  eventStages: z.record(z.string(), stageEnum).default({}),
});
export type PajskRules = z.infer<typeof pajskRulesSchema>;

const BUNDLED: Record<number, unknown> = { 2026: rules2026 };

export const rulesKey = (year: number) => `pajsk_rules_${year}`;

/** The year's rules: the organizer's saved copy, else the bundled default, else null. */
export async function getPajskRules(year: number): Promise<PajskRules | null> {
  const row = await db.appSetting.findUnique({ where: { key: rulesKey(year) } });
  if (row) {
    try {
      const parsed = pajskRulesSchema.safeParse(JSON.parse(row.value));
      if (parsed.success && parsed.data.year === year) return parsed.data;
      console.warn(`[pajsk] ${rulesKey(year)} in app_settings is invalid — using the bundled default`);
    } catch {
      console.warn(`[pajsk] ${rulesKey(year)} in app_settings is not JSON — using the bundled default`);
    }
  }
  const bundled = BUNDLED[year];
  return bundled ? pajskRulesSchema.parse(bundled) : null;
}

export async function savePajskRules(rules: PajskRules): Promise<void> {
  const value = JSON.stringify(rules);
  const key = rulesKey(rules.year);
  await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export function pencapaianMarks(rules: PajskRules, place: number | null): number | null {
  if (place == null || place < 1 || place > rules.placesShown) return null;
  return rules.pencapaian.marksByPlace[String(place)] ?? null;
}

export function medalFor(rules: PajskRules, place: number | null): string | null {
  return place == null ? null : rules.medals[String(place)] ?? null;
}

export function placeLabel(place: number): string {
  return place === 1 ? "Tempat Pertama" : `Tempat Ke-${place}`;
}
