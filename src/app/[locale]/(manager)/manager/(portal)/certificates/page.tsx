import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ManagerCertificatesClient } from "@/components/manager/ManagerCertificatesClient";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  const manager = await db.managerProfile.findUnique({ where: { clerkUserId: userId }, select: { profileComplete: true } });
  if (!manager?.profileComplete) redirect("/manager/onboarding");

  return <ManagerCertificatesClient />;
}
