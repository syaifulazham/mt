import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { SectionsClient } from "@/components/organizer/landing/sections/SectionsClient";
import { db } from "@/lib/db";
import { LANDING_WRITE_ROLES, LAYOUT_SETTING_KEY, parseLayout, resolveOrder, toSectionDto } from "@/lib/landingSections";

export const metadata: Metadata = { title: "Custom Sections" };
export const dynamic = "force-dynamic";

export default async function CustomSectionsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const [rows, setting] = await Promise.all([
    db.landingSection.findMany({ orderBy: { createdAt: "asc" } }),
    db.appSetting.findUnique({ where: { key: LAYOUT_SETTING_KEY } }),
  ]);
  const sections = rows.map(toSectionDto);
  const layout = parseLayout(setting?.value);

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <SectionsClient
        initialSections={sections}
        initialLayout={{ order: resolveOrder(layout, sections.map((s) => s.id)), hidden: layout.hidden }}
        canEdit={LANDING_WRITE_ROLES.includes(session.role)}
      />
    </OrganizerShell>
  );
}
