import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ManagerSidebar } from "@/components/manager/ManagerSidebar";
import { MobileManagerNav } from "@/components/manager/MobileManagerNav";
import { LocaleSwitcher } from "@/components/manager/LocaleSwitcher";
import { ManagerThemeProvider } from "@/components/manager/ManagerThemeProvider";
import { ThemeToggle } from "@/components/manager/ThemeToggle";
import Image from "next/image";
import Link from "next/link";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");

  const profile = await db.managerProfile.findUnique({
    where: { clerkUserId: userId },
    include: {
      school:            { select: { name: true } },
      higherInstitution: { select: { name: true } },
    },
  });

  if (!profile?.profileComplete) redirect("/manager/onboarding");

  const institutionLabel =
    profile.school?.name ??
    profile.higherInstitution?.name ??
    (profile.institutionType === "INDEPENDENT" ? "Independent Group" : "International");

  let contingentManager = await db.contingentManager.findFirst({
    where: { managerId: profile.id, status: "ACTIVE" },
    select: { id: true },
  });

  // Auto-provision: if the institution has no contingent yet, create one and
  // make this manager the owner. If a contingent exists but has no active managers,
  // also auto-link as owner. If it already has managers, let the user join manually.
  if (!contingentManager && (profile.schoolId || profile.higherInstitutionId)) {
    const institutionName = profile.school?.name ?? profile.higherInstitution?.name ?? "My Contingent";
    const linkField = profile.schoolId
      ? { schoolId: profile.schoolId }
      : { higherInstitutionId: profile.higherInstitutionId! };

    const institutionContingent = await db.contingent.findFirst({
      where: { ...linkField, status: "ACTIVE" },
      include: { _count: { select: { managers: { where: { status: "ACTIVE" } } } } },
    });

    if (!institutionContingent) {
      // No contingent at all — create one automatically
      const created = await db.contingent.create({
        data: {
          name:           institutionName,
          contingentType: profile.schoolId ? "SCHOOL" : "HIGHER",
          ...linkField,
          managers: {
            create: { managerId: profile.id, role: "OWNER", status: "ACTIVE" },
          },
        },
        select: { id: true },
      });
      contingentManager = { id: created.id };
    } else if (institutionContingent._count.managers === 0) {
      // Contingent exists but has no managers — auto-claim as owner
      const existingLink = await db.contingentManager.findUnique({
        where: { contingentId_managerId: { contingentId: institutionContingent.id, managerId: profile.id } },
        select: { id: true },
      });
      if (!existingLink) {
        contingentManager = await db.contingentManager.create({
          data: { contingentId: institutionContingent.id, managerId: profile.id, role: "OWNER", status: "ACTIVE" },
          select: { id: true },
        });
      }
    }
    // If contingent has active managers and user isn't linked → falls through,
    // hasContingent stays false; ContingentsClient will show the Join button.
  }

  const hasContingent = !!contingentManager;

  return (
    <ManagerThemeProvider className="flex min-h-screen flex-col">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-white dark:bg-zinc-900 dark:border-zinc-800 px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo-mt.svg"
            alt="Techlympics"
            width={120}
            height={40}
            className="h-8 w-auto dark:brightness-0 dark:invert"
            unoptimized
            priority
          />
          <span className="hidden sm:block text-xs text-muted-foreground border-l pl-3">
            Manager Portal
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <ManagerSidebar userName={profile.name} institutionName={institutionLabel} hasContingent={hasContingent} />

        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      <MobileManagerNav hasContingent={hasContingent} />
    </ManagerThemeProvider>
  );
}
