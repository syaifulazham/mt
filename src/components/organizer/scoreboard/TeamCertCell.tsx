"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";

/** Certificate count per team of a competition (Scoreboard's Sijil column). Re-read every minute. */
export function useTeamCertCounts(eventId: string, ecId: string) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    // No ids = disabled (e.g. a duel control link, which has no organizer session).
    if (!eventId || !ecId) return;
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${ecId}/certificates`, { cache: "no-store" });
        if (res.ok && !stop) setCounts((await res.json()).teams ?? {});
      } catch { /* keep the last counts */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [eventId, ecId]);
  return counts;
}

/** Opens the team's certificate preview page when the team has any certificate. */
export function TeamCertCell({ eventSlug, ecId, teamId, count }: {
  eventSlug: string; ecId: string; teamId: string; count: number | undefined;
}) {
  if (!count) return <span className="text-zinc-300">—</span>;
  return (
    <Link
      href={`/organizer/events/${eventSlug}/manage/scoreboard/${ecId}/certificates/${teamId}`}
      title={`${count} sijil — pratonton`}
      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
    >
      <Award className="h-3.5 w-3.5" />{count}
    </Link>
  );
}
