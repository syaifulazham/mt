import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { ContingentsClient } from "@/components/organizer/contingents/ContingentsClient";
import { CONTINGENT_SEARCH_COOKIE } from "@/components/organizer/contingents/searchCookie";

export const metadata: Metadata = { title: "Contingents — Techlympics Organizer" };

export default async function ContingentsPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  // Start with the last search (saved by the page in a cookie)
  const raw = (await cookies()).get(CONTINGENT_SEARCH_COOKIE)?.value ?? "";
  let initialSearch = "";
  try { initialSearch = decodeURIComponent(raw).slice(0, 200); } catch { /* malformed cookie: start empty */ }

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <ContingentsClient initialSearch={initialSearch} />
    </OrganizerShell>
  );
}
