import { Prisma } from "@prisma/client";

// The "Negeri" filter on Pra-Pendaftaran / Pendaftaran Telah Disahkan. Its
// values match the rows of the "Pecahan mengikut Negeri" table:
//   <state id>          — a Malaysian state (contingent → school → institution)
//   "none"              — no state, and not a foreign school (the "–" row)
//   "country:<id>"      — a foreign school's country (the Antarabangsa rows)
// For queries that join contingents as `cont` and states as s / sch_state / hi_state.

export const NO_STATE_FILTER = "none";
export const COUNTRY_FILTER_PREFIX = "country:";

const isForeign = Prisma.sql`EXISTS (SELECT 1 FROM countries fco WHERE fco.id = cont."countryId" AND fco."codeIso2" <> 'MY')`;

/** `AND …` for the filter value, or nothing when it is empty. */
export function stateFilterSql(value: string): Prisma.Sql {
  if (!value) return Prisma.empty;
  if (value === NO_STATE_FILTER)
    return Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) IS NULL AND NOT ${isForeign}`;
  if (value.startsWith(COUNTRY_FILTER_PREFIX))
    return Prisma.sql`AND cont."countryId" = ${value.slice(COUNTRY_FILTER_PREFIX.length)} AND ${isForeign}`;
  return Prisma.sql`AND COALESCE(s.id, sch_state.id, hi_state.id) = ${value}`;
}

/** The filter value of a breakdown row. */
export const stateFilterKey = (r: { isInternational: boolean; stateId: string | null; countryId: string | null }) =>
  r.isInternational && r.countryId ? `${COUNTRY_FILTER_PREFIX}${r.countryId}` : r.stateId ?? NO_STATE_FILTER;
