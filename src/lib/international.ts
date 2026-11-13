// Organizer-driven registration of foreign schools into an event.
//
// A foreign school is an INTERNATIONAL contingent whose country is not
// Malaysia: the contingent name is the school name, countryId the country, and
// it has no Malaysian state or school row. Contingents of type INTERNATIONAL
// without a country (international schools located in Malaysia, created by
// managers with a state) stay local.
//
// These routes are organizer-only and deliberately NOT gated by the
// registration Open/Close switch (src/lib/registration.ts) — that switch is for
// contingent managers.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrganizerSession } from "@/lib/auth/session";
import { currentInternationalLink } from "@/lib/international-link";
import { foldEmail, isValidEmail } from "@/lib/email";
import { ageFromBirthDate, parseBirthDate } from "@/lib/participantAge";
import { matchesTargetGroup } from "@/lib/targetGroupMatch";
import { singleParticipationConflict } from "@/lib/individualEntry";

const EDU_LEVELS = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"] as const;

function optText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Passport numbers compared without spaces/dashes and case-insensitively. */
export function normalisePassport(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Validates the participant form. Age comes from the birth date — the
 * passport carries nothing to derive it from — while education level and grade
 * are taken as entered (the form prefills them from the age).
 */
export function parseForeignParticipant(body: unknown):
  | { error: string }
  | { data: {
      name: string; passport: string; birthDate: Date; age: number;
      gender: "MALE" | "FEMALE"; eduLevel: (typeof EDU_LEVELS)[number]; classGrade: string | null;
      email: string | null; phoneNumber: string | null; ppki: boolean;
    } } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = optText(b.name);
  if (!name) return { error: "MISSING_NAME" };
  const passportRaw = optText(b.passport);
  if (!passportRaw) return { error: "MISSING_PASSPORT" };
  const birthDate = parseBirthDate(b.birthDate);
  if (!birthDate) return { error: "INVALID_BIRTH_DATE" };
  const age = ageFromBirthDate(birthDate);
  if (age < 3 || age > 100) return { error: "INVALID_BIRTH_DATE" };
  if (b.gender !== "MALE" && b.gender !== "FEMALE") return { error: "INVALID_GENDER" };
  if (!EDU_LEVELS.includes(b.eduLevel as (typeof EDU_LEVELS)[number])) return { error: "INVALID_EDU_LEVEL" };
  const email = foldEmail(typeof b.email === "string" ? b.email : null);
  if (email && !isValidEmail(email)) return { error: "INVALID_EMAIL" };
  return {
    data: {
      name,
      passport:    normalisePassport(passportRaw),
      birthDate,
      age,
      gender:      b.gender,
      eduLevel:    b.eduLevel as (typeof EDU_LEVELS)[number],
      classGrade:  optText(b.classGrade),
      email,
      phoneNumber: optText(b.phoneNumber),
      ppki:        b.ppki === true,
    },
  };
}

/** Validates the trainer (Jurulatih) form. */
export function parseForeignTrainer(body: unknown):
  | { error: string }
  | { data: { name: string; passport: string | null; email: string | null; phoneNumber: string | null } } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = optText(b.name);
  if (!name) return { error: "MISSING_NAME" };
  const passport = optText(b.passport);
  const email = foldEmail(typeof b.email === "string" ? b.email : null);
  if (email && !isValidEmail(email)) return { error: "INVALID_EMAIL" };
  return {
    data: { name, passport: passport && normalisePassport(passport), email, phoneNumber: optText(b.phoneNumber) },
  };
}

export { HOME_COUNTRY_ISO2, isForeignCountry } from "@/lib/countries";
import { isForeignCountry } from "@/lib/countries";

export const INTERNATIONAL_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

/** False only for an OWN-scoped registration link asking for a school it did not create. */
export function linkMayReach(contingentId: string): boolean {
  const link = currentInternationalLink();
  return !link || link.scope === "ALL" || link.contingentIds.includes(contingentId);
}

/** The session when the caller may manage international registration, else a 401/403 response. */
export async function requireInternationalAdmin() {
  // A third-party registration link (/intl/<slug>) acts as an ADMIN of its own event's international page.
  const link = currentInternationalLink();
  if (link) return { session: link } as const;
  const session = await getOrganizerSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) } as const;
  if (!(INTERNATIONAL_ROLES as readonly string[]).includes(session.role))
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) } as const;
  return { session } as const;
}

/**
 * Refusal when the event does not take international registration (switched
 * on per event), else null. Called by the event-level international routes.
 */
