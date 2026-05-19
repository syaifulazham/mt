import { getTranslations } from "next-intl/server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DashboardContingentCard } from "@/components/manager/DashboardContingentCard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default async function ManagerDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const profile = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      contingentManagers: {
        include: {
          contingent: {
            select: {
              id: true, name: true, contingentType: true, status: true,
              _count: { select: { participants: true, teams: true } },
            },
          },
        },
      },
    },
  });

  if (!profile?.profileComplete) redirect("/manager/onboarding");

  const t = await getTranslations({ locale, namespace: "dashboard" });

  const links = profile.contingentManagers.map((cm) => ({
    contingentId:      cm.contingent.id,
    role:              cm.role,
    linkStatus:        cm.status,
    name:              cm.contingent.name,
    contingentType:    cm.contingent.contingentType,
    contingentStatus:  cm.contingent.status,
    participantCount:  cm.contingent._count.participants,
    teamCount:         cm.contingent._count.teams,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("contingentsHeading")}</h2>

        {links.map((link) => (
          <DashboardContingentCard key={link.contingentId} link={link} />
        ))}

        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noContingents")}</p>
        )}
      </div>
    </div>
  );
}
