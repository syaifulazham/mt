import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { BetaBadge } from "./PajskEntryList";

/** Entry point to PAJSK (Beta) on the manager Certificates page — rendered only when it is open to the manager. */
export function PajskManagerLink() {
  return (
    <Link
      href="/manager/certificates/pajsk"
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm transition-colors hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
    >
      <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-600" />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-100">PAJSK <BetaBadge /></span>
        <span className="text-zinc-600 dark:text-zinc-400">Markah PAJSK dan sijil PAJSK peserta kontinjen anda.</span>
      </span>
      <ChevronRight className="h-4 w-4 text-zinc-400" />
    </Link>
  );
}
