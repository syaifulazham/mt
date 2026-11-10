import type { CriterionType } from "@prisma/client";

/**
 * Which judging templates can hold an Eptim CSI competition's results, and how
 * each criterion is filled by "Selaraskan keputusan CSI" (src/lib/csi-score-sync.ts).
 * Pure — shared by the server and the organizer's review dialog.
 *
 * A template fits when it has only NUMBER / TIME criteria and:
 *   - either one NUMBER criterion per configured case, each naming its case
 *     (e.g. "Skor: Misteri Dapur Restoran"), or a single NUMBER criterion that
 *     takes the total over every case;
 *   - at most one TIME criterion, which takes the total duration of the runs
 *     whose scores were taken.
 * Rankings sum every NUMBER criterion, so both shapes rank by total score,
 * ties going to the shorter total time.
 */

export type CsiCaseInfo = { id: string; slug: string; title: string; maxScore: number | null };

export type CsiTemplateCriterion = {
  id?: string; name: string; type: CriterionType; order: number;
  minScore: number | null; maxScore: number | null; maxTime: number | null;
};

export type CsiCriterionSource =
  | { kind: "case"; caseId: string; caseTitle: string }
  | { kind: "total" }
  | { kind: "time" };

export type CsiTemplateMapping =
  | { ok: true; mode: "per-case" | "total"; criteria: (CsiTemplateCriterion & { source: CsiCriterionSource })[] }
  | { ok: false; reason: string };

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Prefix words a criterion may put before the case name ("Skor: …", "Markah kes …"). */
const PREFIX = /^(?:(?:skor|markah|mata|score|points?|kes|case|jumlah|total)\s+)+/;

/** Does the criterion name refer to this case? */
function namesCase(criterionName: string, c: CsiCaseInfo): boolean {
  const n = norm(criterionName);
  const title = norm(c.title), slug = norm(c.slug);
  if (n.includes(title) || n.includes(slug)) return true;
  const rest = n.replace(PREFIX, "");
  return rest.length >= 6 && (title.includes(rest) || slug.includes(rest));
}

export function csiTemplateMapping(criteria: CsiTemplateCriterion[], cases: CsiCaseInfo[]): CsiTemplateMapping {
  if (cases.length === 0) return { ok: false, reason: "Tiada kes CSI dipilih untuk pertandingan ini" };
  const sorted = [...criteria].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return { ok: false, reason: "Templat tiada kriteria" };
  const options = sorted.filter(c => c.type !== "NUMBER" && c.type !== "TIME");
  if (options.length) return { ok: false, reason: `Kriteria "${options[0].name}" jenis pilihan — tidak boleh diisi daripada CSI` };
  const numbers = sorted.filter(c => c.type === "NUMBER");
  const times = sorted.filter(c => c.type === "TIME");
  if (numbers.length === 0) return { ok: false, reason: "Tiada kriteria skor (NUMBER)" };
  if (times.length > 1) return { ok: false, reason: `${times.length} kriteria masa (maksimum 1)` };
  const negative = numbers.find(c => c.minScore != null && c.minScore > 0);
  if (negative) return { ok: false, reason: `"${negative.name}" bermula pada ${negative.minScore} (perlu 0)` };

  // Per case: every NUMBER criterion names exactly one case, every case named once.
  const matches = numbers.map(n => cases.filter(c => namesCase(n.name, c)));
  const perCase = numbers.length === cases.length
    && matches.every(m => m.length === 1)
    && new Set(matches.map(m => m[0].id)).size === cases.length;

  let mode: "per-case" | "total";
  const sources = new Map<CsiTemplateCriterion, CsiCriterionSource>();
  if (perCase) {
    mode = "per-case";
    for (let i = 0; i < numbers.length; i++) {
      const c = matches[i][0];
      if (numbers[i].maxScore != null && c.maxScore != null && numbers[i].maxScore! < c.maxScore)
        return { ok: false, reason: `"${numbers[i].name}" maksimum ${numbers[i].maxScore} (kes ini /${c.maxScore})` };
      sources.set(numbers[i], { kind: "case", caseId: c.id, caseTitle: c.title });
    }
  } else if (numbers.length === 1) {
    mode = "total";
    const sum = cases.every(c => c.maxScore != null) ? cases.reduce((s, c) => s + c.maxScore!, 0) : null;
    if (numbers[0].maxScore != null && sum != null && numbers[0].maxScore < sum)
      return { ok: false, reason: `"${numbers[0].name}" maksimum ${numbers[0].maxScore} (jumlah kes /${sum})` };
    sources.set(numbers[0], { kind: "total" });
  } else {
    const unnamed = numbers.find((_, i) => matches[i].length !== 1);
    return {
      ok: false,
      reason: unnamed
        ? `${numbers.length} kriteria skor, tetapi "${unnamed.name}" tidak menamakan tepat satu kes`
        : `${numbers.length} kriteria skor untuk ${cases.length} kes`,
    };
  }
  if (times[0]) sources.set(times[0], { kind: "time" });
  return { ok: true, mode, criteria: sorted.map(c => ({ ...c, source: sources.get(c)! })) };
}

export function csiSourceLabel(s: CsiCriterionSource): string {
  return s.kind === "case" ? `skor kes "${s.caseTitle}"` : s.kind === "total" ? "jumlah skor semua kes" : "jumlah masa larian";
}

export type CsiTemplateDraft = {
  name: string; code: string; description: string;
  criterions: { name: string; type: "NUMBER" | "TIME"; minScore: number | null; maxScore: number | null; maxTime: number | null }[];
};

export const csiTemplateCode = (competitionCode: string) =>
  `CSI-${competitionCode.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** The default template for these cases: a score per case, plus total time. */
export function csiDefaultDraft(opts: { competitionCode: string; competitionName: string; csiName: string | null; cases: CsiCaseInfo[] }): CsiTemplateDraft {
  const { cases } = opts;
  return {
    name: `Eptim CSI — ${opts.competitionName}`,
    code: csiTemplateCode(opts.competitionCode),
    description: `Keputusan Eptim CSI${opts.csiName ? ` (${opts.csiName})` : ""}: skor larian rasmi bagi ${cases.length > 1 ? "setiap kes" : "kes"} dan jumlah masa. Kedudukan: jumlah skor tertinggi, kemudian masa terpendek.`,
    criterions: [
      ...cases.map(c => ({ name: `Skor: ${c.title}`, type: "NUMBER" as const, minScore: 0, maxScore: c.maxScore, maxTime: null })),
      { name: "Masa Rasmi", type: "TIME" as const, minScore: null, maxScore: null, maxTime: 4 * 3600 * cases.length },
    ],
  };
}

/** A draft's criteria in the shape csiTemplateMapping takes. */
export const draftCriteria = (d: CsiTemplateDraft): CsiTemplateCriterion[] =>
  d.criterions.map((c, i) => ({ ...c, order: i }));
