import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/organizer/Sidebar";
import { UsersClient } from "./UsersClient";

export const metadata: Metadata = { title: "Users" };

export default async function OrganizerUsersPage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");
  if (!["SUPER_ADMIN", "ADMIN"].includes(session.role)) redirect("/organizer/dashboard");

  const users = await db.organizerUser.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      forcePasswordChange: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={session.name} role={session.role} />
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-8">
        <UsersClient
          users={users}
          currentUserId={session.id}
          currentRole={session.role}
        />
      </main>
    </div>
  );
}
