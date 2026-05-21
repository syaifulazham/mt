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

  return (
    <ContingentsClient
      institutionType={manager.institutionType ?? "INDEPENDENT"}
      institutionName={institutionName}
    />
  );
}
