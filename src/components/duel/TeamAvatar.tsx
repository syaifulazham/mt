"use client";

import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * What a team's badge shows: "flag" (national scope — teams from many states,
 * so the state flag tells them apart; falls back to the contingent logo) or
 * "logo" (state scope — every team shares the flag, so the contingent logo).
 */
export type AvatarPrefer = "flag" | "logo";
const PreferContext = createContext<AvatarPrefer>("flag");

export function AvatarPreference({ value, children }: { value: AvatarPrefer; children: React.ReactNode }) {
  return <PreferContext.Provider value={value}>{children}</PreferContext.Provider>;
}

/** Badge preference for a duel scope. */
export const preferFor = (scope: string | undefined): AvatarPrefer => (scope === "STATE" ? "logo" : "flag");

/**
 * A round badge for a team: state flag or contingent logo (see AvatarPrefer),
 * else initials. Used on the duel manager and the public duel boards.
 */
export function TeamAvatar({ flagUrl, logoUrl, name, className, prefer }: {
  flagUrl?: string | null; logoUrl?: string | null; name: string; className?: string; prefer?: AvatarPrefer;
}) {
  const mode = useContext(PreferContext);
  const want = prefer ?? mode;
  const sources = (want === "logo" ? [logoUrl] : [flagUrl, logoUrl]).filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    // A size container, so the initials scale with whatever size the badge is given.
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 font-bold text-zinc-600 ring-1 ring-black/5", className ?? "h-8 w-8")}
      style={{ containerType: "size" }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={src} src={src} alt="" className={cn("h-full w-full", want === "logo" ? "object-contain p-[8%]" : "object-cover")} onError={() => setFailed(f => f + 1)} />
        : <span className="leading-none tracking-tight" style={{ fontSize: initials.length > 1 ? "36cqmin" : "44cqmin" }}>{initials}</span>}
    </span>
  );
}
