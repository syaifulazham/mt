"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Sample = {
  index: number; name: string; ic: string | null; teamName: string | null; contingentName: string | null;
  stateName: string | null; competitionCode: string | null; competitionName: string | null; awardTitle: string | null;
};
type Data = { total: number; samples: Sample[]; empty: { field: string; count: number }[]; warnings: string[] };

/**
 * Pratonton before "Jana": a spread of the generator's recipients, each
 * rendered exactly as Jana would (template's current version) — but nothing is
 * issued, and the serial and verification code read "CONTOH".
 */
export function GeneratorSampleDialog({ job, onClose }: { job: { id: string; templateName: string }; onClose: () => void }) {
  const api = `/api/v2/organizer/certificates/generator/${job.id}/sample`;
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" }).then(async r => {
      const j = await r.json();
      if (!alive) return;
      if (!r.ok) setErr(j.error ?? "Gagal memuatkan pratonton"); else setData(j);
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [api]);

  const n = data?.samples.length ?? 0;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-sky-600" /> Pratonton — {job.templateName}</DialogTitle>
          <DialogDescription>
            Contoh sijil seperti yang akan dijana. Tiada sijil dikeluarkan dan tiada nombor siri digunakan — siri dan kod pengesahan dipaparkan sebagai &ldquo;CONTOH&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="m-auto text-sm text-zinc-400">{err || <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Menyediakan contoh…</>}</p>
        ) : n === 0 ? (
          <p className="m-auto text-sm text-zinc-500">Tiada penerima yang sepadan dengan tetapan penjana ini.</p>
        ) : (
          <>
            {(data.empty.length > 0 || data.warnings.length > 0) && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {data.empty.map(e => (
                  <p key={e.field} className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Medan <b>{e.field}</b> kosong bagi {e.count} daripada {n} contoh — akan tercetak kosong.
                  </p>
                ))}
                {data.warnings.map(w => (
                  <p key={w} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}</p>
                ))}
              </div>
            )}
            <div className="flex min-h-0 flex-1 gap-3">
              <aside className="w-72 shrink-0 overflow-y-auto rounded-lg border">
                <p className="border-b bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
                  {n} contoh daripada {data.total.toLocaleString()} penerima
                </p>
                <ul className="divide-y">
                  {data.samples.map(s => (
                    <li key={s.index}>
                      <button type="button" onClick={() => setIndex(s.index)}
                        className={cn("w-full px-3 py-2 text-left text-xs", index === s.index ? "bg-sky-50" : "hover:bg-zinc-50")}>
                        <span className={cn("block font-medium", s.name ? "text-zinc-800" : "italic text-zinc-400")}>{s.name || "Sijil kosong (pra-acara)"}</span>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {[s.competitionCode, s.awardTitle, s.stateName].filter(Boolean).join(" · ")}
                        </span>
                        {(s.teamName || s.contingentName) && (
                          <span className="block truncate text-[11px] text-zinc-400">{[s.teamName, s.contingentName].filter(Boolean).join(" · ")}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <iframe key={index} src={`${api}?index=${index}#toolbar=0&view=FitH`} title="Contoh sijil"
                className="min-w-0 flex-1 rounded-lg border bg-zinc-100" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
