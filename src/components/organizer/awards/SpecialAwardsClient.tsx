"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Award, Loader2, Pencil, Plus, Search, Trash2, UserRoundCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDuration } from "@/lib/judgingTime";
import { cn } from "@/lib/utils";

type Winner = {
  rank: number; custom?: boolean; teamId: string | null; teamName: string | null; participantId: string | null; participantName: string | null;
  contingentName: string | null; stateName: string | null; score: number | null; bestTime: number | null;
};
type AwardRow = {
  id: string; name: string; basis: string; recipientType: string; method: string;
  eventCompetitionId: string | null; competition: { code: string; name: string; participationType: string } | null;
  templateIds: string[]; templates: { id: string; name: string; code: string }[];
  places: number; winners: Winner[]; warning: string | null;
};
type Competition = {
  id: string; code: string; name: string; participationType: string; judgingMethod: string;
  templates: { id: string; name: string; code: string }[];
};
type Form = {
  name: string; basis: "COMPETITION" | "CUSTOM"; recipientType: "TEAM" | "INDIVIDUAL";
  eventCompetitionId: string; method: "TEMPLATE" | "CUSTOM"; templateIds: string[]; places: string;
};

const EMPTY: Form = { name: "", basis: "COMPETITION", recipientType: "TEAM", eventCompetitionId: "", method: "TEMPLATE", templateIds: [], places: "1" };
const PLACE = ["", "bg-amber-100 text-amber-800", "bg-zinc-200 text-zinc-700", "bg-orange-100 text-orange-800"];

/**
 * Anugerah Tambahan: awards beside the competitions' ranked places — ranked
 * live from chosen judging templates, or winners picked by hand.
 */
