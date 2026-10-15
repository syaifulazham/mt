import { ShieldCheck } from "lucide-react";

/** Judging lifecycle of a competition, as the results pages receive it. */
export type ResultsJudging = { status: string; verifiedAt: string | null; verifiedBy: string | null };

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
