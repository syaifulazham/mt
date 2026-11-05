"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, Copy, ExternalLink, Gavel, Loader2, Lock, MonitorPlay, Plus, Swords, Trash2, Trophy, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export type ScoreboardCard = {
  id: string; code: string; name: string; participationType: string;
  method: string; judgingStatus: string; tasks: number; teamCount: number;
  phase: { label: string; round: number; done: number; total: number; finished: boolean } | null;
};

type Display = {
  id: string; routeSlug: string; label: string | null; kind: string;
  passcode: string | null; competitionIds: string[]; status: string;
};

const noSubscribe = () => () => {};
const useOrigin = () => useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");

export function ScoreboardClient({ event, cards, canManageDisplays }: {
  event: { id: string; name: string; slug: string };
  cards: ScoreboardCard[];
  canManageDisplays: boolean;
}) {
  const duels = cards.filter(c => c.method === "DUEL");
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900"><Trophy className="h-5 w-5 text-amber-500" /> Scoreboard</h1>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
        <Link href={`/organizer/events/${event.slug}/manage/judging`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50">
          <Gavel className="h-3.5 w-3.5" /> Penghakiman
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-zinc-400">Tiada pertandingan dalam acara ini.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(c => <CompetitionTile key={c.id} card={c} slug={event.slug} />)}
        </div>
      )}

      <DisplayEndpoints eventId={event.id} duels={duels} canManage={canManageDisplays} />
    </div>
  );
}

function CompetitionTile({ card: c, slug }: { card: ScoreboardCard; slug: string }) {
  const isDuel = c.method === "DUEL";
  const pct = c.phase && c.phase.total ? Math.round((c.phase.done / c.phase.total) * 100) : 0;
  return (
    <Link href={`/organizer/events/${slug}/manage/scoreboard/${c.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        isDuel ? "border-rose-100" : "border-zinc-200",
      )}>
      <div className={cn("absolute inset-x-0 top-0 h-1", isDuel ? "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-600" : "bg-gradient-to-r from-violet-500 to-cyan-400")} />
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-zinc-400">{c.code}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
          isDuel ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-violet-600")}>
          {isDuel ? <Swords className="h-3 w-3" /> : <Gavel className="h-3 w-3" />} {isDuel ? "DUEL" : "SKOR"}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 font-semibold text-zinc-800 group-hover:text-violet-700">{c.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
        <Users className="h-3 w-3" /> {c.teamCount} pasukan · {c.participationType === "TEAM" ? "Berpasukan" : "Individu"}
      </p>
      <div className="mt-auto pt-4">
        {isDuel && c.phase ? (
          <>
            <p className={cn("text-xs font-medium", c.phase.finished ? "text-emerald-600" : "text-zinc-600")}>{c.phase.label}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className={cn("h-full rounded-full", c.phase.finished ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${c.phase.finished ? 100 : pct}%` }} />
            </div>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            {c.judgingStatus !== "OPEN" && <Lock className="h-3 w-3" />}
            {c.tasks} tugas · {c.judgingStatus === "VERIFIED" ? "Disahkan" : c.judgingStatus === "COMPLETED" ? "Selesai" : "Dibuka"}
          </p>
        )}
      </div>
    </Link>
  );
}

