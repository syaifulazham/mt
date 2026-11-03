// Certificates → Distribution: whether issued certificates are offered on the
// contingent manager portal and on the participant portal. Stored in
// app_settings; a missing row means both off, so nothing is shown until an
// organizer turns it on. Always read per request — never cache.
import { db } from "@/lib/db";

export const DISTRIBUTION_SETTING_KEY = "cert_distribution";

export type CertDistribution = {
  manager: boolean;
  participant: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

const OFF: CertDistribution = { manager: false, participant: false, updatedAt: null, updatedBy: null };

export async function getCertDistribution(): Promise<CertDistribution> {
  const row = await db.appSetting.findUnique({ where: { key: DISTRIBUTION_SETTING_KEY } });
  if (!row) return OFF;
  try {
    const v = JSON.parse(row.value) as Partial<CertDistribution>;
    return { manager: v.manager === true, participant: v.participant === true, updatedAt: v.updatedAt ?? null, updatedBy: v.updatedBy ?? null };
  } catch {
    return OFF;
  }
}

export async function setCertDistribution(
  patch: Partial<Pick<CertDistribution, "manager" | "participant">>, by: string,
): Promise<CertDistribution> {
  const next = { ...(await getCertDistribution()), ...patch, updatedAt: new Date().toISOString(), updatedBy: by };
  const value = JSON.stringify(next);
  await db.appSetting.upsert({
    where: { key: DISTRIBUTION_SETTING_KEY }, update: { value }, create: { key: DISTRIBUTION_SETTING_KEY, value },
  });
  return next;
}
