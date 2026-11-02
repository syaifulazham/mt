"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Loader2, CheckCircle2, Circle, AlertTriangle, Plus, Trash2, Radio, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Dashboard → "Stats Snapshot" (Super Admin): choose live data or a saved
// snapshot for the whole organizer dashboard, and build new snapshots part by
// part with visible progress.

type Snapshot = {
  id: string; label: string | null; status: string; partCount: number;
  createdBy: string | null; createdAt: string; completedAt: string | null;
};
type Source = { mode: "live" } | { mode: "snapshot"; snapshotId: string };
type Part = { key: string; label: string };
type BuildStep = Part & { state: "pending" | "running" | "done" | "error"; ms?: number; detail?: string };

const API = "/api/v2/organizer/dashboard-snapshots";
const fmtWhen = (d: string | null) => d ? new Date(d).toLocaleString("ms-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j as T;
}

/** Notice for every organizer while the dashboard shows a snapshot. */
export function SnapshotNotice() {
  const [active, setActive] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    call<{ active: Snapshot | null }>(API).then(j => { if (alive) setActive(j.active); }).catch(() => {});
    const onChange = () => call<{ active: Snapshot | null }>(API).then(j => setActive(j.active)).catch(() => {});
    window.addEventListener("dashboard-source-changed", onChange);
    return () => { alive = false; window.removeEventListener("dashboard-source-changed", onChange); };
  }, []);
  if (!active) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <p className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-2 text-xs text-amber-800">
        <Database className="h-3.5 w-3.5 shrink-0" />
        Showing snapshot data{active.label ? ` "${active.label}"` : ""} taken {fmtWhen(active.completedAt ?? active.createdAt)} — not live.
      </p>
    </div>
  );
}

