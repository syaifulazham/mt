import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { TemplateEditor } from "@/components/organizer/certificates/TemplateEditor";

export const metadata: Metadata = { title: "Certificate template" };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

export default async function CertificateTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { id } = await params;

  // The draft config is loaded server-side so the editor mounts with the design
  // already in hand rather than flashing an empty canvas.
  const [template, seasons] = await Promise.all([
    db.certTemplate.findUnique({
      where: { id },
      include: {
        season:   { select: { id: true, code: true, name: true, year: true, archivedAt: true } },
        versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true } },
      },
    }),
    db.season.findMany({
      orderBy: [{ year: "desc" }, { code: "asc" }],
      select:  { id: true, code: true, name: true, archivedAt: true },
    }),
  ]);
  if (!template) notFound();

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="h-[calc(100vh-0px)]">
        <TemplateEditor
          template={{
            id:               template.id,
            name:             template.name,
            targetType:       template.targetType,
            status:           template.status,
            draftConfig:      template.draftConfig,
            baseAssetUrl:     template.baseAssetUrl,
            baseAssetType:    template.baseAssetType,
            currentVersionId: template.currentVersionId,
            season:           template.season,
            versions:         template.versions,
          }}
          seasons={seasons}
          canWrite={WRITE_ROLES.includes(session.role)}
        />
      </div>
    </OrganizerShell>
  );
}
