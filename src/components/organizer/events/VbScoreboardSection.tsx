"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, MonitorPlay, Pencil, Plus, Shapes, Trash2, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Live scoreboard links (/live/<slug>) of a VibeBlocks walk-in competition:
// big-screen boards fed by VibeBlocks' event-wide leaderboard, each with an
// optional passcode.

type Board = {
  id: string; routeSlug: string; passcode: string | null; label: string | null;
  /** Another VibeBlocks event shown instead of the competition's own. */
  vibeBlocksEventId: string | null;
  /** Names on one screen at most, and seconds per page. */
  pageSize: number; pageSeconds: number;
  /** Table header: text labels or icons. */
  headerStyle: "LABEL" | "ICON";
  active: boolean; createdAt: string;
};
type VbEvent = { event_id: string; name: string; status: string };

export function VbScoreboardSection({ eventId, wicId, canWrite, eventCreated, ownEventId }: {
  eventId: string; wicId: string; canWrite: boolean;
  /** The competition's own VibeBlocks event_id (shown when a link has no override). */
  ownEventId?: string | null;
  /** The VibeBlocks event exists; boards show nothing until it does. */
  eventCreated: boolean;
}) {
  const base = `/api/v2/organizer/events/${eventId}/walkin/${wicId}/scoreboards`;
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [usePasscode, setUsePasscode] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Board | null>(null);
  const [vbEventId, setVbEventId] = useState("");
  const [pageSize, setPageSize] = useState("12");
  const [pageSeconds, setPageSeconds] = useState("10");
  const [headerStyle, setHeaderStyle] = useState<"LABEL" | "ICON">("LABEL");
  const [editingPg, setEditingPg] = useState<string | null>(null);
  const [pgDraft, setPgDraft] = useState({ size: "", secs: "" });
  const [editingEv, setEditingEv] = useState<string | null>(null);
  const [evDraft, setEvDraft] = useState("");
  // VibeBlocks events, as suggestions for the event ID fields.
  const [vbEvents, setVbEvents] = useState<VbEvent[]>([]);
  useEffect(() => {
    fetch(`/api/v2/organizer/events/${eventId}/walkin/vibeblocks-events?provider=vibeblocks`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => setVbEvents(j?.events ?? [])).catch(() => {});
  }, [eventId]);

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setError(j?.message ?? "Gagal memuatkan papan skor."); return; }
    setBoards(j.data);
  }, [base]);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function call(key: string, url: string, method: string, body?: unknown) {
    setBusy(key); setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { setError(j?.message ?? "Tindakan gagal."); return false; }
    await load();
    return true;
  }

  async function create() {
    const ok = await call("new", base, "POST", {
      label,
      ...(vbEventId.trim() ? { vibeBlocksEventId: vbEventId.trim() } : {}),
      pageSize: Number(pageSize), pageSeconds: Number(pageSeconds), headerStyle,
      // Omitted → generated; "" → open link.
      ...(usePasscode ? (passcode.trim() ? { passcode: passcode.trim() } : {}) : { passcode: "" }),
    });
    if (ok) { setAdding(false); setLabel(""); setPasscode(""); setUsePasscode(true); setVbEventId(""); setPageSize("12"); setPageSeconds("10"); setHeaderStyle("LABEL"); }
  }

  const urlOf = (b: Board) => `${typeof window !== "undefined" ? window.location.origin : ""}/live/${b.routeSlug}`;
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt("Salin:", text); return; }
    setCopied(key); setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorPlay className="h-4 w-4 text-indigo-600 shrink-0" />
          <p className="text-sm font-semibold text-zinc-800">Papan Skor Langsung</p>
          {boards && boards.length > 0 && <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded-full">{boards.length}</span>}
        </div>
        {canWrite && !adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Pautan baharu
          </Button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500">
        Paparan skrin besar: kemajuan, perlanggaran, masa, penalti dan jumlah masa setiap peserta, terus daripada papan pendahulu VibeBlocks (dikemas kini setiap 5 saat).
        {!eventCreated && <span className="text-amber-700"> Acara VibeBlocks pertandingan ini belum dicipta — isi event ID acara lain, atau cipta acara dahulu.</span>}
      </p>

      {adding && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-3 space-y-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (cth. Skrin Dewan A)" maxLength={80}
            className="h-8 w-full rounded-md border px-2 text-sm" />
          <div>
            <input value={vbEventId} onChange={(e) => setVbEventId(e.target.value.trim())} list={`vb-events-${wicId}`} maxLength={64}
              placeholder={`Event ID VibeBlocks (pilihan) — lalai: ${ownEventId ?? "acara pertandingan ini"}`}
              className="h-8 w-full rounded-md border px-2 font-mono text-sm" />
            <p className="mt-0.5 text-[11px] text-zinc-400">Isi untuk memaparkan acara VibeBlocks lain (event ID daripada aplikasi rakan).</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-700">
            <label className="flex items-center gap-1.5">
              Maks.
              <input type="number" min={3} max={30} value={pageSize} onChange={(e) => setPageSize(e.target.value)}
                className="h-8 w-16 rounded-md border px-2 text-sm tabular-nums" />
              nama sepaparan
            </label>
            <label className="flex items-center gap-1.5">
              Tukar halaman setiap
              <input type="number" min={3} max={120} value={pageSeconds} onChange={(e) => setPageSeconds(e.target.value)}
                className="h-8 w-16 rounded-md border px-2 text-sm tabular-nums" />
              saat
            </label>
            <span className="flex items-center gap-1.5">
              Pengepala
              <HeaderToggle value={headerStyle} onChange={setHeaderStyle} />
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input type="checkbox" checked={usePasscode} onChange={(e) => setUsePasscode(e.target.checked)} />
            Lindungi dengan passcode
          </label>
          {usePasscode && (
            <input value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
              placeholder="Kosongkan untuk jana automatik" maxLength={32}
              className="h-8 w-full rounded-md border px-2 font-mono text-sm uppercase" />
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Batal</Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy === "new" || (usePasscode && passcode.length > 0 && passcode.length < 4)} onClick={create}>
              {busy === "new" && <Loader2 className="h-3 w-3 animate-spin" />} Cipta pautan
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!boards && !error && <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3 w-3 animate-spin" /> Memuatkan…</div>}
      {boards && boards.length === 0 && !adding && <p className="text-xs text-zinc-400">Belum ada pautan papan skor.</p>}

      {boards && boards.length > 0 && (
        <div className="divide-y divide-zinc-100 rounded-lg border">
          {boards.map((b) => (
            <div key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${b.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-800 truncate">{b.label || "Papan skor"}</p>
                <p className="text-[11px] text-zinc-500 font-mono truncate">/live/{b.routeSlug}</p>
                {editingEv === b.id ? (
                  <div className="mt-1 flex items-center gap-1">
                    <input value={evDraft} autoFocus onChange={(e) => setEvDraft(e.target.value.trim())} list={`vb-events-${wicId}`} maxLength={64}
                      placeholder={ownEventId ?? "event ID"} className="h-7 min-w-0 flex-1 rounded-md border px-2 font-mono text-xs"
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingEv(null); }} />
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy === `e-${b.id}`}
                      onClick={async () => { if (await call(`e-${b.id}`, `${base}/${b.id}`, "PATCH", { vibeBlocksEventId: evDraft })) setEditingEv(null); }}>
                      {busy === `e-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Simpan"}
                    </Button>
                    <button className="p-1 text-zinc-400 hover:text-zinc-700" onClick={() => setEditingEv(null)}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                    Acara:{" "}
                    <code className={`font-mono ${b.vibeBlocksEventId ? "text-indigo-700" : ""}`}>{b.vibeBlocksEventId ?? ownEventId ?? "—"}</code>
                    {!b.vibeBlocksEventId && <span className="text-zinc-400">(pertandingan ini)</span>}
                    {canWrite && (
                      <button className="p-0.5 text-zinc-400 hover:text-zinc-700" title="Tukar acara VibeBlocks"
                        onClick={() => { setEditingEv(b.id); setEvDraft(b.vibeBlocksEventId ?? ""); }}>
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                )}
                {/* Paging: names per screen, seconds per page */}
                {editingPg === b.id ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
                    Maks.
                    <input type="number" min={3} max={30} value={pgDraft.size} onChange={(e) => setPgDraft((d) => ({ ...d, size: e.target.value }))}
                      className="h-7 w-14 rounded-md border px-1.5 text-xs tabular-nums" />
                    nama · setiap
                    <input type="number" min={3} max={120} value={pgDraft.secs} onChange={(e) => setPgDraft((d) => ({ ...d, secs: e.target.value }))}
                      className="h-7 w-14 rounded-md border px-1.5 text-xs tabular-nums" />
                    saat
                    <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy === `g-${b.id}`}
                      onClick={async () => { if (await call(`g-${b.id}`, `${base}/${b.id}`, "PATCH", { pageSize: Number(pgDraft.size), pageSeconds: Number(pgDraft.secs) })) setEditingPg(null); }}>
                      {busy === `g-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Simpan"}
                    </Button>
                    <button className="p-1 text-zinc-400 hover:text-zinc-700" onClick={() => setEditingPg(null)}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                    Paparan: maks. <b className="font-semibold text-zinc-700">{b.pageSize}</b> nama, tukar setiap <b className="font-semibold text-zinc-700">{b.pageSeconds}</b> saat
                    {canWrite && (
                      <button className="p-0.5 text-zinc-400 hover:text-zinc-700" title="Tukar bilangan nama / tempoh halaman"
                        onClick={() => { setEditingPg(b.id); setPgDraft({ size: String(b.pageSize), secs: String(b.pageSeconds) }); }}>
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  Pengepala
                  <HeaderToggle value={b.headerStyle} disabled={!canWrite || busy === `h-${b.id}`}
                    onChange={(v) => { if (v !== b.headerStyle) void call(`h-${b.id}`, `${base}/${b.id}`, "PATCH", { headerStyle: v }); }} />
                  {busy === `h-${b.id}` && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-mono ${b.passcode ? "bg-amber-50 text-amber-800" : "bg-zinc-100 text-zinc-500"}`}>
                <KeyRound className="h-3 w-3" /> {b.passcode ?? "tiada"}
              </span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 text-zinc-500 hover:text-zinc-900" title="Salin pautan" onClick={() => copy(`u-${b.id}`, urlOf(b))}>
                  {copied === `u-${b.id}` ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a className="p-1.5 text-zinc-500 hover:text-zinc-900" title="Buka" href={`/live/${b.routeSlug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {canWrite && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === `p-${b.id}`}
                      title={b.passcode ? "Jana passcode baharu" : "Tambah passcode"}
                      onClick={() => call(`p-${b.id}`, `${base}/${b.id}`, "PATCH", { passcode: "new" })}>
                      {b.passcode ? "Passcode baharu" : "Tambah passcode"}
                    </Button>
                    {b.passcode && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === `p-${b.id}`}
                        onClick={() => call(`p-${b.id}`, `${base}/${b.id}`, "PATCH", { passcode: "" })}>
                        Buang passcode
                      </Button>
                    )}
                    <button type="button" role="switch" aria-checked={b.active} title={b.active ? "Aktif — klik untuk tutup" : "Ditutup — klik untuk aktifkan"}
                      disabled={busy === `a-${b.id}`} onClick={() => call(`a-${b.id}`, `${base}/${b.id}`, "PATCH", { active: !b.active })}
                      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${b.active ? "bg-emerald-500" : "bg-zinc-300"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${b.active ? "left-3.5" : "left-0.5"}`} />
                    </button>
                    <button className="p-1.5 text-zinc-400 hover:text-red-600" title="Padam" onClick={() => setToDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <datalist id={`vb-events-${wicId}`}>
        {vbEvents.map((e) => <option key={e.event_id} value={e.event_id}>{e.name} · {e.status}</option>)}
      </datalist>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title="Padam pautan papan skor?"
        description={`${toDelete?.label || "Papan skor"} (/live/${toDelete?.routeSlug}) akan berhenti berfungsi pada semua skrin.`}
        confirmLabel="Padam"
        destructive
        onConfirm={async () => { if (toDelete) await call(`d-${toDelete.id}`, `${base}/${toDelete.id}`, "DELETE"); setToDelete(null); }}
      />
    </div>
  );
}

/** Scoreboard table header: text labels or icons only. */
function HeaderToggle({ value, onChange, disabled }: {
  value: "LABEL" | "ICON"; onChange: (v: "LABEL" | "ICON") => void; disabled?: boolean;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border bg-white text-[11px] font-medium">
      {([["LABEL", "Label", Type], ["ICON", "Ikon", Shapes]] as const).map(([v, label, Icon], i) => (
        <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={`flex items-center gap-1 px-2 py-0.5 transition-colors ${i ? "border-l" : ""} ${
            value === v ? "bg-indigo-600 text-white" : "text-zinc-500 hover:bg-zinc-50"} disabled:cursor-default`}>
          <Icon className="h-3 w-3" /> {label}
        </button>
      ))}
    </span>
  );
}
