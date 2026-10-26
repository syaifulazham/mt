"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pin, ChevronRight } from "lucide-react";
import { PINNED_EVENTS_KEY } from "./pinnedEvents";

// The Events page pins events per browser in localStorage; this lists them on
// the organizer home page. Only the fields shown here are read.
type PinnedEvent = { id: string; name: string; slug: string; status: string; startDate: string | null };

const DOT: Record<string, string> = {
  PUBLISHED: "#10b981",
  ACTIVE:    "#10b981",
  COMPLETED: "#7c3aed",
  ARCHIVE:   "#a1a1aa",
  CANCELLED: "#a1a1aa",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

export function PinnedEventsList() {
  // null = not read yet (avoids flashing the empty state before hydration)
  const [pinned, setPinned] = useState<PinnedEvent[] | null>(null);

  useEffect(() => {
    let list: PinnedEvent[] = [];
    try {
      const p = JSON.parse(localStorage.getItem(PINNED_EVENTS_KEY) ?? "[]");
      if (Array.isArray(p)) list = p.filter((e) => e && e.id && e.slug && e.name);
    } catch { /* corrupt or unavailable storage */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(list);
  }, []);

  if (pinned === null) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        <Pin className="h-3 w-3 fill-amber-400 text-amber-500" />
        Pinned events ({pinned.length})
      </p>
      {pinned.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-zinc-400">
          No pinned events. Use the pin icon in the Events list to add one here.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {pinned.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/organizer/events/${ev.slug}/manage`}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: DOT[ev.status] ?? "#0ea5e9" }}
                  title={ev.status}
                />
                <span className={ev.status === "ARCHIVE" ? "truncate text-zinc-400 line-through" : "truncate font-medium"}>
                  {ev.name}
                </span>
                {ev.startDate && (
                  <span className="shrink-0 text-xs text-zinc-400">{fmtDate(ev.startDate)}</span>
                )}
                <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
