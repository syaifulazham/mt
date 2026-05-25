import type { Metadata } from "next";
import { Award } from "lucide-react";

export const metadata: Metadata = { title: "Sijil" };

export default function CertificatesPage() {
  return (
    <div className="max-w-xl space-y-5">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold dark:text-zinc-100">Sijil</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sijil pencapaian pertandingan
        </p>
      </div>

      {/* Coming-soon card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-10 flex flex-col items-center text-center gap-5">
        <div className="rounded-full bg-amber-50 dark:bg-amber-950/30 p-5">
          <Award
            className="h-10 w-10 text-amber-500 dark:text-amber-400"
            strokeWidth={1.5}
          />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold dark:text-zinc-100">
            Sijil akan tersedia tidak lama lagi
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
            Sijil akan tersedia selepas pertandingan tamat. Semak semula
            kemudian.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Akan datang
          </span>
        </div>
      </div>
    </div>
  );
}
