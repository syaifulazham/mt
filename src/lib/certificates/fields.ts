/**
 * The certificate field registry — one source of truth.
 *
 * `FieldPicker` renders this list and `render.ts` resolves it, so the editor
 * cannot offer a token the renderer silently drops (an mt25 failure mode, where
 * the placeholder map lived only inside the generator).
 *
 * RULE: every token resolves from the certificate row or its season — never from
 * participants, teams, contingents or events. That property is what lets a past
 * season's operational data be purged while its certificates still render.
 */

export const CERT_FIELD_TOKENS = [
  "recipient_name",
  "ic_number",
  "contingent_name",
  "school_name",
  "state_name",
  "team_name",
  "competition_name",
  "competition_code",
  "event_name",
  "award_title",
  "rank",
  "serial_number",
  "unique_code",
  "issue_date",
  "season_name",
  "season_year",
] as const;

export type CertFieldToken = (typeof CERT_FIELD_TOKENS)[number];

export const CERT_FIELDS: ReadonlyArray<{
  token: CertFieldToken;
  label: string;     // shown in the editor
  sample: string;    // used by the true preview when no certificate is selected
}> = [
  { token: "recipient_name",   label: "Recipient name",      sample: "AHMAD BIN ABDULLAH" },
  { token: "ic_number",        label: "IC number",  sample: "081231-14-0123" },
  { token: "contingent_name",  label: "Contingent name",      sample: "SMK BUKIT JALIL" },
  { token: "school_name",      label: "School name",        sample: "SMK BUKIT JALIL" },
  { token: "state_name",       label: "State",              sample: "WILAYAH PERSEKUTUAN KUALA LUMPUR" },
  { token: "team_name",        label: "Team name",        sample: "TEAM ALPHA" },
  { token: "competition_name", label: "Competition name",   sample: "CABARAN CSI ARENA" },
  { token: "competition_code", label: "Competition code",    sample: "6.3R" },
  { token: "event_name",       label: "Event name",          sample: "PERTANDINGAN PERINGKAT NEGERI" },
  { token: "award_title",      label: "Award title",            sample: "JOHAN" },
  { token: "rank",             label: "Rank",           sample: "1" },
  { token: "serial_number",    label: "Serial number",            sample: "MT26/PART/000001" },
  { token: "unique_code",      label: "Verification code",      sample: "a1b2c3d4e5f6" },
  { token: "issue_date",       label: "Issue date",  sample: "15/09/2026" },
  { token: "season_name",      label: "Season name",          sample: "Malaysia Techlympics 2026" },
  { token: "season_year",      label: "Season year",         sample: "2026" },
];

/**
 * mt25 placeholders that no longer have a token of their own. Imported v1
 * configurations keep working because the resolver accepts these names.
 */
const LEGACY_ALIASES: Record<string, CertFieldToken> = {
  contest_name: "competition_name",
  position:     "rank",
  achievement:  "award_title",
};

export function normaliseFieldToken(raw: string): CertFieldToken | null {
  const key = raw.replace(/^\{\{|\}\}$/g, "").trim();
  if ((CERT_FIELD_TOKENS as readonly string[]).includes(key)) return key as CertFieldToken;
  return LEGACY_ALIASES[key] ?? null;
}

/** The shape `resolveFieldToken` needs — a certificate row plus its season. */
export type CertFieldSource = {
  recipientName:   string;
  recipientIc:     string | null;
  contingentName:  string | null;
  schoolName:      string | null;
  stateName:       string | null;
  teamName:        string | null;
  competitionName: string | null;
  competitionCode: string | null;
  eventName:       string | null;
  awardTitle:      string | null;
  rank:            number | null;
  serialNumber:    string;
  uniqueCode:      string;
  issuedAt:        Date | null;
  season:          { name: string; year: number };
};

export function formatIssueDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("ms-MY", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Returns null when the token is unknown, "" when the value is absent. */
export function resolveFieldToken(token: string, src: CertFieldSource): string | null {
  const t = normaliseFieldToken(token);
  if (!t) return null;
  switch (t) {
    case "recipient_name":   return src.recipientName;
    case "ic_number":        return src.recipientIc      ?? "";
    case "contingent_name":  return src.contingentName   ?? "";
    case "school_name":      return src.schoolName       ?? "";
    case "state_name":       return src.stateName        ?? "";
    case "team_name":        return src.teamName         ?? "";
    case "competition_name": return src.competitionName  ?? "";
    case "competition_code": return src.competitionCode  ?? "";
    case "event_name":       return src.eventName        ?? "";
    case "award_title":      return src.awardTitle       ?? "";
    case "rank":             return src.rank === null ? "" : String(src.rank);
    case "serial_number":    return src.serialNumber;
    case "unique_code":      return src.uniqueCode;
    case "issue_date":       return formatIssueDate(src.issuedAt);
    case "season_name":      return src.season.name;
    case "season_year":      return String(src.season.year);
  }
}

/** A synthetic source for editor previews. */
export function sampleFieldSource(season: { name: string; year: number }): CertFieldSource {
  const by = (token: CertFieldToken) => CERT_FIELDS.find((f) => f.token === token)!.sample;
  return {
    recipientName:   by("recipient_name"),
    recipientIc:     by("ic_number"),
    contingentName:  by("contingent_name"),
    schoolName:      by("school_name"),
    stateName:       by("state_name"),
    teamName:        by("team_name"),
    competitionName: by("competition_name"),
    competitionCode: by("competition_code"),
    eventName:       by("event_name"),
    awardTitle:      by("award_title"),
    rank:            1,
    serialNumber:    by("serial_number"),
    uniqueCode:      by("unique_code"),
    issuedAt:        new Date(),
    season,
  };
}
