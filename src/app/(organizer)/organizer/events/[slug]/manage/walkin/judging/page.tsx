import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { walkInJudgingProgress } from "@/lib/judgingStatus";
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
          judgingStatus: true, judgingCompletedAt: true, judgingCompletedBy: true,
          judgingVerifiedAt: true, judgingVerifiedBy: true,
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
              id: true, routeSlug: true, passcode: true, label: true, status: true, createdAt: true, completedAt: true,
              judgingTemplate: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
    },
  });

  if (!event) redirect("/organizer/events");

  // Judging progress (confirmed participants; judged per endpoint) — the client
  // keeps it current by polling /walkin/judging-progress, same helper.
  const progress = new Map((await walkInJudgingProgress(event.id)).map((p) => [p.id, p]));
  const withProgress = {
    ...event,
    walkInCompetitions: event.walkInCompetitions.map((w) => {
      const p = progress.get(w.id);
      const byEndpoint = new Map(p?.tasks.map((t) => [t.id, t.judgedTeams]) ?? []);
      return {
        ...w,
        participantCount: p?.teamCount ?? 0,
        judgingEndpoints: w.judgingEndpoints.map((e) => ({ ...e, judged: byEndpoint.get(e.id) ?? 0 })),
      };
    }),
  };

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <WalkInJudgingManageClient
        event={withProgress}
        canWrite={["SUPER_ADMIN", "ADMIN"].includes(session.role)}
        isSuperAdmin={session.role === "SUPER_ADMIN"}
      />
    </OrganizerShell>
  );
}
