import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GEN_CERTS_GROUP_COOKIE, GEN_CERTS_GROUP_VALUES, type GenCertsGroupBy } from "@/components/organizer/certificates/generatorCertsCookie";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { GeneratorCertificatesClient } from "@/components/organizer/certificates/GeneratorCertificatesClient";

export const metadata: Metadata = { title: "Generator — Issued certificates" };
export const dynamic = "force-dynamic";

export default async function GeneratorCertificatesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) redirect("/organizer/certificates");

  const { id } = await params;
  const saved = (await cookies()).get(GEN_CERTS_GROUP_COOKIE)?.value ?? "";
  const initialGroupBy: GenCertsGroupBy = (GEN_CERTS_GROUP_VALUES as readonly string[]).includes(saved) ? saved as GenCertsGroupBy : "none";
  const job = await db.certGeneratorJob.findUnique({ where: { id } });
  if (!job) notFound();
  const [template, event] = await Promise.all([
    db.certTemplate.findUnique({ where: { id: job.templateId }, select: { name: true } }),
    (job.config as { eventId?: string }).eventId
      ? db.event.findUnique({ where: { id: (job.config as { eventId: string }).eventId }, select: { name: true } })
      : null,
  ]);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <GeneratorCertificatesClient
        jobId={job.id}
        templateName={template?.name ?? "(templat dipadam)"}
        source={job.source}
        eventName={event?.name ?? null}
        initialGroupBy={initialGroupBy}
      />
    </OrganizerShell>
  );
}
