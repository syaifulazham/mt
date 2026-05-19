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
      <Sidebar userName={userName} role={role} />
      <main className="flex-1 overflow-y-auto bg-zinc-50">
        {children}
      </main>
    </div>
  );
}
