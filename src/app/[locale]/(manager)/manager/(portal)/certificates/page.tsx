import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ManagerCertificatesClient } from "@/components/manager/ManagerCertificatesClient";
import { managerMaySee } from "@/lib/pajsk/access";
import { PajskManagerLink } from "@/components/pajsk/PajskManagerLink";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId }, select: { profileComplete: true, email: true } });
  if (!manager?.profileComplete) redirect("/manager/onboarding");

  const pajsk = await managerMaySee(manager.email);
  return (
    <>
      {pajsk && <PajskManagerLink />}
      <ManagerCertificatesClient />
    </>
  );
}
