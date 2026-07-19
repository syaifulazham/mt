import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { WalkInJudgingManageClient } from "@/components/organizer/events/WalkInJudgingManageClient";

export const metadata: Metadata = { title: "Walk-in Penghakiman" };

export default async function WalkInJudgingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true,
      walkInCompetitions: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          competition: { select: { id: true, code: true, name: true } },
          _count: { select: { registrations: true } },
          judgingTemplates: {
            include: {
              judgingTemplate: {
                select: { id: true, name: true, code: true, description: true, _count: { select: { criterions: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          judgingEndpoints: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true,
              judgingTemplate: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WalkInJudgingManageClient event={event} canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)} />
    </OrganizerShell>
  );
}
