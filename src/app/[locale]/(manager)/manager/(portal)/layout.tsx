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

  // Allow access if profile is complete OR if already active in a contingent
  // (covers manager accounts activated by organizer before completing onboarding)
  const activeContingentManager = profile
    ? await db.contingentManager.findFirst({
        where: { managerId: profile.id, status: "ACTIVE" },
        select: { id: true },
      })
    : null;

  if (!profile?.profileComplete && !activeContingentManager) redirect("/manager/onboarding");
  if (!profile) redirect("/manager/onboarding");

  const institutionLabel =
    profile.school?.name ??
    profile.higherInstitution?.name ??
    (profile.institutionType === "INDEPENDENT" ? "Independent Group" : "International");

  const hasContingent = !!activeContingentManager;

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
