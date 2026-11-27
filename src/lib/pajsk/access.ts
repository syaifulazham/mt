/**
 * Who may see PAJSK (Beta). Organizer switch in app_settings `pajsk_access`:
 *   OFF     — nobody (organizers can still preview)
 *   TESTERS — the listed manager-portal users (by email) on the manager portal,
 *             and the participants of their contingents on the participant portal
 *   ALL     — every manager and participant
 * A missing row means OFF. Always read per request — never cache.
 */
import { db } from "@/lib/db";

export const PAJSK_ACCESS_KEY = "pajsk_access";
export const ACCESS_MODES = ["OFF", "TESTERS", "ALL"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export type PajskAccess = {
  mode: AccessMode;
  testerEmails: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

const OFF: PajskAccess = { mode: "OFF", testerEmails: [], updatedAt: null, updatedBy: null };

export function normaliseEmails(list: unknown): string[] {
  const raw = Array.isArray(list) ? list : typeof list === "string" ? list.split(/[\s,;]+/) : [];
  return [...new Set(raw.map(e => String(e).trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+$/.test(e)))].slice(0, 200);
}

export async function getPajskAccess(): Promise<PajskAccess> {
  const row = await db.appSetting.findUnique({ where: { key: PAJSK_ACCESS_KEY } });
  if (!row) return OFF;
  try {
    const v = JSON.parse(row.value) as Partial<PajskAccess>;
    return {
      mode: (ACCESS_MODES as readonly string[]).includes(v.mode ?? "") ? v.mode! : "OFF",
      testerEmails: normaliseEmails(v.testerEmails),
      updatedAt: v.updatedAt ?? null,
      updatedBy: v.updatedBy ?? null,
    };
  } catch {
    return OFF;
  }
}

export async function setPajskAccess(patch: { mode?: AccessMode; testerEmails?: string[] }, by: string): Promise<PajskAccess> {
  const next: PajskAccess = { ...(await getPajskAccess()), ...patch, updatedAt: new Date().toISOString(), updatedBy: by };
  const value = JSON.stringify(next);
  await db.appSetting.upsert({ where: { key: PAJSK_ACCESS_KEY }, update: { value }, create: { key: PAJSK_ACCESS_KEY, value } });
  return next;
}

/** Contingent ids of the tester managers. */
async function testerContingentIds(emails: string[]): Promise<string[]> {
  if (!emails.length) return [];
  const rows = await db.contingentManager.findMany({
    where: { status: "ACTIVE", manager: { email: { in: emails, mode: "insensitive" } } },
    select: { contingentId: true },
  });
  return [...new Set(rows.map(r => r.contingentId))];
}

export async function participantMaySee(contingentId: string): Promise<boolean> {
  const a = await getPajskAccess();
  if (a.mode === "ALL") return true;
  if (a.mode !== "TESTERS") return false;
  return (await testerContingentIds(a.testerEmails)).includes(contingentId);
}

export async function managerMaySee(email: string | null | undefined): Promise<boolean> {
  const a = await getPajskAccess();
  if (a.mode === "ALL") return true;
  return a.mode === "TESTERS" && !!email && a.testerEmails.includes(email.trim().toLowerCase());
}
