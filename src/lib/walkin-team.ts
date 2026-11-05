import type { Prisma } from "@prisma/client";

/** One member of a temporary team on a walk-in borang. */
export type WalkInTeamMember = { name: string; ic: string };

export const cleanIc = (v: unknown) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : "");
export const IC_RE = /^\d{6,12}$/;

/** Reads `teamMembers` JSON off a submission; [] when absent or malformed. */
export function readTeamMembers(v: Prisma.JsonValue | null | undefined): WalkInTeamMember[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) =>
    m && typeof m === "object" && !Array.isArray(m) && typeof m.ic === "string" && typeof m.name === "string"
      ? [{ ic: m.ic, name: m.name }]
      : [],
  );
}

/**
 * Validates the members posted by the borang for a TEAM competition. Returns
 * the cleaned list (IC without separators, name upper-cased) or an error code.
 */
export function parseTeamMembers(
  raw: unknown,
  size: { min: number; max: number },
): { members: WalkInTeamMember[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "INVALID_MEMBERS" };
  const members: WalkInTeamMember[] = [];
  for (const m of raw) {
    const ic = cleanIc(m?.ic);
    const name = typeof m?.name === "string" ? m.name.trim().toUpperCase() : "";
    if (!IC_RE.test(ic) || name.length < 3) return { error: "INVALID_MEMBERS" };
    members.push({ ic, name });
  }
  if (members.length < size.min || members.length > size.max) return { error: "TEAM_SIZE" };
  if (new Set(members.map((m) => m.ic)).size !== members.length) return { error: "DUPLICATE_MEMBER_IC" };
  return { members };
}

/** Submissions where this IC appears, as the main IC or as a team member. */
export function submissionHasIc(ic: string): Prisma.WalkInFormSubmissionWhereInput {
  return { OR: [{ ic }, { teamMembers: { array_contains: [{ ic }] } }] };
}

/** Registrations held by this IC, directly or as a member of the registered team. */
export function registrationHasIc(ic: string): Prisma.WalkInRegistrationWhereInput {
  return { OR: [{ participant: { ic } }, { team: { members: { some: { participant: { ic } } } } }] };
}

/** The size bounds the borang enforces for a competition. */
export function teamSizeBounds(c: { participationType: string; minTeamSize: number; maxTeamSize: number }) {
  const max = Math.max(1, c.maxTeamSize);
  return { min: Math.min(Math.max(1, c.minTeamSize), max), max };
}