export function SpecialAwardsClient({ event, canWrite }: { event: { id: string; name: string; slug: string }; canWrite: boolean }) {
  const api = `/api/v2/organizer/events/${event.id}/special-awards`;
  const [awards, setAwards] = useState<AwardRow[] | null>(null);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [picking, setPicking] = useState<AwardRow | null>(null);
  const [del, setDel] = useState<AwardRow | null>(null);

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetch(api, { cache: "no-store" }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok) { setErr(j.message ?? j.error ?? "Gagal memuatkan"); return; }
      setAwards(j.awards); setCompetitions(j.competitions);
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [api, tick]);

  const formOf = (a: AwardRow): Form => ({
    name: a.name, basis: a.basis === "CUSTOM" ? "CUSTOM" : "COMPETITION", recipientType: a.recipientType === "INDIVIDUAL" ? "INDIVIDUAL" : "TEAM",
    eventCompetitionId: a.eventCompetitionId ?? "", method: a.method === "TEMPLATE" ? "TEMPLATE" : "CUSTOM", templateIds: a.templateIds, places: String(a.places),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage`} className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900"><Award className="h-5 w-5 text-fuchsia-600" /> Anugerah Tambahan</h1>
          <p className="text-sm text-zinc-500">{event.name} · anugerah selain tempat utama pertandingan, cth. pembentang terbaik atau reka bentuk terbaik.</p>
        </div>
        {canWrite && (
          <Button className="gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-700" onClick={() => setEditing({ id: null, form: EMPTY })}>
            <Plus className="h-4 w-4" /> Anugerah baharu
          </Button>
        )}
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" /> {err}</p>}

      {!awards ? (
        <p className="py-16 text-center text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</p>
      ) : awards.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-zinc-400">
          Belum ada anugerah tambahan.{canWrite && " Klik “Anugerah baharu” untuk mula."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {awards.map(a => (
            <div key={a.id} className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900">{a.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">
                      {a.competition ? <><span className="font-mono">{a.competition.code}</span> {a.competition.name}</> : "Bebas (semua pertandingan)"}
                    </span>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{a.recipientType === "INDIVIDUAL" ? "Individu" : "Pasukan"}</span>
                    <span className={cn("rounded-full px-2 py-0.5", a.method === "TEMPLATE" ? "bg-violet-50 text-violet-700" : "bg-fuchsia-50 text-fuchsia-700")}>
                      {a.method === "TEMPLATE" ? `Templat: ${a.templates.map(t => t.name).join(" + ") || "—"}` : "Pilih manual"}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{a.places} tempat</span>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <button title="Sunting" onClick={() => setEditing({ id: a.id, form: formOf(a) })} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button title="Padam" onClick={() => setDel(a)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>

              {a.warning && <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.warning}</p>}

              <ul className="divide-y rounded-xl border">
                {a.winners.length === 0 && (
                  <li className="px-3 py-3 text-center text-xs text-zinc-400">
                    {a.method === "TEMPLATE" ? "Belum ada markah bagi templat ini." : "Belum ada pemenang dipilih."}
                  </li>
                )}
                {a.winners.map((w, i) => (
                  <li key={`${w.teamId}-${w.participantId}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", PLACE[w.rank] ?? "bg-zinc-100 text-zinc-600")}>{w.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-800">{w.participantName ?? w.teamName ?? "—"}</span>
                      <span className="block truncate text-[11px] text-zinc-400">
                        {[w.participantName ? w.teamName : null, w.contingentName, w.stateName].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {w.score != null && (
                      <span className="shrink-0 text-right font-mono text-xs text-zinc-600">
                        {w.score}{w.bestTime != null && <span className="block text-[10px] text-zinc-400">{formatDuration(w.bestTime)}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {canWrite && a.method !== "TEMPLATE" && (
                <Button size="sm" variant="outline" className="h-8 w-full gap-1.5" onClick={() => setPicking(a)}>
                  <UserRoundCheck className="h-3.5 w-3.5" /> Pilih pemenang
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AwardForm api={api} competitions={competitions} initial={editing.form} id={editing.id}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {picking && (
        <WinnerPicker api={api} award={picking} onClose={() => setPicking(null)} onSaved={() => { setPicking(null); reload(); }} />
      )}
      <ConfirmDialog open={!!del} onOpenChange={o => { if (!o) setDel(null); }} destructive
        title="Padam anugerah ini?" description={del ? `“${del.name}” dan pemenangnya akan dipadam.` : ""} confirmLabel="Padam"
        onConfirm={async () => {
          if (del) {
            const r = await fetch(`${api}/${del.id}`, { method: "DELETE" });
            if (!r.ok) setErr((await r.json().catch(() => ({}))).message ?? "Gagal memadam");
          }
          setDel(null); reload();
        }} />
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(([k, label, hint]) => (
        <label key={k} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-2.5", value === k ? "border-fuchsia-400 ring-1 ring-fuchsia-200" : "border-zinc-200")}>
          <input type="radio" checked={value === k} onChange={() => onChange(k)} className="mt-0.5 accent-fuchsia-600" />
          <span>
            <span className="block text-sm font-medium text-zinc-800">{label}</span>
            <span className="block text-[11px] text-zinc-500">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function AwardForm({ api, competitions, initial, id, onClose, onSaved }: {
  api: string; competitions: Competition[]; initial: Form; id: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch: Partial<Form>) => setF(p => ({ ...p, ...patch }));
  const comp = competitions.find(c => c.id === f.eventCompetitionId);
  const byTemplate = f.basis === "COMPETITION" && f.method === "TEMPLATE";
  const teamScoredIndividual = byTemplate && f.recipientType === "INDIVIDUAL" && comp && comp.participationType !== "INDIVIDUAL";

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(id ? `${api}/${id}` : api, {
      method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, places: Number(f.places), method: f.basis === "CUSTOM" ? "CUSTOM" : f.method }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal menyimpan"); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{id ? "Sunting anugerah" : "Anugerah tambahan baharu"}</DialogTitle>
          <DialogDescription>Anugerah selain tempat utama — dikira daripada templat penghakiman atau pemenang dipilih secara manual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-6 pt-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-600">1. Nama anugerah</span>
            <Input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="cth. Pembentang Terbaik" maxLength={120} />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-600">2. Asas anugerah</span>
            <Choice value={f.basis} onChange={basis => set({ basis })} options={[
              ["COMPETITION", "Pertandingan", "Bagi satu pertandingan acara ini."],
              ["CUSTOM", "Bebas", "Tidak terikat pada pertandingan — pilih pemenang dari semua penyertaan."],
            ]} />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-600">3. Penerima</span>
            <Choice value={f.recipientType} onChange={recipientType => set({ recipientType })} options={[
              ["TEAM", "Pasukan", "Anugerah kepada pasukan."],
              ["INDIVIDUAL", "Individu", "Anugerah kepada peserta, cth. pembentang terbaik."],
            ]} />
          </div>

          {f.basis === "COMPETITION" && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-zinc-600">Pertandingan</span>
                <select value={f.eventCompetitionId} onChange={e => set({ eventCompetitionId: e.target.value, templateIds: [] })}
                  className="h-9 w-full rounded-md border bg-white px-2 text-sm">
                  <option value="">— Pilih pertandingan —</option>
                  {competitions.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
              </label>
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-600">4. Penentuan pemenang</span>
                <Choice value={f.method} onChange={method => set({ method })} options={[
                  ["TEMPLATE", "Templat penghakiman", "Kedudukan dikira daripada markah templat yang dipilih (A, atau A + B dijumlahkan)."],
                  ["CUSTOM", "Pilih manual", "Pilih pemenang sendiri daripada penyertaan pertandingan ini."],
                ]} />
              </div>
              {byTemplate && (
                <div className="space-y-1.5 rounded-xl border bg-zinc-50 p-3">
                  <span className="text-xs font-semibold text-zinc-600">Templat {f.templateIds.length > 1 && <span className="font-normal text-zinc-400">(markah dijumlahkan)</span>}</span>
                  {!comp ? <p className="text-xs text-zinc-400">Pilih pertandingan dahulu.</p>
                    : comp.templates.length === 0 ? <p className="text-xs text-amber-700">Pertandingan ini belum mempunyai templat penghakiman — tetapkan di halaman Penghakiman.</p>
                    : (
                      <div className="flex flex-wrap gap-2">
                        {comp.templates.map(t => {
                          const on = f.templateIds.includes(t.id);
                          return (
                            <label key={t.id} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs", on ? "border-violet-400 text-violet-700" : "text-zinc-600")}>
                              <input type="checkbox" checked={on} className="accent-violet-600"
                                onChange={() => set({ templateIds: on ? f.templateIds.filter(x => x !== t.id) : [...f.templateIds, t.id] })} />
                              {t.name} <span className="font-mono text-[10px] text-zinc-400">{t.code}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  {teamScoredIndividual && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Markah dinilai bagi pasukan — anugerah individu bagi pertandingan berpasukan perlu dipilih secara manual.</p>
                  )}
                </div>
              )}
            </>
          )}

          <label className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-600">Bilangan tempat</span>
            <Input value={f.places} onChange={e => set({ places: e.target.value.replace(/\D/g, "") })} className="h-8 w-16" inputMode="numeric" />
            <span className="text-[11px] text-zinc-400">{byTemplate ? "Kedudukan teratas yang menerima anugerah." : "cth. 1 untuk seorang pemenang, 3 untuk tempat 1–3."}</span>
          </label>

          <div className="flex items-center justify-end gap-3">
            {err && <p className="flex-1 text-xs text-red-600">{err}</p>}
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button className="bg-fuchsia-600 hover:bg-fuchsia-700" disabled={busy || !f.name.trim() || !!teamScoredIndividual} onClick={save}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Simpan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Candidate = { id: string; name: string; sub: string; code: string | null };

function WinnerPicker({ api, award, onClose, onSaved }: { api: string; award: AwardRow; onClose: () => void; onSaved: () => void }) {
  const individual = award.recipientType === "INDIVIDUAL";
  // A pick is a record (team / participant id) or a name typed by hand (custom: id is a local key).
  const [picks, setPicks] = useState<{ rank: number; id: string; name: string; sub: string; custom?: boolean }[]>(
    award.winners.map((w, i) => (w.custom
      ? { rank: w.rank, id: `custom:${i}`, name: w.participantName ?? w.teamName ?? "", sub: w.contingentName ?? "", custom: true }
      : {
          rank: w.rank, id: (individual ? w.participantId : w.teamId) ?? "",
          name: (individual ? w.participantName : w.teamName) ?? "", sub: [individual ? w.teamName : null, w.contingentName].filter(Boolean).join(" · "),
        })).filter(p => p.id),
  );
  const [customName, setCustomName] = useState("");
  const [customNote, setCustomNote] = useState("");
  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    setPicks(p => [...p, { rank, id: `custom:${Date.now()}`, name, sub: customNote.trim(), custom: true }].sort((a, b) => a.rank - b.rank));
    setCustomName(""); setCustomNote("");
  }
  const [rank, setRank] = useState(Math.min(award.places, (award.winners.length ? Math.max(...award.winners.map(w => w.rank)) : 0) + 1) || 1);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ type: award.recipientType, q, ...(award.eventCompetitionId ? { ecId: award.eventCompetitionId } : {}) });
      fetch(`${api}/candidates?${sp}`, { cache: "no-store" }).then(r => r.json()).then(j => { if (alive) setFound(j.candidates ?? []); }).catch(() => alive && setFound([]));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [api, q, award.recipientType, award.eventCompetitionId]);

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${api}/${award.id}/winners`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        winners: picks.map(p => (p.custom
          ? { rank: p.rank, customName: p.name, customNote: p.sub || undefined }
          : { rank: p.rank, [individual ? "participantId" : "teamId"]: p.id })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal menyimpan"); return; }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pilih pemenang · {award.name}</DialogTitle>
          <DialogDescription>
            {individual ? "Peserta" : "Pasukan"} {award.competition ? `pertandingan ${award.competition.code} ${award.competition.name}` : "acara ini"} · {award.places} tempat.
            Tempat yang sama boleh diberi kepada lebih daripada satu pemenang.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-6 pb-6 pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-600">Tambah ke tempat</span>
              <select value={rank} onChange={e => setRank(Number(e.target.value))} className="h-8 rounded-md border bg-white px-2 text-sm">
                {Array.from({ length: award.places }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder={individual ? "Cari nama peserta atau pasukan…" : "Cari nama pasukan atau kontinjen…"} className="h-9 pl-8" />
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {!found && <li className="px-3 py-3 text-center text-xs text-zinc-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Mencari…</li>}
              {found?.length === 0 && <li className="px-3 py-3 text-center text-xs text-zinc-400">Tiada padanan.</li>}
              {found?.map(c => {
                const taken = picks.some(p => p.id === c.id);
                return (
                  <li key={c.id}>
                    <button disabled={taken} onClick={() => setPicks(p => [...p, { rank, id: c.id, name: c.name, sub: c.sub }].sort((a, b) => a.rank - b.rank))}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-fuchsia-50 disabled:opacity-40 disabled:hover:bg-transparent">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-800">{c.name}</span>
                        <span className="block truncate text-[11px] text-zinc-400">{c.code && <span className="font-mono">{c.code} · </span>}{c.sub}</span>
                      </span>
                      {!taken && <Plus className="h-3.5 w-3.5 text-fuchsia-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* A recipient with no record here — e.g. a teacher, a judge or a guest. */}
            <div className="space-y-1.5 rounded-xl border border-dashed p-2.5">
              <span className="text-[11px] font-semibold text-zinc-600">Atau taip nama penerima sendiri</span>
              <Input value={customName} onChange={e => setCustomName(e.target.value)} maxLength={120} placeholder={individual ? "Nama penerima, cth. Pn. Aminah binti Ali" : "Nama pasukan / penerima"}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} className="h-8 text-sm" />
              <div className="flex gap-2">
                <Input value={customNote} onChange={e => setCustomNote(e.target.value)} maxLength={160} placeholder="Keterangan (pilihan) — sekolah, organisasi…"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} className="h-8 flex-1 text-sm" />
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!customName.trim()} onClick={addCustom}><Plus className="h-3.5 w-3.5" /> Tambah</Button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-semibold text-zinc-600">Pemenang ({picks.length})</span>
            <ul className="divide-y rounded-xl border">
              {picks.length === 0 && <li className="px-3 py-6 text-center text-xs text-zinc-400">Belum ada pemenang.</li>}
              {picks.map(p => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <select value={p.rank} onChange={e => setPicks(ps => ps.map(x => (x.id === p.id ? { ...x, rank: Number(e.target.value) } : x)).sort((a, b) => a.rank - b.rank))}
                    className={cn("h-7 rounded-full border-0 px-2 text-xs font-bold", PLACE[p.rank] ?? "bg-zinc-100")}>
                    {Array.from({ length: award.places }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-800">
                      {p.name}
                      {p.custom && <span className="ml-1.5 rounded bg-zinc-100 px-1 text-[10px] font-normal text-zinc-500">ditaip</span>}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-400">{p.sub}</span>
                  </span>
                  <button onClick={() => setPicks(ps => ps.filter(x => x.id !== p.id))} className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-3 pt-2">
              {err && <p className="flex-1 text-xs text-red-600">{err}</p>}
              <Button variant="outline" onClick={onClose}>Batal</Button>
              <Button className="bg-fuchsia-600 hover:bg-fuchsia-700" disabled={busy} onClick={save}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Simpan pemenang
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
