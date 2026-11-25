import type { CriterionType } from "@prisma/client";

/**
 * Which judging templates can hold an Asia Spark Quizzly competition's results,
 * and how each criterion is filled by "Sync ke penghakiman MT"
 * (src/lib/quiz-score-sync.ts). Pure — shared by the server and the organizer's
 * review dialog.
 *
 * One event-competition can run several quizzes (one per darjah / target
 * group) with different question counts, so scores are carried as the quiz
 * percentage, which compares across them. A template fits when it has only
 * NUMBER / TIME criteria and:
 *   - at least one NUMBER criterion starting at 0. Each takes the quiz
 *     percentage scaled to its maximum (a weight: maxScore 70 → 70 % of the
 *     marks), or 0–100 when it has no maximum — except one whose name says
 *     "betul" / "correct", which takes the share of questions answered
 *     correctly scaled to its maximum, or the plain count when it has none;
 *   - at most one TIME criterion, which takes the time spent answering
 *     (rankings use it to break ties when it gives no marks).
 */

export type QuizTemplateCriterion = {
  id?: string; name: string; type: CriterionType; order: number;
  minScore: number | null; maxScore: number | null; maxTime: number | null; timePrecision?: number;
};

export type QuizCriterionSource =
  | { kind: "percent"; max: number }
  | { kind: "correct"; max: number | null }
  | { kind: "time" };

export type QuizTemplateMapping =
  | { ok: true; criteria: (QuizTemplateCriterion & { source: QuizCriterionSource })[] }
  | { ok: false; reason: string };

const CORRECT = /\b(betul|correct)\b/i;

export function quizTemplateMapping(criteria: QuizTemplateCriterion[]): QuizTemplateMapping {
  const sorted = [...criteria].sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return { ok: false, reason: "Templat tiada kriteria" };
  const option = sorted.find(c => c.type !== "NUMBER" && c.type !== "TIME");
  if (option) return { ok: false, reason: `Kriteria "${option.name}" jenis pilihan — tidak boleh diisi daripada kuiz` };
  const numbers = sorted.filter(c => c.type === "NUMBER");
  const times = sorted.filter(c => c.type === "TIME");
  if (numbers.length === 0) return { ok: false, reason: "Tiada kriteria skor (NUMBER)" };
  if (times.length > 1) return { ok: false, reason: `${times.length} kriteria masa (maksimum 1)` };
  const offset = numbers.find(c => c.minScore != null && c.minScore > 0);
  if (offset) return { ok: false, reason: `"${offset.name}" bermula pada ${offset.minScore} (perlu 0)` };
  const bad = numbers.find(c => c.maxScore != null && c.maxScore <= 0);
  if (bad) return { ok: false, reason: `"${bad.name}" maksimum ${bad.maxScore} (perlu lebih daripada 0)` };
  if (numbers.every(c => CORRECT.test(c.name)))
    return { ok: false, reason: "Perlu sekurang-kurangnya satu kriteria skor (peratus kuiz), bukan hanya jawapan betul" };

  return {
    ok: true,
    criteria: sorted.map(c => ({
      ...c,
      source: c.type === "TIME" ? { kind: "time" as const }
        : CORRECT.test(c.name) ? { kind: "correct" as const, max: c.maxScore }
        : { kind: "percent" as const, max: c.maxScore ?? 100 },
    })),
  };
}

export function quizSourceLabel(s: QuizCriterionSource): string {
  return s.kind === "time" ? "masa menjawab"
    : s.kind === "correct" ? (s.max == null ? "bilangan jawapan betul" : `jawapan betul ÷ jumlah soalan × ${s.max}`)
    : s.max === 100 ? "peratus skor kuiz" : `peratus skor kuiz × ${s.max}/100`;
}