export async function internationalClosed(eventId: string) {
  const ev = await db.event.findUnique({ where: { id: eventId }, select: { allowInternational: true } });
  if (!ev) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (!ev.allowInternational)
    return NextResponse.json({ error: "INTERNATIONAL_CLOSED", message: "Penyertaan antarabangsa tidak dibuka untuk acara ini." }, { status: 403 });
  return null;
}

/**
 * Loads a contingent this tool may edit: INTERNATIONAL with a foreign country.
 * Returns an error response otherwise, so local contingents can never be
 * changed from here.
 */
export async function loadForeignContingent(contingentId: string) {
  const c = await db.contingent.findUnique({
    where:  { id: contingentId },
    select: { id: true, name: true, contingentType: true, internationalEventId: true, country: { select: { id: true, name: true, codeIso2: true } } },
  });
  if (!c) return { error: NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 }) } as const;
  if (c.contingentType !== "INTERNATIONAL" || !isForeignCountry(c.country))
    return { error: NextResponse.json({ error: "NOT_A_FOREIGN_CONTINGENT" }, { status: 400 }) } as const;
  // A registration link only reaches its own event's schools (OWN: only the ones it created).
  const link = currentInternationalLink();
  if (link && c.internationalEventId !== link.eventId) return { error: NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 }) } as const;
  if (!linkMayReach(contingentId)) return { error: NextResponse.json({ error: "CONTINGENT_NOT_FOUND" }, { status: 404 }) } as const;
  return { contingent: c } as const;
}

type EventCompetitionInfo = NonNullable<Awaited<ReturnType<typeof loadEventCompetitions>>> extends Map<string, infer V> ? V : never;

/**
 * Checks the people on a team before it is saved: every member and trainer
 * belongs to the school, the size fits the competition, each member falls into
 * one of the competition's target groups, and — for a "Penyertaan Tunggal
 * Sahaja" event — no member already holds another competition in this event.
 * Returns an error code, or null when everything is fine.
 */
export async function checkTeamPeople(input: {
  contingentId: string;
  competition: EventCompetitionInfo;
  memberIds: string[];
  trainerIds: string[];
  eventId: string;
  exceptTeamId?: string;
}): Promise<{ error: string; detail?: string } | null> {
  const { contingentId, competition, eventId, exceptTeamId } = input;
  const memberIds  = [...new Set(input.memberIds)];
  const trainerIds = [...new Set(input.trainerIds)];

  if (memberIds.length === 0) return { error: "NO_MEMBERS" };
  const max = competition.participationType === "INDIVIDUAL" ? 1 : Math.max(1, competition.maxTeamSize);
  if (memberIds.length > max) return { error: "TEAM_FULL" };

  const members = await db.participant.findMany({
    where:  { id: { in: memberIds } },
    select: { id: true, name: true, contingentId: true, eduLevel: true, ppki: true, classGrade: true, age: true },
  });
  if (members.length !== memberIds.length || members.some((m) => m.contingentId !== contingentId))
    return { error: "MEMBER_NOT_IN_CONTINGENT" };

  const groups = competition.targetGroups.map((tg) => tg.targetGroup);
  if (groups.length > 0) {
    const ineligible = members.find((m) => !groups.some((g) => matchesTargetGroup(m, g)));
    if (ineligible) return { error: "MEMBER_NOT_ELIGIBLE", detail: ineligible.name };
  }

  for (const m of members) {
    const conflict = await singleParticipationConflict(db, {
      participantId: m.id, eventId, exceptTeamId, exceptCompetitionId: competition.id,
    });
    if (conflict) return { error: "PARTICIPANT_IN_SAME_EVENT", detail: `${m.name} — ${conflict}` };
  }

  if (trainerIds.length > 0) {
    const n = await db.trainer.count({ where: { id: { in: trainerIds }, contingentId } });
    if (n !== trainerIds.length) return { error: "TRAINER_NOT_IN_CONTINGENT" };
  }
  return null;
}

/** The event's competitions, keyed by competitionId. */
export async function loadEventCompetitions(eventId: string) {
  const event = await db.event.findUnique({
    where:  { id: eventId },
    select: {
      id: true,
      eventCompetitions: {
        where: { parentId: null },
        select: {
          competition: {
            select: {
              id: true, code: true, name: true, participationType: true, minTeamSize: true, maxTeamSize: true,
              targetGroups: {
                select: { targetGroup: { select: { schoolLevel: true, ppki: true, classGrades: true, minAge: true, maxAge: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!event) return null;
  return new Map(event.eventCompetitions.map((ec) => [ec.competition.id, ec.competition]));
}
