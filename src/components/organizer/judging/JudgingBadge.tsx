import { Hourglass, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JudgingRow } from "@/lib/judgingStatus";

/** Judging lifecycle of a competition, as the results pages receive it. */
export type ResultsJudging = {
  status: string; verifiedAt: string | null; verifiedBy: string | null;
  /** judging-status endpoint for Verify / Buka Semula (Super Admin only). */
  statusUrl?: string;
  /** Per-state judging rows ("Semua" first) for the verification table. */
  rows?: JudgingRow[];
};

/**
 * Colour scheme for a results card and its header, by judging status — so a
 * VERIFIED competition is unmistakable (green header, green outline) and one
 * awaiting verification reads amber. OPEN keeps the neutral look. The header
 * stays light enough that its tabs and group labels remain readable.
 */
export function judgingTheme(status?: string) {
  if (status === "VERIFIED") return {
    card:   "border-emerald-400 ring-2 ring-emerald-200",
    header: "bg-emerald-100 border-emerald-300",
    title:  "text-emerald-900",
    icon:   "text-emerald-600",
    code:   "text-emerald-700",
  };
  if (status === "COMPLETED") return {
    card:   "border-amber-300",
    header: "bg-amber-50 border-amber-200",
    title:  "text-amber-900",
    icon:   "text-amber-500",
    code:   "text-amber-700",
  };
  return { card: "", header: "bg-zinc-50", title: "text-zinc-700", icon: "", code: "" };
}

/** Strip under the results header: who verified and when, or that it awaits verification. */
export function JudgingStatusStrip({ judging }: { judging?: ResultsJudging }) {
  if (judging?.status === "VERIFIED")
    return (
      <div className="flex items-center gap-2 px-5 py-2 border-b border-emerald-200 bg-emerald-50 text-xs text-emerald-800">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          <b>Keputusan disahkan (VERIFIED)</b>
          {judging.verifiedBy && <> oleh <b>{judging.verifiedBy}</b></>}
          {judging.verifiedAt && <> pada {new Date(judging.verifiedAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}</>}
          . Penghakiman dikunci.
        </span>
      </div>
    );
  if (judging?.status === "COMPLETED")
    return (
      <div className={cn("flex items-center gap-2 px-5 py-2 border-b border-amber-200 bg-amber-50/60 text-xs text-amber-800")}>
        <Hourglass className="h-4 w-4 text-amber-500 shrink-0" />
        <span><b>Penghakiman selesai</b> — menunggu pengesahan Super Admin. Keputusan belum muktamad.</span>
      </div>
    );
  return null;
}

/**
 * VERIFIED / pending-verification marker for a competition's results — used by
 * the regular and walk-in results pages. Nothing while judging is still OPEN.
 */
export function JudgingBadge({ judging }: { judging?: ResultsJudging }) {
  if (judging?.status === "VERIFIED")
    return (
      <span
        title={`Disahkan oleh ${judging.verifiedBy ?? "Super Admin"}${judging.verifiedAt ? ` pada ${new Date(judging.verifiedAt).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" })}` : ""}`}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
      >
        <ShieldCheck className="h-3 w-3" /> VERIFIED
      </span>
    );
  if (judging?.status === "COMPLETED")
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
        SELESAI · belum disahkan
      </span>
    );
  return null;
}
