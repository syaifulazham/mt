import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { TeamCertPreviewClient, type PreviewMember } from "@/components/organizer/scoreboard/TeamCertPreviewClient";

export const metadata: Metadata = { title: "Sijil pasukan" };

// Scoreboard → Sijil: every certificate issued to one team's members for this
// competition, previewed member by member. Certificates are found by their own
// snapshot columns (eventId / competitionId / teamId), so the page still works
// once the team itself has been purged.
export default async function TeamCertificatesPage({ params }: { params: Promise<{ slug: string; ecId: string; teamId: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const { slug, ecId, teamId } = await params;
  const back = `/organizer/events/${slug}/manage/scoreboard/${ecId}`;

  const ec = await db.eventCompetition.findFirst({
    where: { id: ecId, event: { slug } },
    select: {
      competitionId: true,
      event: { select: { id: true, name: true } },
      competition: { select: { name: true, code: true } },
    },
  });
  if (!ec) redirect(`/organizer/events/${slug}/manage/scoreboard`);

  const [team, certificates] = await Promise.all([
    db.team.findUnique({
      where: { id: teamId },
      select: {
        name: true,
        contingent: { select: { name: true } },
        members: { select: { participant: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.certificate.findMany({
      where: { eventId: ec.event.id, teamId, competitionId: ec.competitionId, status: { not: "REVOKED" }, revokedAt: null },
      select: {
        id: true, serialNumber: true, recipientName: true, participantId: true, awardTitle: true, status: true,
        teamName: true, contingentName: true, issuedAt: true,
        templateVersion: { select: { template: { select: { name: true } } } },
      },
      orderBy: [{ recipientName: "asc" }, { issuedAt: "asc" }],
    }),
  ]);

  // Members: the team's current members, plus any certificate recipient no
  // longer (or never) on it — matched by participant id, else by name.
  const members = new Map<string, PreviewMember>();
  for (const m of team?.members ?? [])
    members.set(m.participant.id, { key: m.participant.id, name: m.participant.name, certificates: [] });
  for (const c of certificates) {
    const key = c.participantId ?? `name:${c.recipientName}`;
    const m = members.get(key) ?? { key, name: c.recipientName, certificates: [] };
    m.certificates.push({
      id: c.id, serialNumber: c.serialNumber, awardTitle: c.awardTitle, status: c.status,
      templateName: c.templateVersion.template.name,
    });
    members.set(key, m);
  }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <TeamCertPreviewClient
        back={back}
        eventName={ec.event.name}
        competition={ec.competition}
        teamName={team?.name ?? certificates[0]?.teamName ?? "—"}
        contingentName={team?.contingent?.name ?? certificates[0]?.contingentName ?? null}
        members={[...members.values()]}
      />
    </OrganizerShell>
  );
}
