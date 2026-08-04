import { getOrganizerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { EmailTabNav } from "./EmailTabNav";

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <div className="flex flex-col h-full">
        <EmailTabNav />
        <div className="flex-1 overflow-auto bg-zinc-50">{children}</div>
      </div>
    </OrganizerShell>
  );
}
