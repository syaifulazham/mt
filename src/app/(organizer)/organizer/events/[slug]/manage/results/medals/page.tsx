import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { computeMedalTally, MEDAL_TALLY_SCOPES, MEDAL_WRITE_ROLES } from "@/lib/medalTally";
import { MedalTallyClient } from "@/components/organizer/events/MedalTallyClient";

export const metadata: Metadata = { title: "Medal Tally" };
export const dynamic = "force-dynamic";

export default async function MedalTallyPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ semua?: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  const includeUnverified = (await searchParams).semua === "1";

  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, scope: true,
      medalTallyEndpoints: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) redirect("/organizer/events");
  if (!MEDAL_TALLY_SCOPES.includes(event.scope)) notFound();

  const tally = await computeMedalTally(event.id, { includeUnverified });

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <MedalTallyClient
        event={{ id: event.id, name: event.name, slug: event.slug }}
        tally={tally}
        includeUnverified={includeUnverified}
        endpoints={event.medalTallyEndpoints.map((e) => ({
          id: e.id, routeSlug: e.routeSlug, passcode: e.passcode, label: e.label,
          status: e.status, createdAt: e.createdAt.toISOString(),
        }))}
        canWrite={MEDAL_WRITE_ROLES.includes(session.role)}
      />
    </OrganizerShell>
  );
}
