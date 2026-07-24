import { Sidebar } from "./Sidebar";
import type { OrganizerRole } from "@/types";

export function OrganizerShell({
  userName,
  role,
  children,
}: {
  userName: string;
  role: OrganizerRole;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="print:hidden">
        <Sidebar userName={userName} role={role} />
      </div>
      <main className="flex-1 overflow-y-auto bg-zinc-50 print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
