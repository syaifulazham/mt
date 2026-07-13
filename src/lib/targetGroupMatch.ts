import { Prisma } from "@prisma/client";

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