function DisplayEndpoints({ eventId, duels, canManage }: { eventId: string; duels: ScoreboardCard[]; canManage: boolean }) {
  const base = `/api/v2/organizer/events/${eventId}/duel-displays`;
  const origin = useOrigin();
  const [items, setItems] = useState<Display[] | null>(null);
  const [form, setForm] = useState({ label: "", kind: "SCHEDULE", passcode: "", ids: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [del, setDel] = useState<Display | null>(null);

  useEffect(() => {
    fetch(base, { cache: "no-store" }).then(r => r.json()).then(j => setItems(j.endpoints ?? [])).catch(() => setItems([]));
  }, [base]);

  async function create() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label, kind: form.kind, passcode: form.passcode, competitionIds: form.ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? "Gagal");
      setItems(p => [...(p ?? []), j.endpoint]);
      setForm({ label: "", kind: form.kind, passcode: "", ids: [] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setSaving(false); }
  }

  async function patch(d: Display, data: Partial<Display>) {
    const res = await fetch(`${base}/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { const { endpoint } = await res.json(); setItems(p => p?.map(x => x.id === d.id ? endpoint : x) ?? p); }
  }

  async function remove() {
    if (!del) return;
    const res = await fetch(`${base}/${del.id}`, { method: "DELETE" });
    if (res.ok) setItems(p => p?.filter(x => x.id !== del.id) ?? p);
    setDel(null);
  }

  const url = (d: Display) => `${origin}/duel/${d.routeSlug}`;
  const copy = async (d: Display) => {
    await navigator.clipboard.writeText(url(d) + (d.passcode ? `\nPasscode: ${d.passcode}` : ""));
    setCopied(d.id); setTimeout(() => setCopied(null), 1500);
  };
  const compNames = (ids: string[]) => ids.length === 0 ? "Semua pertandingan duel"
    : ids.map(id => duels.find(d => d.id === id)?.code ?? "?").join(", ");

  return (
    <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-zinc-800"><MonitorPlay className="h-4 w-4 text-rose-500" /> Paparan awam duel</h2>
        <p className="text-xs text-zinc-500">Pautan untuk skrin besar: <b>Jadual</b> menunjukkan semua sesi dan kedudukan; <b>Duel semasa</b> menunjukkan sesi yang sedang berjalan dengan pemasa.</p>
      </div>

      {items === null ? (
        <p className="text-xs text-zinc-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Memuatkan…</p>
      ) : items.length === 0 ? (
        <p className="text-xs italic text-zinc-400">Belum ada pautan paparan.</p>
      ) : (
        <div className="divide-y rounded-xl border">
          {items.map(d => (
            <div key={d.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", d.status === "CLOSED" && "opacity-60")}>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", d.kind === "LIVE" ? "bg-rose-100 text-rose-700" : "bg-cyan-100 text-cyan-700")}>
                {d.kind === "LIVE" ? "DUEL SEMASA" : "JADUAL"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800">{d.label || (d.kind === "LIVE" ? "Duel semasa" : "Jadual duel")}</p>
                <p className="truncate font-mono text-[11px] text-zinc-400">{url(d)} · {compNames(d.competitionIds)}{d.passcode ? ` · passcode ${d.passcode}` : ""}</p>
              </div>
              <button onClick={() => copy(d)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Salin pautan">
                {copied === d.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
              <a href={url(d)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Buka">
                <ExternalLink className="h-4 w-4" />
              </a>
              {canManage && (
                <>
                  <button onClick={() => patch(d, { status: d.status === "ACTIVE" ? "CLOSED" : "ACTIVE" })}
                    className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", d.status === "ACTIVE" ? "border-emerald-200 text-emerald-700" : "border-zinc-200 text-zinc-500")}>
                    {d.status === "ACTIVE" ? "Aktif" : "Ditutup"}
                  </button>
                  <button onClick={() => setDel(d)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Padam">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="space-y-3 rounded-xl bg-zinc-50 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_10rem]">
            <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (cth. Skrin Dewan A)" className="bg-white" />
            <div className="inline-flex rounded-lg border bg-white p-0.5">
              {[["SCHEDULE", "Jadual"], ["LIVE", "Duel semasa"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, kind: k }))}
                  className={cn("rounded-md px-3 py-1 text-xs font-medium", form.kind === k ? "bg-rose-600 text-white" : "text-zinc-500 hover:bg-zinc-100")}>{l}</button>
              ))}
            </div>
            <Input value={form.passcode} onChange={e => setForm(f => ({ ...f, passcode: e.target.value }))} placeholder="Passcode (pilihan)" className="bg-white font-mono uppercase" />
          </div>
          {duels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Pertandingan:</span>
              <button type="button" onClick={() => setForm(f => ({ ...f, ids: [] }))}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs", form.ids.length === 0 ? "border-rose-300 bg-rose-50 text-rose-700" : "bg-white text-zinc-500")}>Semua duel</button>
              {duels.map(d => {
                const on = form.ids.includes(d.id);
                return (
                  <button key={d.id} type="button" title={d.name}
                    onClick={() => setForm(f => ({ ...f, ids: on ? f.ids.filter(x => x !== d.id) : [...f.ids, d.id] }))}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-rose-300 bg-rose-50 text-rose-700" : "bg-white text-zinc-500")}>
                    {d.code} {d.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-amber-700">Belum ada pertandingan berkaedah Duel — tetapkan di halaman Penghakiman.</p>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={create} disabled={saving} className="gap-1.5 bg-rose-600 hover:bg-rose-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Cipta pautan paparan
            </Button>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </div>
      )}

      <ConfirmDialog open={!!del} onOpenChange={o => { if (!o) setDel(null); }} destructive
        title="Padam pautan paparan?" description="Skrin yang membuka pautan ini akan berhenti dikemas kini."
        confirmLabel="Padam" onConfirm={remove} />
    </section>
  );
}