/** The value a criterion takes from one result. */
export function quizCriterionValue(
  s: QuizCriterionSource, r: { percentage: number; correct: number; questions: number; seconds: number | null }, timePrecision = 0,
): { score: number | null; timeSeconds: number | null } | null {
  if (s.kind === "time") {
    if (r.seconds == null) return null;
    const f = 10 ** (timePrecision === 2 || timePrecision === 3 ? timePrecision : 0);
    return { score: null, timeSeconds: Math.round(r.seconds * f) / f };
  }
  if (s.kind === "correct") {
    if (s.max == null) return { score: Math.round(r.correct * 100) / 100, timeSeconds: null };
    return r.questions > 0 ? { score: Math.round((r.correct / r.questions) * s.max * 100) / 100, timeSeconds: null } : null;
  }
  return { score: Math.round(r.percentage * s.max) / 100, timeSeconds: null };
}

export type QuizTemplateDraft = {
  name: string; code: string; description: string;
  criterions: { name: string; type: "NUMBER" | "TIME"; minScore: number | null; maxScore: number | null; maxTime: number | null; timePrecision: 0 | 2 | 3 }[];
};

export const quizTemplateCode = (competitionCode: string) =>
  `QZ-${competitionCode.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 12);

/** The plain template: quiz percentage out of 100, plus time as the tie-break. */
export function quizDefaultDraft(opts: { competitionCode: string; competitionName: string }): QuizTemplateDraft {
  return {
    name: `Asia Spark Quiz — ${opts.competitionName}`,
    code: quizTemplateCode(opts.competitionCode),
    description: "Keputusan Asia Spark Quizzly: peratus skor kuiz (0–100). Kedudukan: skor tertinggi, kemudian masa menjawab terpendek.",
    criterions: [
      { name: "Skor Kuiz", type: "NUMBER", minScore: 0, maxScore: 100, maxTime: null, timePrecision: 0 },
      { name: "Masa Menjawab", type: "TIME", minScore: null, maxScore: null, maxTime: 7200, timePrecision: 0 },
    ],
  };
}

/** A draft's criteria in the shape quizTemplateMapping takes. */
export const quizDraftCriteria = (d: QuizTemplateDraft): QuizTemplateCriterion[] =>
  d.criterions.map((c, i) => ({ ...c, order: i }));

/** What the AI is told, on top of the competition context its route adds. */
export function quizAiPrompt(opts: { quizzes: { title: string; label: string }[]; extra?: string }): string {
  return [
    "Draf templat penghakiman untuk pertandingan kuiz dalam talian (Asia Spark Quizzly).",
    opts.quizzes.length ? `Kuiz: ${opts.quizzes.map(q => `${q.title}${q.label ? ` (${q.label})` : ""}`).join("; ")}.` : "",
    "Templat ini diisi secara automatik daripada keputusan kuiz, bukan oleh hakim. Nilai yang ada untuk setiap peserta: peratus skor kuiz, bilangan jawapan betul, dan masa menjawab.",
    "Peraturan:",
    "- Guna jenis NUMBER sahaja, ditambah paling banyak SATU kriteria TIME (maxScore null, maxTime 7200, sebagai pemecah seri).",
    "- Setiap kriteria NUMBER (minScore 0) menerima peratus skor kuiz yang diskalakan kepada maxScore-nya — maxScore ialah wajaran kriteria itu; jumlah wajaran semua kriteria NUMBER sebaiknya 100.",
    "- Hanya kriteria yang namanya mengandungi perkataan \"Betul\" menerima nisbah jawapan betul (jawapan betul ÷ jumlah soalan, diskalakan kepada maxScore-nya); jangan guna perkataan itu untuk kriteria lain.",
    "- Jangan guna SINGLE_OPTION atau MULTIPLE_OPTION.",
    "- Kebanyakannya satu kriteria \"Skor Kuiz\" (maxScore 100) dan \"Masa Menjawab\" (TIME) sudah memadai; pecahkan wajaran hanya jika penerangan pertandingan memintanya.",
    opts.extra?.trim() ? `Arahan tambahan penganjur: ${opts.extra.trim()}` : "",
  ].filter(Boolean).join("\n");
}
