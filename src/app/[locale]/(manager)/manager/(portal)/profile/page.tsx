import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Metadata } from "next";
import { ProfileClient } from "@/components/manager/ProfileClient";

export const metadata: Metadata = { title: "Profil Saya" };

export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    select: { id: true, name: true, email: true, idType: true, idNumber: true, phone: true, address: true, nationality: true },
  });

  if (!profile) redirect("/manager/onboarding");

  return <ProfileClient profile={profile} />;
}