export function StatsSnapshotMenu() {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [source, setSource] = useState<Source>({ mode: "live" });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [steps, setSteps] = useState<BuildStep[] | null>(null);
  const [buildStart, setBuildStart] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const j = await call<{ source: Source; snapshots: Snapshot[] }>(API);
    setSnapshots(j.snapshots ?? []);
    setSource(j.source);
    const ready = (j.snapshots ?? []).filter(s => s.status === "READY");
    setSelected(cur => cur && ready.some(s => s.id === cur) ? cur
      : j.source.mode === "snapshot" ? j.source.snapshotId : ready[0]?.id ?? null);
  }, []);

  function openModal() {
    setOpen(true);
    refresh().catch(e => setErr(e instanceof Error ? e.message : "Gagal"));
  }

  const building = !!steps?.some(s => s.state === "running" || s.state === "pending");
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [building]);

  async function applySource(next: Source) {
    setBusy(true); setErr("");
    try {
      await call(API, { method: "PATCH", body: JSON.stringify(next) });
      await refresh();
      window.dispatchEvent(new Event("dashboard-source-changed"));
      window.location.reload(); // the dashboard views re-read their data
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  async function createSnapshot() {
    setErr(""); setBuildStart(Date.now()); setNow(Date.now());
    setSteps([{ key: "create", label: "Menyediakan snapshot baharu", state: "running" }]);
    let snapshotId: string | null = null;
    try {
      const t0 = Date.now();
      const { snapshot, parts } = await call<{ snapshot: Snapshot; parts: Part[] }>(API, { method: "POST", body: JSON.stringify({ label }) });
      snapshotId = snapshot.id;
      const list: BuildStep[] = [
        { key: "create", label: "Menyediakan snapshot baharu", state: "done", ms: Date.now() - t0, detail: `${parts.length} bahagian` },
        ...parts.map((p): BuildStep => ({ ...p, state: "pending" })),
        { key: "finalize", label: "Menyimpan dan menyiapkan snapshot", state: "pending" },
      ];
      setSteps(list);
      const set = (key: string, patch: Partial<BuildStep>) => setSteps(s => s?.map(x => x.key === key ? { ...x, ...patch } : x) ?? s);
      for (const p of [...parts, { key: "finalize", label: "" }]) {
        set(p.key, { state: "running" });
        const t1 = Date.now();
        const r = await call<{ bytes?: number }>(`${API}/${snapshot.id}`, { method: "POST", body: JSON.stringify({ part: p.key }) });
        set(p.key, { state: "done", ms: Date.now() - t1, detail: r.bytes ? `${(r.bytes / 1024).toFixed(1)} KB` : undefined });
      }
      setLabel("");
      setNow(Date.now());
      await refresh();
      setSelected(snapshot.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal";
      setSteps(s => s?.map(x => x.state === "running" ? { ...x, state: "error", detail: msg } : x) ?? s);
      setErr(`Snapshot gagal dibina: ${msg}`);
      if (snapshotId) await refresh().catch(() => {});
    }
  }

  async function remove(id: string) {
    if (!confirm("Padam snapshot ini?")) return;
    setBusy(true); setErr("");
    try {
      await call(`${API}/${id}`, { method: "DELETE" });
      await refresh();
      window.dispatchEvent(new Event("dashboard-source-changed"));
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); }
    finally { setBusy(false); }
  }

  const ready = snapshots.filter(s => s.status === "READY");
  const usingSnapshot = source.mode === "snapshot";
  const doneCount = steps?.filter(s => s.state === "done").length ?? 0;
  const pct = steps?.length ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <>
      <button onClick={openModal}
        className={cn("ml-auto my-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
          usingSnapshot ? "border-amber-300 bg-amber-50 text-amber-800" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
        <Camera className="h-3.5 w-3.5" /> Stats Snapshot
      </button>

      <Dialog open={open} onOpenChange={o => { if (!building) setOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm"><Camera className="h-4 w-4" /> Stats Snapshot</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-4 pb-4">
            {/* 1. Data source */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Data source">
              {([["live", "Use live data", Radio], ["snapshot", "Use snapshot data", Database]] as const).map(([mode, text, Icon]) => {
                const active = source.mode === mode;
                const disabled = busy || building || (mode === "snapshot" && (ready.length === 0 || !selected));
                return (
                  <button key={mode} role="radio" aria-checked={active} disabled={disabled}
                    onClick={() => applySource(mode === "live" ? { mode: "live" } : { mode: "snapshot", snapshotId: selected! })}
                    className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors disabled:opacity-40",
                      active ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                    <Icon className="h-4 w-4" /> {text}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500">
              Applies to the whole organizer dashboard — Overview, View by Zone and View by State — for every organizer.
              Drill-down lists (contingents by category / state) stay live.
            </p>

            {/* 2. Saved snapshots */}
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-zinc-50 px-3 py-2">
                <span className="text-xs font-semibold text-zinc-700">Saved snapshots</span>
                <span className="text-[11px] text-zinc-400">{ready.length} ready</span>
              </div>
              {snapshots.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-400">No snapshot yet — create one below.</p>
              ) : (
                <ul className="max-h-52 divide-y overflow-y-auto">
                  {snapshots.map(s => {
                    const isReady = s.status === "READY";
                    const inUse = source.mode === "snapshot" && source.snapshotId === s.id;
                    return (
                      <li key={s.id} className={cn("flex items-center gap-2 px-3 py-2 text-xs", selected === s.id && "bg-sky-50")}>
                        <input type="radio" name="snapshot" checked={selected === s.id} disabled={!isReady || building}
                          onChange={() => setSelected(s.id)} className="accent-[#085782]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-800">{s.label || `Snapshot ${fmtWhen(s.createdAt)}`}</p>
                          <p className="text-[11px] text-zinc-400">
                            {fmtWhen(s.completedAt ?? s.createdAt)}{s.createdBy && ` · ${s.createdBy}`} · {s.partCount} bahagian
                          </p>
                        </div>
                        {inUse && <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">IN USE</span>}
                        {!isReady && (
                          <span className={cn("rounded px-1.5 py-px text-[10px] font-bold",
                            s.status === "FAILED" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-500")}>{s.status}</span>
                        )}
                        <button onClick={() => remove(s.id)} disabled={busy || building} title="Padam"
                          className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {usingSnapshot && selected && source.mode === "snapshot" && selected !== source.snapshotId && (
                <div className="border-t px-3 py-2">
                  <Button size="sm" className="h-7 text-xs" disabled={busy || building}
                    onClick={() => applySource({ mode: "snapshot", snapshotId: selected })}>Use the selected snapshot</Button>
                </div>
              )}
            </div>

            {/* 3. Create */}
            <div className="flex items-center gap-2">
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional), e.g. Laporan Mesyuarat Okt"
                disabled={building} maxLength={80}
                className="h-8 flex-1 rounded-md border px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200" />
              <Button size="sm" onClick={createSnapshot} disabled={building || busy} className="h-8 gap-1 text-xs">
                {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create snapshot
              </Button>
            </div>

            {steps && (
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-700">{building ? "Building snapshot…" : steps.some(s => s.state === "error") ? "Build failed" : "Snapshot ready"}</span>
                  <span className="tabular-nums text-zinc-400">{doneCount}/{steps.length} · {pct}% · {(Math.max(0, now - buildStart) / 1000).toFixed(1)} s</span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-[#085782] transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <ol className="max-h-44 space-y-1 overflow-y-auto">
                  {steps.map(s => (
                    <li key={s.key} className="flex items-center gap-2 text-[11px]">
                      {s.state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        : s.state === "running" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#085782]" />
                        : s.state === "error" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        : <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
                      <span className={cn(s.state === "pending" ? "text-zinc-400" : "text-zinc-700")}>{s.label}</span>
                      {s.detail && <span className={cn("text-zinc-400", s.state === "error" && "text-red-600")}>— {s.detail}</span>}
                      {s.ms != null && <span className="ml-auto tabular-nums text-zinc-400">{s.ms} ms</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
