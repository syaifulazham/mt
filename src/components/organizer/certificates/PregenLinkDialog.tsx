"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Loader2, Search, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Slot = { certId: string; serial: string; member: number; assignedKey: string | null; assignedName: string | null };
type Winner = { key: string; name: string; teamName: string | null; contingentName: string | null; certId: string | null; extraSerial: string | null };
type Group = { key: string; compCode: string | null; compName: string | null; stateName: string | null; rank: number; awardTitle: string; slots: Slot[]; winners: Winner[] };
type Plan = { groups: Group[]; totals: { blanks: number; linked: number; winners: number } };
type Summary = { linked: number; cleared: number; created: number; revoked: number };

const NEW = "";   // select value: no blank → new certificate

/**
 * Pre-event "Pencapaian Acara": tie the printed blanks to the actual winners.
 * Each competition × state × rank lists its winners with a blank serial each
 * (proposed in member order); swap serials to match the physical copies, or
 * pick "Sijil baharu" to issue a fresh certificate instead.
 */
export function PregenLinkDialog({ job, onClose }: { job: { id: string; templateName: string }; onClose: () => void }) {
  const api = `/api/v2/organizer/certificates/generator/${job.id}/link`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const apply = (p: Plan) => {
    setPlan(p);
    setMap(Object.fromEntries(p.groups.flatMap(g => g.winners.map(w => [w.key, w.certId ?? NEW]))));
  };

  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" }).then(async r => {
      const j = await r.json();
      if (!alive) return;
      if (!r.ok) setErr(j.error ?? "Gagal memuatkan"); else apply(j);
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [api]);

  /** Member order: winner 1 → blank 1 … in every group, ignoring earlier links. */
  function autoMap() {
    if (!plan) return;
    const next: Record<string, string> = {};
    for (const g of plan.groups) {
      const slots = [...g.slots].sort((a, b) => a.member - b.member);
      g.winners.forEach((w, i) => { next[w.key] = slots[i]?.certId ?? NEW; });
    }
    setMap(next);
  }

  async function save() {
    setSaving(true); setErr(""); setSummary(null);
    try {
      const res = await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v || null])) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal menyimpan");
      apply(j); setSummary(j.summary);
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!plan) return [];
    return !t ? plan.groups : plan.groups.filter(g =>
      `${g.compCode} ${g.compName} ${g.stateName ?? ""}`.toLowerCase().includes(t)
      || g.winners.some(w => `${w.name} ${w.teamName ?? ""} ${w.contingentName ?? ""}`.toLowerCase().includes(t)));
  }, [plan, q]);

  const used = new Set(Object.values(map).filter(Boolean));
  const willLink = plan ? plan.groups.reduce((n, g) => n + g.winners.filter(w => map[w.key]).length, 0) : 0;
  const willNew = plan ? plan.groups.reduce((n, g) => n + g.winners.filter(w => !map[w.key] && !w.extraSerial).length, 0) : 0;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-600" /> Padankan pemenang — {job.templateName}</DialogTitle>
          <DialogDescription>
            Setiap pemenang diberi sijil kosong pra-cetak bagi pertandingan, negeri dan kedudukan yang sama (ahli 1 → sijil #1 …).
            Tukar nombor siri untuk sepadan dengan salinan bercetak. Pemenang tanpa sijil kosong diberi sijil baharu; sijil kosong yang
            tidak digunakan kekal tersembunyi.
          </DialogDescription>
        </DialogHeader>

        {!plan ? (
          <p className="py-10 text-center text-sm text-zinc-400">{err || <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</>}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari pertandingan, negeri, nama…"
                  className="h-8 w-64 rounded-md border bg-white pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200" />
              </div>
              <span className="text-zinc-500">
                {plan.totals.blanks} sijil kosong · {plan.totals.linked} telah dipadankan · {plan.totals.winners} pemenang
              </span>
              <Button size="sm" variant="outline" className="ml-auto h-8" onClick={autoMap}><Wand2 className="mr-1.5 h-3.5 w-3.5" /> Auto-padan ikut ahli</Button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {groups.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Tiada padanan.</p>}
              {groups.map(g => {
                const free = g.slots.filter(s => !used.has(s.certId));
                return (
                  <div key={g.key} className="rounded-lg border bg-white">
                    <div className="flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-3 py-2 text-xs">
                      <span className="font-mono font-semibold text-zinc-500">{g.compCode}</span>
                      <span className="font-medium text-zinc-800">{g.compName}</span>
                      {g.stateName && <span className="rounded bg-white px-1.5 py-0.5 text-zinc-600 ring-1 ring-zinc-200">{g.stateName}</span>}
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">{g.awardTitle}</span>
                      <span className="ml-auto text-zinc-400">{g.slots.length} sijil kosong · {g.winners.length} pemenang</span>
                    </div>
                    {g.winners.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-zinc-400">Tiada pemenang — {g.slots.length} sijil tidak digunakan.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody className="divide-y">
                          {g.winners.map(w => (
                            <tr key={w.key}>
                              <td className="px-3 py-1.5">
                                <span className="font-medium text-zinc-800">{w.name}</span>
                                <span className="block text-[11px] text-zinc-400">{[w.teamName, w.contingentName].filter(Boolean).join(" · ")}</span>
                              </td>
                              <td className="w-72 px-3 py-1.5">
                                <select value={map[w.key] ?? NEW} onChange={e => setMap({ ...map, [w.key]: e.target.value })}
                                  className={cn("h-8 w-full rounded-md border bg-white px-2 font-mono text-[11px]", !map[w.key] && "text-amber-700")}>
                                  {g.slots.map(s => (
                                    <option key={s.certId} value={s.certId} disabled={used.has(s.certId) && map[w.key] !== s.certId}>
                                      #{s.member} {s.serial}{used.has(s.certId) && map[w.key] !== s.certId ? " — dipilih" : ""}
                                    </option>
                                  ))}
                                  <option value={NEW}>{w.extraSerial ? `Sijil baharu (sedia ada: ${w.extraSerial})` : "Sijil baharu (siri baharu)"}</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {g.winners.length > 0 && free.length > 0 && (
                      <p className="border-t px-3 py-1.5 text-[11px] text-zinc-400">
                        Tidak digunakan: {free.map(s => `#${s.member} ${s.serial}`).join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {summary && (
          <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {summary.linked} dipadankan · {summary.created} sijil baharu · {summary.cleared} dikosongkan semula
            {summary.revoked > 0 && ` · ${summary.revoked} sijil baharu terdahulu dibatalkan (diganti sijil pra-cetak)`}
          </p>
        )}
        {err && plan && <p className="text-xs text-red-600">{err}</p>}

        <DialogFooter className="items-center">
          {plan && <span className="mr-auto text-xs text-zinc-500">{willLink} ke sijil pra-cetak · {willNew} sijil baharu</span>}
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button onClick={save} disabled={!plan || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />} Simpan padanan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
