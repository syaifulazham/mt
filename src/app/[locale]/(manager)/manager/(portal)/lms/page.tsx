import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { BengkelClient } from "@/components/manager/BengkelClient";

export const metadata: Metadata = { title: "Bengkel MT" };

export default async function LmsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const profile = await db.managerProfile.findUnique({ where: { clerkUserId: userId } });
  if (!profile?.profileComplete) redirect("/manager/onboarding");

  return <BengkelClient />;
}
