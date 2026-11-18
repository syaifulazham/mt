import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ManagerSchoolLevelCertClient } from "@/components/manager/ManagerSchoolLevelCertClient";

export const metadata: Metadata = { title: "School Level Certificates" };

/** Manager portal → Sijil → School / Contingent Level Cert (src/lib/certificates/general.ts). */
export default async function SchoolLevelCertPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId }, select: { profileComplete: true } });
  if (!manager?.profileComplete) redirect("/manager/onboarding");
  return <ManagerSchoolLevelCertClient />;
}
