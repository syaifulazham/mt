import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SectionEditor } from "@/components/organizer/landing/sections/SectionEditor";
import { db } from "@/lib/db";
import { LANDING_WRITE_ROLES, toSectionDto } from "@/lib/landingSections";

export const metadata: Metadata = { title: "Edit Section" };
export const dynamic = "force-dynamic";

/** `/organizer/landing/sections/new` creates a section; any other id edits one. */
export default async function SectionEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  const canEdit = LANDING_WRITE_ROLES.includes(session.role);

  const { id } = await params;
  let initial = null;
  if (id !== "new") {
    const row = await db.landingSection.findUnique({ where: { id } });
    if (!row) notFound();
    initial = toSectionDto(row);
  } else if (!canEdit) {
    redirect("/organizer/landing/sections");
  }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SectionEditor key={initial?.id ?? "new"} initial={initial} canEdit={canEdit} />
    </OrganizerShell>
  );
}
