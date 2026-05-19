import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ParticipantsClient } from "@/components/manager/ParticipantsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Participants" };

export default async function ParticipantsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const manager = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        include: { contingent: { select: { id: true, name: true } } },
      },
    },
  });
  if (!manager?.profileComplete) redirect("/manager/onboarding");

  const contingents = manager.contingentManagers.map((cm) => ({
    id:   cm.contingent.id,
    name: cm.contingent.name,
  }));

  return <ParticipantsClient contingents={contingents} />;
}
