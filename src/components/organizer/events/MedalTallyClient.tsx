"use client";

/* eslint-disable @next/next/no-img-element */
import { Fragment, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Eye, EyeOff, Globe, Loader2, Lock, Medal,
  MonitorPlay, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MedalTally, Place } from "@/lib/medalTally";

type Endpoint = {
  id: string; routeSlug: string; passcode: string | null; label: string | null;
  status: string; createdAt: string;
};

const PLACE_STYLE: Record<Place, { label: string; dot: string; text: string }> = {
  1: { label: "Emas", dot: "bg-amber-400", text: "text-amber-600" },
  2: { label: "Perak", dot: "bg-zinc-300", text: "text-zinc-500" },
  3: { label: "Gangsa", dot: "bg-orange-400", text: "text-orange-700" },
};

function MedalHead({ place }: { place: Place }) {
  const s = PLACE_STYLE[place];
  return (
    <th className="px-3 py-2.5 text-center w-20">
      <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />{s.label}</span>
    </th>
  );
}

function EndpointRow({ ep, eventId, canWrite, onChange, onDelete }: {
  ep: Endpoint; eventId: string; canWrite: boolean;
  onChange: (ep: Endpoint) => void; onDelete: (id: string) => void;
}) {
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const path = `/medals/${ep.routeSlug}`;
  const api = `/api/v2/organizer/events/${eventId}/medal-tally-endpoints/${ep.id}`;

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(api, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ep.status === "ACTIVE" ? "CLOSED" : "ACTIVE" }),
      });
      if (res.ok) onChange({ ...ep, status: (await res.json()).data.status });
    } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(api, { method: "DELETE" });
      if (res.ok) { setConfirm(false); onDelete(ep.id); }
    } finally { setBusy(false); }
  }

  return (
    <tr className={cn("border-b last:border-0", ep.status === "CLOSED" && "opacity-50")}>
      <td className="px-4 py-3 text-sm font-medium text-zinc-800">{ep.label ?? <span className="text-xs italic text-zinc-300">—</span>}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="max-w-[200px] truncate font-mono text-xs text-zinc-500">{path}</span>
          <button onClick={copy} title="Salin pautan" className="shrink-0 rounded p-0.5 hover:bg-zinc-200">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
          <Link href={path} target="_blank" title="Buka" className="shrink-0 rounded p-0.5 hover:bg-zinc-200">
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </div>
      </td>
      <td className="px-4 py-3">
        {ep.passcode ? (
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-zinc-400" />
            <span className="font-mono text-sm font-bold tracking-widest text-amber-700">{showPass ? ep.passcode : "••••••"}</span>
            <button onClick={() => setShowPass((v) => !v)} className="rounded p-0.5 hover:bg-zinc-100">
              {showPass ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-1 text-xs text-green-600"><Globe className="h-3 w-3" /> Awam</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", ep.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400")}>
          {ep.status === "ACTIVE" ? "AKTIF" : "DITUTUP"}
        </span>
      </td>
      <td className="px-4 py-3">
        {canWrite && (
          <div className="flex items-center justify-end gap-3">
            <button onClick={toggle} disabled={busy} className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700">
              {ep.status === "ACTIVE" ? "Tutup" : "Buka semula"}
            </button>
            <button onClick={() => setConfirm(true)} disabled={busy} title="Padam" className="text-zinc-300 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} loading={busy} onConfirm={remove}
          title="Padam pautan ini?" confirmLabel="Padam"
          description="Skrin yang sedang memaparkan pautan ini akan berhenti dikemas kini." />
      </td>
    </tr>
  );
}

export function MedalTallyClient({ event, tally, includeUnverified, endpoints: initialEndpoints, canWrite }: {
  event: { id: string; name: string; slug: string };
  tally: MedalTally;
  includeUnverified: boolean;
  endpoints: Endpoint[];
  canWrite: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showZero, setShowZero] = useState(true);
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [requirePasscode, setRequirePasscode] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  const base = `/organizer/events/${event.slug}/manage/results/medals`;
  const { states, competitions } = tally;
  const totals = states.reduce((t, s) => ({ g: t.g + s.gold, s: t.s + s.silver, b: t.b + s.bronze }), { g: 0, s: 0, b: 0 });
  const unverified = competitions.total - competitions.verified;
  const noMedals = totals.g + totals.s + totals.b === 0;
  const shown = showZero ? states : states.filter((s) => s.total > 0);

  function toggleRow(key: string) {
    setOpen((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  async function create() {
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/medal-tally-endpoints`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined, requirePasscode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Gagal mencipta pautan");
      setEndpoints((p) => [j.data, ...p]);
      setShowCreate(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Gagal mencipta pautan");
    } finally { setCreating(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage/results`}
          className="mt-0.5 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Keputusan
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold text-zinc-900">Medal Tally</h1>
          </div>
          <p className="mt-0.5 text-sm text-zinc-400">{event.name}</p>
        </div>
      </div>

      {/* Tally */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-zinc-50 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Kutipan pingat mengikut negeri</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Tempat 1, 2 dan 3 setiap pertandingan · {competitions.verified}/{competitions.total} pertandingan disahkan
              {includeUnverified && competitions.counted > competitions.verified && ` · ${competitions.counted - competitions.verified} belum disahkan turut dikira`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="h-3.5 w-3.5" />
            Papar negeri tanpa pingat
          </label>
          {unverified > 0 && (
            <div className="flex rounded-lg bg-zinc-200/60 p-0.5 text-xs font-medium">
              <Link href={base} replace scroll={false}
                className={cn("rounded-md px-3 py-1", !includeUnverified ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}>
                Disahkan sahaja
              </Link>
              <Link href={`${base}?semua=1`} replace scroll={false}
                className={cn("rounded-md px-3 py-1", includeUnverified ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800")}>
                Pratonton semua
              </Link>
            </div>
          )}
          </div>
        </div>

        {includeUnverified && (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
            Pratonton: keputusan yang belum disahkan turut dikira. Paparan awam hanya mengira pertandingan yang telah disahkan.
          </p>
        )}

        {noMedals && (
          <p className={cn("px-5 text-center text-sm text-zinc-400", shown.length ? "border-b py-3" : "py-12")}>
            {competitions.verified === 0 && !includeUnverified
              ? "Belum ada pertandingan yang disahkan. Pingat dikira selepas penghakiman disahkan."
              : "Belum ada markah untuk dikira."}
          </p>
        )}
        {shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase text-zinc-500">
                  <th className="w-16 px-4 py-2.5 text-center">#</th>
                  <th className="px-3 py-2.5 text-left">Negeri</th>
                  <MedalHead place={1} /><MedalHead place={2} /><MedalHead place={3} />
                  <th className="w-20 px-3 py-2.5 text-center">Jumlah</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const key = s.stateId ?? "none";
                  const isOpen = open.has(key);
                  return (
                    <Fragment key={key}>
                      <tr onClick={() => s.winners.length && toggleRow(key)}
                        className={cn("border-b last:border-0", s.winners.length ? "cursor-pointer hover:bg-zinc-50" : "text-zinc-400")}>
                        <td className="px-4 py-2.5 text-center font-bold tabular-nums text-zinc-500">{s.total ? s.position : "–"}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2.5">
                            {s.stateFlag
                              ? <img src={s.stateFlag} alt="" className="h-5 w-8 rounded-sm border object-cover" />
                              : <span className="h-5 w-8 rounded-sm border bg-zinc-100" />}
                            <span className={cn("font-medium", s.winners.length && "text-zinc-800")}>{s.stateName}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums text-amber-600">{s.gold}</td>
                        <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums text-zinc-500">{s.silver}</td>
                        <td className="px-3 py-2.5 text-center text-base font-bold tabular-nums text-orange-700">{s.bronze}</td>
                        <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{s.total}</td>
                        <td className="pr-4 text-zinc-300">
                          {s.winners.length > 0 && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b bg-zinc-50/70">
                          <td />
                          <td colSpan={6} className="px-3 pb-3 pt-1">
                            <ul className="divide-y rounded-lg border bg-white text-xs">
                              {s.winners.map((w, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                                  <span className={cn("flex w-16 items-center gap-1.5 font-semibold", PLACE_STYLE[w.place].text)}>
                                    <span className={cn("h-2 w-2 rounded-full", PLACE_STYLE[w.place].dot)} />{PLACE_STYLE[w.place].label}
                                  </span>
                                  <span className="min-w-0 flex-1 text-zinc-700">
                                    <span className="font-mono text-zinc-400">{w.competitionCode}</span> {w.competitionName}
                                    {w.walkIn && <span className="ml-1.5 rounded bg-indigo-50 px-1 text-[10px] text-indigo-600">Walk-in</span>}
                                    {!w.verified && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] text-amber-700">Belum disahkan</span>}
                                  </span>
                                  <span className="text-zinc-500">{w.teamName} · {w.contingentName}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-zinc-50 text-xs font-semibold text-zinc-500">
                  <td /><td className="px-3 py-2.5">Jumlah pingat</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{totals.g}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{totals.s}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{totals.b}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{totals.g + totals.s + totals.b}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Public screens */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b bg-zinc-50 px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <MonitorPlay className="h-4 w-4 text-zinc-400" /> Paparan Awam (skrin besar)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">Pautan awam yang memaparkan medal tally mengikut negeri dan dikemas kini sendiri. Hanya pertandingan yang disahkan dikira.</p>
          </div>
          {canWrite && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 border-amber-200 text-xs text-amber-700 hover:bg-amber-50"
              onClick={() => { setLabel(""); setRequirePasscode(true); setCreateErr(""); setShowCreate(true); }}>
              <Plus className="h-3 w-3" /> Jana Pautan
            </Button>
          )}
        </div>
        {endpoints.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">
            Tiada pautan awam lagi.{canWrite && " Klik \"Jana Pautan\" untuk mencipta satu."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50/40 text-xs font-semibold uppercase text-zinc-500">
                  <th className="w-40 px-4 py-2.5 text-left">Label</th>
                  <th className="px-4 py-2.5 text-left">URL</th>
                  <th className="w-36 px-4 py-2.5 text-left">Akses</th>
                  <th className="w-24 px-4 py-2.5 text-left">Status</th>
                  <th className="w-32 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <EndpointRow key={ep.id} ep={ep} eventId={event.id} canWrite={canWrite}
                    onChange={(n) => setEndpoints((p) => p.map((e) => (e.id === n.id ? n : e)))}
                    onDelete={(id) => setEndpoints((p) => p.filter((e) => e.id !== id))} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={(o) => { if (!creating) setShowCreate(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Jana pautan medal tally</DialogTitle>
            <DialogDescription className="text-xs">URL unik dijana secara automatik. Buka pautan pada skrin besar; ia dikemas kini setiap 30 saat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-1 py-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-600">Label (pilihan)</span>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="cth. Skrin dewan utama" />
            </label>
            <label className="flex items-start gap-2.5 text-sm text-zinc-700">
              <input type="checkbox" checked={requirePasscode} onChange={(e) => setRequirePasscode(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Perlukan passcode
                <span className="block text-xs text-zinc-400">Passcode 6 aksara (huruf dan nombor) dijana secara rawak dan diminta sekali pada setiap skrin.</span>
              </span>
            </label>
            {createErr && <p className="text-xs text-red-600">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Batal</Button>
            <Button onClick={create} disabled={creating} className="gap-1.5">
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Jana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
