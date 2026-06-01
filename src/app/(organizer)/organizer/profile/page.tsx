import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { OrganizerPasswordForm } from "@/components/organizer/OrganizerPasswordForm";
import { Badge } from "@/components/ui/badge";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Profile" };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN:       "Admin",
  VIEWER:      "Viewer",
};

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function OrganizerProfilePage() {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const user = await db.organizerUser.findUnique({
    where: { id: session.id },
    select: {
      id: true, name: true, email: true, role: true,
      totpEnabled: true, lastLoginAt: true, createdAt: true,
    },
  });
  if (!user) redirect("/organizer/login");

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <OrganizerShell userName={user.name} role={user.role}>
    <div className="max-w-2xl space-y-8 p-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Account information and security settings.</p>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border bg-white shadow-sm">
        {/* Header strip */}
        <div className="h-20 rounded-t-xl bg-gradient-to-r from-zinc-800 to-zinc-600" />

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-4">
            <div className="h-20 w-20 rounded-full border-4 border-white bg-zinc-800 flex items-center justify-center text-white text-2xl font-bold shadow">
              {initials}
            </div>
          </div>

          <div className="space-y-0.5">
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
            {user.totpEnabled && (
              <Badge variant="outline" className="text-green-600 border-green-300">
                2FA Enabled
              </Badge>
            )}
          </div>
        </div>

        <hr className="border-zinc-100" />

        {/* Details grid */}
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Last login</p>
            <p className="font-medium">{fmtDate(user.lastLoginAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Account created</p>
            <p className="font-medium">{fmtDate(user.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Change password section */}
      <div className="rounded-xl border bg-white shadow-sm px-6 py-5 space-y-4">
        <div>
          <h3 className="font-semibold">Change Password</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter your current password before setting a new one.
          </p>
        </div>
        <hr className="border-zinc-100" />
        <OrganizerPasswordForm />
      </div>
    </div>
    </OrganizerShell>
  );
}
