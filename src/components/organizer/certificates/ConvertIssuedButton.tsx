"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Template editor: "Convert to vN" — move issued certificates still on an older
// published version to the current one (admin-only exception to "issued
// certificates keep their version"). Shown only when there is something to convert.

type Status = { current: { version: number } | null; byVersion: { version: number; count: number }[]; outdated: number; archived: boolean };

export function ConvertIssuedButton({ templateId, refreshKey }: { templateId: string; refreshKey: number }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/v2/organizer/certificates/templates/${templateId}/convert-issued`, { cache: "no-store" });
    if (r.ok) setStatus(await r.json());
  }, [templateId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload after publish
    load();
  }, [load, refreshKey]);

  async function convert() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/v2/organizer/certificates/templates/${templateId}/convert-issued`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setOpen(false);
      setMsg(`${j.converted.toLocaleString()} sijil kini menggunakan v${j.version}`);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  if (!status?.current || status.archived || status.outdated === 0)
    return msg ? <span className="text-[11px] text-emerald-700">{msg}</span> : null;

  const older = status.byVersion.filter(v => v.version !== status.current!.version);
  return (
    <>
      <Button size="sm" variant="outline" className="h-8 border-amber-300 bg-amber-50 text-xs text-amber-800 hover:bg-amber-100" onClick={() => setOpen(true)}>
        <ArrowUpCircle className="mr-1 h-3.5 w-3.5" />
        {status.outdated.toLocaleString()} issued on older version → Convert to v{status.current.version}
      </Button>
      <Dialog open={open} onOpenChange={o => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tukar sijil dikeluarkan ke v{status.current.version}?</DialogTitle>
            <DialogDescription>
              {status.outdated.toLocaleString()} sijil yang telah dikeluarkan akan dipaparkan dengan reka letak versi terkini
              (v{status.current.version}). Nombor siri, kod pengesahan dan maklumat penerima tidak berubah. Sijil yang dibatalkan
              tidak ditukar. Sesiapa yang memuat turun semula akan mendapat reka letak baharu.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {older.map(v => <p key={v.version}>v{v.version}: {v.count.toLocaleString()} sijil → v{status.current!.version}</p>)}
          </div>
          {msg && <p className="text-xs text-red-600">{msg}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={convert} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Tukar ke v{status.current.version}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
