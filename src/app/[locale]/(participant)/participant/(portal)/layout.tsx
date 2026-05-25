import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { ParticipantSidebar } from "@/components/participant/ParticipantSidebar";
import { ParticipantMobileNav } from "@/components/participant/ParticipantMobileNav";
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
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white dark:bg-zinc-900 dark:border-zinc-800 px-6 py-3 flex items-center justify-between">
        <Link href="/participant/profile" className="flex items-center gap-3">
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
            Portal Peserta
          </span>
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ParticipantSidebar
          name={session.name}
          contingentName={contingentName}
        />
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      <ParticipantMobileNav />
    </div>
  );
}
