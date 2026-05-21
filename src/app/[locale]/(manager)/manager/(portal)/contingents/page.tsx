import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ContingentsClient } from "@/components/manager/ContingentsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Contingents" };

export default async function ContingentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      school:            { select: { name: true } },
      higherInstitution: { select: { name: true } },
    },
  });
  if (!manager?.profileComplete) redirect("/manager/onboarding");

  const institutionName =
    manager.school?.name ??
    manager.higherInstitution?.name ??
    null;

  // Detect if the institution already has a contingent the user hasn't joined
  let existingContingent: { id: string; name: string; hasManagers: boolean } | null = null;
  const linkField = manager.schoolId
    ? { schoolId: manager.schoolId }
    : manager.higherInstitutionId
    ? { higherInstitutionId: manager.higherInstitutionId }
    : null;

  if (linkField) {
    const found = await db.contingent.findFirst({
      where: { ...linkField, status: "ACTIVE" },
      include: { _count: { select: { managers: { where: { status: "ACTIVE" } } } } },
    });
    if (found) {
      existingContingent = {
        id:          found.id,
        name:        found.name,
        hasManagers: found._count.managers > 0,
      };
    }
  }

  return (
    <ContingentsClient
      institutionType={manager.institutionType ?? "INDEPENDENT"}
      institutionName={institutionName}
      existingContingent={existingContingent}
    />
  );
}
