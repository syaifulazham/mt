"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Megaphone, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff, ExternalLink,
  CheckCircle2, Hourglass, Gavel, Undo2, GripVertical, ChevronUp, ChevronDown, ListOrdered, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AnnouncementBoard, AnnounceItem, WaitingItem } from "@/lib/announcements";
import { announceKey } from "@/lib/announceKey";

type Endpoint = {
  id: string; routeSlug: string; passcode: string; label: string | null;
  status: "ACTIVE" | "CLOSED"; createdAt: string;
};
type EventInfo = { id: string; name: string; slug: string };

/** How often the lists refresh (verifications, MC ticks, other Super Admins' changes). */
const POLL_MS = 3_000;

function fmtWhen(d: string | null) {
  return d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "";
}

// ── Announcer board row ────────────────────────────────────────────────────────

function EndpointRow({ ep, eventId, isSuperAdmin, onChange, onDelete }: {
  ep: Endpoint; eventId: string; isSuperAdmin: boolean;
  onChange: (ep: Endpoint) => void; onDelete: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied]     = useState<"url" | "pass" | null>(null);
  const [busy, setBusy]         = useState<"toggle" | "delete" | null>(null);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/announce/${ep.routeSlug}`;

  async function copy(what: "url" | "pass") {
    await navigator.clipboard.writeText(what === "url" ? url : ep.passcode);
    setCopied(what); setTimeout(() => setCopied(null), 2000);
  }
  async function toggle() {
    setBusy("toggle");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/announce-endpoints/${ep.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ep.status === "ACTIVE" ? "CLOSED" : "ACTIVE" }),
      });
      if (res.ok) onChange((await res.json()).data);
    } finally { setBusy(null); }
  }
  async function remove() {
    setBusy("delete");
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/announce-endpoints/${ep.id}`, { method: "DELETE" });
      if (res.ok) onDelete(ep.id);
    } finally { setBusy(null); }
  }

  return (
    <tr className={cn("border-b last:border-0 hover:bg-zinc-50/60", ep.status === "CLOSED" && "opacity-50")}>
      <td className="px-4 py-3 text-sm">
        {ep.label ? <span className="font-medium text-zinc-800">{ep.label}</span> : <span className="text-zinc-300 italic text-xs">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-mono text-zinc-500 truncate max-w-[200px]">/announce/{ep.routeSlug}</span>
          <button onClick={() => copy("url")} title="Salin URL" className="p-0.5 rounded hover:bg-zinc-200 shrink-0">
            {copied === "url" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
          <Link href={`/announce/${ep.routeSlug}`} target="_blank" className="p-0.5 rounded hover:bg-zinc-200 shrink-0" title="Buka">
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {revealed ? (
            <button onClick={() => copy("pass")} title="Salin passcode"
              className="font-mono font-bold tracking-widest text-sm text-sky-700 hover:text-sky-500">
              {copied === "pass" ? <span className="text-green-600">Disalin!</span> : ep.passcode}
            </button>
          ) : (
            <span className="font-mono font-bold tracking-widest text-sm text-zinc-400">••••••</span>
          )}
          <button onClick={() => setRevealed(v => !v)} className="p-0.5 rounded hover:bg-zinc-100 shrink-0">
            {revealed ? <EyeOff className="h-3.5 w-3.5 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
          ep.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400")}>
          {ep.status}
        </span>
      </td>
      {isSuperAdmin && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 justify-end">
            <button onClick={toggle} disabled={busy !== null}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 font-medium whitespace-nowrap flex items-center gap-1">
              {busy === "toggle" && <Loader2 className="h-3 w-3 animate-spin" />}
              {ep.status === "ACTIVE" ? "Tutup" : "Buka"}
            </button>
            <button onClick={remove} disabled={busy !== null} className="p-1 rounded hover:bg-red-50" title="Padam">
              {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" /> : <Trash2 className="h-3.5 w-3.5 text-red-400" />}
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ── Section building blocks ────────────────────────────────────────────────────

type Ref = { kind: string; refId: string; stateId: string | null };
const keyOf = (r: Ref) => announceKey(r.kind, r.refId, r.stateId);

function TypeBadge({ kind }: { kind: string }) {
  return kind === "walkin"
    ? <span className="text-[10px] font-bold px-1.5 py-px rounded bg-indigo-50 text-indigo-600">Walk-in</span>
    : <span className="text-[10px] font-bold px-1.5 py-px rounded bg-rose-50 text-rose-600">Utama</span>;
}

// Target-group levels, in school order (same labels/colours as the judging page)
const LEVEL_ORDER = ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"];
const LEVEL: Record<string, { label: string; cls: string }> = {
  KINDERGARTEN: { label: "Tadika",        cls: "bg-pink-50 text-pink-700 border-pink-200" },
  PRIMARY:      { label: "Sek. Rendah",   cls: "bg-sky-50 text-sky-700 border-sky-200" },
  SECONDARY:    { label: "Sek. Menengah", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  YOUTH:        { label: "Belia",         cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function LevelBadges({ levels }: { levels?: string[] }) {
  const known = LEVEL_ORDER.filter(l => levels?.includes(l));
  if (known.length === 0) return <span className="text-xs text-zinc-300">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {known.map(l => (
        <span key={l} className={cn("text-[10px] font-semibold px-1.5 py-px rounded border whitespace-nowrap", LEVEL[l].cls)}>{LEVEL[l].label}</span>
      ))}
    </span>
  );
}

function ScopeLabel({ stateName }: { stateName: string | null }) {
  return stateName
    ? <span className="text-xs text-sky-700">{stateName}</span>
    : <span className="text-xs font-semibold text-zinc-700">Kebangsaan</span>;
}

function Competition({ code, name }: { code: string; name: string }) {
  return (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="font-mono text-xs text-zinc-400 shrink-0">{code}</span>
      <span className="text-sm text-zinc-800 truncate">{name}</span>
    </span>
  );
}

/** The green light: off = grey lamp, on = glowing green. A button for Super Admins. */
function GreenLight({ on, busy, editable, onToggle }: { on: boolean; busy: boolean; editable: boolean; onToggle: () => void }) {
  const lamp = (
    <span className={cn(
      "relative inline-flex h-5 w-5 rounded-full border-2 transition-all",
      on ? "bg-emerald-400 border-emerald-500 shadow-[0_0_10px_3px_rgba(52,211,153,0.7)]" : "bg-zinc-200 border-zinc-300",
    )}>
      {on && <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 animate-ping" />}
    </span>
  );
  if (!editable) return <span title={on ? "Lampu hijau" : "Belum diberi lampu hijau"}>{lamp}</span>;
  return (
    <button onClick={onToggle} disabled={busy}
      title={on ? "Tarik balik lampu hijau" : "Beri lampu hijau — MC boleh mengumumkan"}
      className="inline-flex items-center gap-2 rounded-full px-1.5 py-1 hover:bg-zinc-100 disabled:opacity-60">
      {busy ? <Loader2 className="h-5 w-5 animate-spin text-zinc-400" /> : lamp}
      <span className={cn("text-[11px] font-semibold", on ? "text-emerald-700" : "text-zinc-400")}>{on ? "Hijau" : "Off"}</span>
    </button>
  );
}

function SectionCard({ title, icon, count, hint, children }: {
  title: string; icon: React.ReactNode; count?: number; hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-zinc-50 flex items-center gap-2 flex-wrap">
        {icon}
        <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
        {count !== undefined && <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-zinc-200 text-zinc-600">{count}</span>}
        {hint && <span className="text-[11px] text-zinc-400 ml-1">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[11px] font-medium text-zinc-500";

// ── Announcement list (the MC boards' master guideline) ─────────────────────────

function AnnouncementList({ items, isSuperAdmin, busyKey, onGreenLight, onReorder }: {
  items: AnnounceItem[]; isSuperAdmin: boolean; busyKey: string | null;
  onGreenLight: (item: AnnounceItem) => void;
  /** Persist a new order (keys in order). */
  onReorder: (keys: string[]) => void;
}) {
  // While dragging, rows follow a local draft order; it's saved on drop.
  const [draft, setDraft]   = useState<string[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const byKey = new Map(items.map(i => [keyOf(i), i]));
  const order = (draft ?? items.map(keyOf)).filter(k => byKey.has(k));
  const rows = order.map(k => byKey.get(k)!);
  // The MC's "announce now": first green-lit result in list order
  const currentKey = rows.find(r => r.greenLight) ? keyOf(rows.find(r => r.greenLight)!) : null;

  function move(keys: string[], from: number, to: number) {
    const next = [...keys];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    return next;
  }
  function commit(next: string[]) {
    if (next.join("|") !== items.map(keyOf).join("|")) onReorder(next);
  }

  if (rows.length === 0)
    return <p className="px-5 py-8 text-center text-sm text-zinc-400">Tiada keputusan yang disahkan dan belum diumumkan.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50/40">
            {isSuperAdmin && <th className="w-16" />}
            <th className={cn(TH, "w-8")}>#</th>
            <th className={TH}>Pertandingan</th>
            <th className={cn(TH, "w-28")}>Tahap</th>
            <th className={cn(TH, "w-20")}>Jenis</th>
            <th className={cn(TH, "w-32")}>Skop</th>
            <th className={cn(TH, "w-44")}>Status</th>
            <th className={cn(TH, "w-28")}>Lampu Hijau</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, idx) => {
            const k = keyOf(item);
            const current = k === currentKey;
            return (
              <tr key={k}
                draggable={isSuperAdmin}
                onDragStart={e => { setDragKey(k); setDraft(order); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={e => {
                  if (!dragKey || dragKey === k) return;
                  e.preventDefault();
                  setDraft(d => { const cur = d ?? order; return move(cur, cur.indexOf(dragKey), cur.indexOf(k)); });
                }}
                onDrop={e => { e.preventDefault(); }}
                onDragEnd={() => { if (draft) commit(draft); setDraft(null); setDragKey(null); }}
                className={cn(
                  "border-b last:border-0 transition-colors",
                  current ? "bg-emerald-50" : item.greenLight ? "bg-emerald-50/40" : "hover:bg-zinc-50/60",
                  dragKey === k && "opacity-50",
                )}>
                {isSuperAdmin && (
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-0.5 text-zinc-300">
                      <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" aria-label="Seret untuk susun" />
                      <div className="flex flex-col">
                        <button disabled={idx === 0} onClick={() => commit(move(order, idx, idx - 1))}
                          className="hover:text-zinc-600 disabled:opacity-30" title="Naik"><ChevronUp className="h-3 w-3" /></button>
                        <button disabled={idx === rows.length - 1} onClick={() => commit(move(order, idx, idx + 1))}
                          className="hover:text-zinc-600 disabled:opacity-30" title="Turun"><ChevronDown className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </td>
                )}
                <td className="px-3 py-2 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                <td className="px-3 py-2 max-w-0"><Competition code={item.code} name={item.name} /></td>
                <td className="px-3 py-2"><LevelBadges levels={item.levels} /></td>
                <td className="px-3 py-2"><TypeBadge kind={item.kind} /></td>
                <td className="px-3 py-2"><ScopeLabel stateName={item.stateName} /></td>
                <td className="px-3 py-2">
                  {item.greenLight ? (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-emerald-700">Sedia diumumkan</span>
                      {current && <span className="text-[9px] font-bold px-1.5 py-px rounded bg-emerald-600 text-white">SEKARANG</span>}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-500" title={`Disahkan ${fmtWhen(item.verifiedAt)}${item.verifiedBy ? ` oleh ${item.verifiedBy}` : ""}`}>
                      Disahkan · menunggu lampu hijau
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <GreenLight on={item.greenLight} busy={busyKey === k} editable={isSuperAdmin} onToggle={() => onGreenLight(item)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WaitingList({ items }: { items: WaitingItem[] }) {
  if (items.length === 0)
    return <p className="px-5 py-6 text-center text-sm text-zinc-400">Tiada keputusan yang menunggu pengesahan.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50/40">
            <th className={TH}>Pertandingan</th>
            <th className={cn(TH, "w-28")}>Tahap</th>
            <th className={cn(TH, "w-20")}>Jenis</th>
            <th className={cn(TH, "w-32")}>Skop</th>
            <th className={cn(TH, "w-64")}>Diumumkan selesai</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={keyOf(item)} className="border-b last:border-0">
              <td className="px-3 py-2 max-w-0"><Competition code={item.code} name={item.name} /></td>
              <td className="px-3 py-2"><LevelBadges levels={item.levels} /></td>
              <td className="px-3 py-2"><TypeBadge kind={item.kind} /></td>
              <td className="px-3 py-2"><ScopeLabel stateName={item.stateName} /></td>
              <td className="px-3 py-2 text-[11px] text-zinc-500">{item.completedBy} · {fmtWhen(item.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnnouncedList({ items, isSuperAdmin, busyKey, onUndo }: {
  items: AnnounceItem[]; isSuperAdmin: boolean; busyKey: string | null; onUndo: (item: AnnounceItem) => void;
}) {
  if (items.length === 0)
    return <p className="px-5 py-6 text-center text-sm text-zinc-400">Belum ada keputusan yang diumumkan.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50/40">
            <th className={TH}>Pertandingan</th>
            <th className={cn(TH, "w-28")}>Tahap</th>
            <th className={cn(TH, "w-20")}>Jenis</th>
            <th className={cn(TH, "w-32")}>Skop</th>
            <th className={cn(TH, "w-64")}>Diumumkan</th>
            {isSuperAdmin && <th className="w-12" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const k = keyOf(item);
            return (
              <tr key={k} className="border-b last:border-0 text-zinc-500">
                <td className="px-3 py-2 max-w-0">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <Competition code={item.code} name={item.name} />
                  </span>
                </td>
                <td className="px-3 py-2"><LevelBadges levels={item.levels} /></td>
                <td className="px-3 py-2"><TypeBadge kind={item.kind} /></td>
                <td className="px-3 py-2"><ScopeLabel stateName={item.stateName} /></td>
                <td className="px-3 py-2 text-[11px]">{fmtWhen(item.announcedAt)}{item.announcedBy && <> · {item.announcedBy}</>}</td>
                {isSuperAdmin && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onUndo(item)} disabled={busyKey === k} title="Batalkan — kembalikan ke senarai pengumuman"
                      className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700">
                      {busyKey === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Configuration ──────────────────────────────────────────────────────────────

/** Places announced per result on the MC boards (Super Admin; others read only). */
function AnnouncementConfig({ maxPlaces, isSuperAdmin, onSave }: {
  maxPlaces: number; isSuperAdmin: boolean; onSave: (n: number) => Promise<boolean>;
}) {
  // A draft while typing; otherwise the saved setting (so other Super Admins'
  // changes arriving by poll show up)
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [saved, setSaved] = useState(false);
  const value = draft ?? String(maxPlaces);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 20;
  const dirty = valid && n !== maxPlaces;

  async function save() {
    if (!dirty) return;
    setBusy(true); setSaved(false);
    const ok = await onSave(n);
    setBusy(false);
    if (ok) setDraft(null);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  return (
    <div className="px-5 py-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-[16rem]">
        <p className="text-sm font-medium text-zinc-800">Bilangan tempat diumumkan</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">
          Papan Pengumuman MC memaparkan tempat 1 hingga {valid ? n : maxPlaces} bagi setiap keputusan, dibaca dari tempat terakhir hingga Johan.
        </p>
      </div>
      {isSuperAdmin ? (
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={20} value={value}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            className={cn("h-8 w-20 text-center text-sm", !valid && "border-red-300")} />
          <Button size="sm" onClick={save} disabled={!dirty || busy}
            className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved ? "Disimpan" : "Simpan"}
          </Button>
        </div>
      ) : (
        <span className="text-sm font-semibold text-zinc-700">Tempat 1–{maxPlaces}</span>
      )}
      {!valid && <p className="w-full text-[11px] text-red-500">Masukkan nombor 1 hingga 20.</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function AnnouncementsManageClient({ event, endpoints: initialEndpoints, board: initialBoard, isSuperAdmin }: {
  event: EventInfo; endpoints: Endpoint[]; board: AnnouncementBoard; isSuperAdmin: boolean;
}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [board, setBoard]         = useState(initialBoard);
  const [busyKey, setBusyKey]     = useState<string | null>(null);

  const [creating, setCreating]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel]         = useState("");
  const [createErr, setCreateErr] = useState("");

  // Live: verifications, MC ticks and other Super Admins' changes appear
  // without a reload. Skipped while one of our own changes is being saved, so a
  // stale poll can't undo it on screen.
  const saving = useRef(false);
  useEffect(() => {
    let inFlight = false;
    const t = setInterval(async () => {
      if (inFlight || saving.current || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/v2/organizer/events/${event.id}/announcements`, { cache: "no-store" });
        if (res.ok) setBoard(await res.json());
      } catch { /* next tick */ } finally { inFlight = false; }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [event.id]);

  async function create() {
    setCreating(true); setCreateErr("");
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/announce-endpoints`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setEndpoints(p => [...p, j.data]);
      setShowCreate(false); setLabel("");
    } catch (e) { setCreateErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setCreating(false); }
  }

  const [actionErr, setActionErr] = useState("");
  async function patch(body: object, busy: string | null): Promise<boolean> {
    setBusyKey(busy); setActionErr(""); saving.current = true;
    try {
      const res = await fetch(`/api/v2/organizer/events/${event.id}/announcements`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setBoard(j);
      else setActionErr(
        j.error === "NOT_VERIFIED" ? "Keputusan ini tidak lagi disahkan."
        : j.error === "INVALID_MAX_PLACES" ? "Bilangan tempat mesti 1 hingga 20."
        : (j.error ?? "Gagal menyimpan."),
      );
      return res.ok;
    } finally { setBusyKey(null); saving.current = false; }
  }
  const refOf = (i: AnnounceItem) => ({ kind: i.kind, refId: i.refId, stateId: i.stateId });
  function toggleGreenLight(item: AnnounceItem) {
    // Optimistic, so the lamp switches at once; the response confirms
    setBoard(b => ({ ...b, list: b.list.map(i => keyOf(i) === keyOf(item) ? { ...i, greenLight: !i.greenLight } : i) }));
    patch({ action: "greenLight", ...refOf(item), on: !item.greenLight }, keyOf(item));
  }
  function reorder(keys: string[]) {
    setBoard(b => {
      const by = new Map(b.list.map(i => [keyOf(i), i]));
      return { ...b, list: keys.map(k => by.get(k)).filter((i): i is AnnounceItem => !!i) };
    });
    patch({ action: "reorder", keys }, null);
  }
  function undoAnnounced(item: AnnounceItem) {
    patch({ action: "announce", ...refOf(item), announced: false }, keyOf(item));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/organizer/events/${event.slug}/manage`}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-zinc-900">Pengumuman</h1>
          </div>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
      </div>

      {/* Announcer boards */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-zinc-50 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Papan Pengumuman (MC / Juruacara)</h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Pautan unik dengan passcode. Papan memaparkan pertandingan yang keputusannya telah disahkan (VERIFIED) dan boleh diumumkan.
            </p>
          </div>
          {isSuperAdmin && (
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 shrink-0"
              onClick={() => { setShowCreate(true); setLabel(""); setCreateErr(""); }}>
              <Plus className="h-3 w-3" /> Jana Pautan
            </Button>
          )}
        </div>
        {endpoints.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">
            Tiada papan pengumuman lagi.{isSuperAdmin ? " Klik \"Jana Pautan\" untuk mencipta satu." : " Hanya Super Admin boleh mencipta."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50/40">
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-40">Label</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">URL</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-36">Passcode</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 w-24">Status</th>
                  {isSuperAdmin && <th className="px-4 py-2 w-28" />}
                </tr>
              </thead>
              <tbody>
                {endpoints.map(ep => (
                  <EndpointRow key={ep.id} ep={ep} eventId={event.id} isSuperAdmin={isSuperAdmin}
                    onChange={u => setEndpoints(p => p.map(e => e.id === u.id ? u : e))}
                    onDelete={id => setEndpoints(p => p.filter(e => e.id !== id))} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionErr && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{actionErr}</p>}

      {/* Configuration */}
      <SectionCard title="Konfigurasi" icon={<Settings2 className="h-4 w-4 text-zinc-500" />}>
        <AnnouncementConfig maxPlaces={board.maxPlaces} isSuperAdmin={isSuperAdmin}
          onSave={n => patch({ action: "config", maxPlaces: n }, null)} />
      </SectionCard>

      {/* 1. Announcement list — the MC boards follow it live */}
      <SectionCard
        title="Senarai Pengumuman"
        icon={<ListOrdered className="h-4 w-4 text-emerald-600" />}
        count={board.list.length}
        hint={isSuperAdmin
          ? "Panduan utama Papan Pengumuman MC. Seret untuk menyusun; beri lampu hijau apabila keputusan sedia diumumkan."
          : "Panduan utama Papan Pengumuman MC, disusun oleh Super Admin."}
      >
        <AnnouncementList items={board.list} isSuperAdmin={isSuperAdmin} busyKey={busyKey}
          onGreenLight={toggleGreenLight} onReorder={reorder} />
      </SectionCard>

      {/* 2. Waiting for verification */}
      <SectionCard
        title="Menunggu Pengesahan"
        icon={<Hourglass className="h-4 w-4 text-amber-500" />}
        count={board.waiting.length}
        hint={<>Diumumkan selesai, belum disahkan · <span className="inline-flex items-center gap-1"><Gavel className="h-3 w-3" />{board.stillJudging} pertandingan masih dinilai</span></>}
      >
        <WaitingList items={board.waiting} />
      </SectionCard>

      {/* 3. Announced */}
      <SectionCard
        title="Telah Diumumkan"
        icon={<CheckCircle2 className="h-4 w-4 text-zinc-400" />}
        count={board.announced.length}
      >
        <AnnouncedList items={board.announced} isSuperAdmin={isSuperAdmin} busyKey={busyKey} onUndo={undoAnnounced} />
      </SectionCard>

      {/* Create board dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) setShowCreate(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Megaphone className="h-4 w-4" /> Jana Papan Pengumuman
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 px-4">
            <div>
              <Label className="text-xs">Label (pilihan)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="cth. MC Pentas Utama"
                className="mt-1 h-8 text-sm" onKeyDown={e => e.key === "Enter" && create()} />
              <p className="text-[10px] text-zinc-400 mt-1">URL unik dan passcode akan dijana secara automatik.</p>
            </div>
            {createErr && <p className="text-xs text-red-500">{createErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Batal</Button>
            <Button onClick={create} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Jana Pautan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
