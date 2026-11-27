"use client";

import { useEffect, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

// "Lihat": shows the PAJSK certificate in a modal. The PDF is fetched as a blob
// (same route as the download, rendered in memory) so frame headers can't block it.
export function PajskViewButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pdf = `/api/v2/pajsk/certificates/${id}/pdf`;

  useEffect(() => {
    if (!open) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      setUrl(null); setError(null);
      try {
        const res = await fetch(`${pdf}?inline=1`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            j.error ?? (res.status === 410 ? "Sijil ini telah ditarik balik." : res.status === 403 ? "Tiada akses." : `Ralat ${res.status}`),
          );
        }
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Sijil gagal dipaparkan.");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, pdf]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN}>
        <Eye className="h-3.5 w-3.5" /> Lihat
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-sm">{title}</DialogTitle>
          </DialogHeader>
          {error ? (
            <p className="py-10 text-center text-sm text-red-600">{error}</p>
          ) : !url ? (
            <div className="flex h-[75vh] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : (
            <iframe src={url} title={title} className="h-[75vh] w-full rounded-md border dark:border-zinc-700" />
          )}
          <div className="flex justify-end">
            <a href={pdf} className={BTN}>
              <Download className="h-3.5 w-3.5" /> Muat turun
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
