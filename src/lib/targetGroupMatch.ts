import { Prisma } from "@prisma/client";

// ── JS counterpart of the SQL below ──────────────────────────────────────────
// Same rule, three places needed it (eligible-participants, bulk-register, the
// participant dashboard), so it lives here next to the SQL it must agree with.

export type MatchableTargetGroup = {
  schoolLevel: string;
  ppki: boolean;
  classGrades: string[];
  minAge: number;
  maxAge: number;
};

export type MatchableParticipant = {
  eduLevel: string;
  ppki: boolean;
  classGrade: string | null;
  age: number | null;
};

export function matchesTargetGroup(p: MatchableParticipant, g: MatchableTargetGroup): boolean {
  if (g.schoolLevel.toUpperCase() !== p.eduLevel) return false;
  if (g.ppki && !p.ppki) return false;

  // Grade-based group
  if (g.classGrades.length > 0)
    return !!p.classGrade && g.classGrades.includes(p.classGrade);

  // Age-based group
  if (g.minAge > 0 || g.maxAge > 0) {
    if (p.age == null) return false;
    if (g.minAge > 0 && p.age < g.minAge) return false;
    if (g.maxAge > 0 && p.age > g.maxAge) return false;
    return true;
  }

  // Neither restriction — the school level match is enough
  return true;
}

/** The subset of `groups` this participant falls into; empty means not eligible. */
export function matchingTargetGroups<T extends MatchableTargetGroup>(
  p: MatchableParticipant,
  groups: T[],
): T[] {
  return groups.filter((g) => matchesTargetGroup(p, g));
}

// Builds a SQL condition that tests whether a participant/contestant row
// (aliased `participantAlias`) matches a target_groups row (aliased
// `targetGroupAlias`). Mirrors the JS `isEligible()` logic used in
// src/app/api/v2/manager/teams/[id]/eligible-participants/route.ts:
//   - schoolLevel must equal eduLevel
//   - a PPKI-only group requires the participant to be PPKI
//   - grade-based groups: classGrade must be in classGrades
//   - age-based groups (no classGrades): age must fall within min/maxAge
//   - groups with neither restriction: schoolLevel match is sufficient
//
// NOTE: aliases are internal, hardcoded identifiers controlled by callers —
// never pass user input here.
export function targetGroupMatchSql(participantAlias: string, targetGroupAlias: string): Prisma.Sql {
  const p  = Prisma.raw(participantAlias);
  const tg = Prisma.raw(targetGroupAlias);
  return Prisma.sql`
    ${tg}."schoolLevel" = ${p}."eduLevel"::text
    AND (NOT ${tg}.ppki OR ${p}.ppki)
    AND (
      (cardinality(${tg}."classGrades") > 0 AND ${p}."classGrade" = ANY(${tg}."classGrades"))
      OR (
        cardinality(${tg}."classGrades") = 0
        AND (${tg}."minAge" > 0 OR ${tg}."maxAge" > 0)
        AND ${p}.age IS NOT NULL
        AND (${tg}."minAge" = 0 OR ${p}.age >= ${tg}."minAge")
        AND (${tg}."maxAge" = 0 OR ${p}.age <= ${tg}."maxAge")
      )
      OR (
        cardinality(${tg}."classGrades") = 0
        AND ${tg}."minAge" = 0
        AND ${tg}."maxAge" = 0
      )
    )
  `;
}
