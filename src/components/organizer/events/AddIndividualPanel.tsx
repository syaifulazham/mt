"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, UserPlus, X } from "lucide-react";

// Pra-Pendaftaran → Tambah Pasukan / Wildcard, "Individu": pick a participant,
// then one of the event's individual competitions they are eligible for; they
// are entered as a team of one (PENDING), like any added team.

type Comp = { id: string; code: string; name: string };
type Found = {
  id: string; name: string; idNo: string | null; eduLevel: string; classGrade: string | null;
  contingentName: string | null; stateName: string | null;
  competitions: (Comp & { entered: boolean })[];
};

const EDU: Record<string, string> = { KINDERGARTEN: "Prasekolah", PRIMARY: "Rendah", SECONDARY: "Menengah", YOUTH: "Belia" };

export function AddIndividualPanel({ eventId, wildcard, onClose, onAdded }: {
  eventId: string; wildcard: boolean; onClose: () => void; onAdded: () => void;
}) {
  const api = `/api/v2/organizer/events/${eventId}/preregistration`;
  const [offered, setOffered] = useState<Comp[] | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [compId, setCompId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${api}/search-participants${wildcard ? "?wildcard=1" : ""}`).then((r) => r.json())
      .then((j) => setOffered(j.competitions ?? [])).catch(() => setOffered([]));
  }, [api, wildcard]);

  async function search() {
    if (q.trim().length < 2) return;
    setSearching(true); setError(null); setPicked(null); setCompId("");
    const sp = new URLSearchParams({ q: q.trim() });
    if (wildcard) sp.set("wildcard", "1");
    const res = await fetch(`${api}/search-participants?${sp}`);
    const j = await res.json().catch(() => null);
    setSearching(false);
    if (!res.ok) { setError(j?.error ?? "Gagal mencari peserta."); return; }
    setResults(j.data ?? []);
  }

  function pick(p: Found) {
    setPicked(p);
    const open = p.competitions.filter((c) => !c.entered);
    setCompId(open.length === 1 ? open[0].id : "");
    setError(null);
  }

  async function add() {
    if (!picked || !compId) return;
    setSaving(true); setError(null);
    const res = await fetch(`${api}/add-individual`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: picked.id, competitionId: compId, ...(wildcard ? { wildcard: true } : {}) }),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { setError(j?.error ?? "Gagal mendaftar."); return; }
    setDone((d) => [j.message, ...d]);
    // Mark it entered here so the same pick isn't offered again.
    const mark = (p: Found) => p.id === picked.id ? { ...p, competitions: p.competitions.map((c) => c.id === compId ? { ...c, entered: true } : c) } : p;
    setResults((r) => r?.map(mark) ?? r);
    setPicked((p) => (p ? mark(p) : p));
    setCompId("");
    onAdded();
  }

  if (offered && offered.length === 0)
    return <p className="py-6 text-center text-sm text-zinc-400">Acara ini tiada pertandingan individu.</p>;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-zinc-600 block mb-1">Nama peserta, No. KP / pasport atau kontinjen</label>
        <div className="flex gap-2">
          <input type="text" value={q} autoFocus placeholder="Taipkan sekurang-kurangnya 2 aksara…"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          <button onClick={search} disabled={q.trim().length < 2 || searching}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 flex items-center gap-1.5">
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Cari
          </button>
        </div>
        {offered && (
          <p className="mt-1 text-[11px] text-zinc-400">
            Pertandingan individu: {offered.map((c) => c.code).join(", ")}
            {wildcard ? " · tanpa had negeri/zon" : ""}
          </p>
        )}
      </div>

      {results && (
        <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
          {results.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">Tiada peserta layak ditemui untuk &ldquo;{q}&rdquo;.</p>}
          {results.map((p) => {
            const open = p.competitions.filter((c) => !c.entered).length;
            return (
              <button key={p.id} type="button" onClick={() => pick(p)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${picked?.id === p.id ? "bg-emerald-50" : "hover:bg-zinc-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {p.contingentName ?? "—"} · {p.stateName ?? "—"} · {EDU[p.eduLevel] ?? p.eduLevel}{p.classGrade ? ` ${p.classGrade}` : ""}{p.idNo ? ` · ${p.idNo}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] ${open ? "text-emerald-700" : "text-zinc-400"}`}>
                  {open ? `${open} pertandingan` : "sudah didaftar"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {picked && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 truncate">{picked.name}</p>
            <button onClick={() => { setPicked(null); setCompId(""); }} className="rounded p-1 hover:bg-white"><X className="h-3.5 w-3.5 text-zinc-500" /></button>
          </div>
          <label className="text-xs font-medium text-zinc-600 block">Pertandingan</label>
          <select value={compId} onChange={(e) => setCompId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200">
            <option value="">— Pilih pertandingan —</option>
            {picked.competitions.map((c) => (
              <option key={c.id} value={c.id} disabled={c.entered}>{c.code} — {c.name}{c.entered ? " (sudah didaftar)" : ""}</option>
            ))}
          </select>
          <button onClick={add} disabled={!compId || saving}
            className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Daftar {wildcard ? "sebagai wildcard" : "peserta"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {done.length > 0 && (
        <ul className="space-y-1">
          {done.map((m, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> {m}</li>
          ))}
        </ul>
      )}

      <button onClick={onClose} className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50">
        {done.length ? "Selesai" : "Batal"}
      </button>
    </div>
  );
}
