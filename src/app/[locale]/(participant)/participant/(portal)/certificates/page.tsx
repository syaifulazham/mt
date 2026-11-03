import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { getCertDistribution } from "@/lib/certificates/distribution";
import { participantCertificatesAllSeasons } from "@/lib/certificates/portal";
import { SeasonCertList } from "@/components/certificates/SeasonCertList";

export const metadata: Metadata = { title: "Sijil" };
export const dynamic = "force-dynamic";

// Participant portal → Sijil: the participant's own certificates, grouped by
// Techlympics year. Current-season certificates appear once the organizer has
// switched on Certificates → Distribution → participant portal and the
// generator gave them a level; past seasons (e.g. 2025) are matched by IC.
export default async function CertificatesPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  const distribution = await getCertDistribution();
  const certs = distribution.participant
    ? await participantCertificatesAllSeasons({ id: session.participantId, ic: session.ic })
    : [];

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Sijil</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sijil penyertaan dan pencapaian anda. Klik sijil untuk memuat turun PDF.
        </p>
      </div>

      {certs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="rounded-full bg-amber-50 p-5 dark:bg-amber-950/30">
            <Award className="h-10 w-10 text-amber-500 dark:text-amber-400" strokeWidth={1.5} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold dark:text-zinc-100">
              {distribution.participant ? "Tiada sijil lagi" : "Sijil belum diedarkan"}
            </h2>
            <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              {distribution.participant
                ? "Sijil anda akan dipaparkan di sini selepas dijana oleh penganjur."
                : "Sijil akan tersedia selepas penganjur mengedarkannya. Semak semula kemudian."}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-2.5 rounded-sm bg-emerald-600" /> Penyertaan</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-2.5 rounded-sm bg-violet-600" /> Pencapaian</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Acara dalam talian</span>
          </div>
          <SeasonCertList certs={certs} />
        </div>
      )}
    </div>
  );
}
