import type { Metadata } from "next";
import Link from "next/link";
import { Globe2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/auth/session";
import { OrganizerShell } from "@/components/organizer/OrganizerShell";
import { db } from "@/lib/db";
import { INTERNATIONAL_ROLES } from "@/lib/international";
import { InternationalParticipationClient } from "@/components/organizer/events/InternationalParticipationClient";
import { OpenInternationalButton } from "@/components/organizer/events/OpenInternationalButton";

export const metadata: Metadata = { title: "Penyertaan Antarabangsa" };

export default async function EventInternationalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect("/organizer/login");

  const { slug } = await params;
  if (!(INTERNATIONAL_ROLES as readonly string[]).includes(session.role))
    redirect(`/organizer/events/${slug}/manage`);

  const event = await db.event.findUnique({
    where:  { slug },
    select: { id: true, name: true, slug: true, allowInternational: true },
  });
  if (!event) redirect("/organizer/events");

  // Switched on per event (Acara → Penyertaan Antarabangsa).
  if (!event.allowInternational)
    return (
      <OrganizerShell userName={session.name} role={session.role}>
        <div className="mx-auto max-w-xl space-y-3 p-10 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="text-lg font-semibold text-zinc-800">Penyertaan antarabangsa belum dibuka untuk acara ini</p>
          <p className="text-sm text-zinc-500">
            Buka pilihan ini untuk mendaftar sekolah luar negara ke <b>{event.name}</b> — termasuk melalui pautan pihak ketiga.
            Ia boleh ditutup semula di tetapan acara (<b>Penyertaan Antarabangsa</b>).
          </p>
          <div className="flex justify-center"><OpenInternationalButton eventId={event.id} /></div>
          <Link href={`/organizer/events/${event.slug}/manage`} className="inline-block text-sm text-zinc-500 hover:underline">← Kembali ke acara</Link>
        </div>
      </OrganizerShell>
    );

  return (
    <OrganizerShell userName={session.name} role={session.role}>
      <InternationalParticipationClient event={event} />
    </OrganizerShell>
  );
}
