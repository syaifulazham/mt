import { redirect } from "next/navigation";
import Link from "next/link";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { ParticipantSidebar } from "@/components/participant/ParticipantSidebar";
import { ParticipantMobileNav } from "@/components/participant/ParticipantMobileNav";
import { ParticipantThemeProvider } from "@/components/participant/ParticipantThemeProvider";
import { ParticipantThemePicker } from "@/components/participant/ParticipantThemePicker";
import { db } from "@/lib/db";

export default async function ParticipantPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const participant = await db.participant.findUnique({
    where: { id: session.participantId },
    include: { contingent: { select: { name: true } } },
  });

  const contingentName = participant?.contingent?.name ?? "—";

  return (
    <ParticipantThemeProvider className="flex min-h-screen flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="pt-header sticky top-0 z-40 border-b px-6 py-3 flex items-center justify-between"
        style={{
          background:        "var(--pt-header-bg, white)",
          borderBottomColor: "var(--pt-border-color, #e4e4e7)",
          boxShadow:         "var(--pt-header-shadow, none)",
        }}
      >
        <Link href="/participant/profile" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mt.svg"
            alt="Techlympics"
            className="pt-logo h-8 w-auto"
          />
          <span
            className="pt-portal-label hidden sm:block text-xs border-l pl-3"
            style={{ color: "var(--pt-muted, #71717a)", borderColor: "var(--pt-border-color, #e4e4e7)" }}
          >
            Portal Peserta
          </span>
        </Link>

        <ParticipantThemePicker />
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <ParticipantSidebar name={session.name} contingentName={contingentName} />
        <main
          className="pt-main flex-1 overflow-y-auto p-6 pb-24 lg:pb-6"
          style={{ background: "var(--pt-main-bg, #f9fafb)" }}
        >
          {children}
        </main>
      </div>

      <ParticipantMobileNav />
    </ParticipantThemeProvider>
  );
}
