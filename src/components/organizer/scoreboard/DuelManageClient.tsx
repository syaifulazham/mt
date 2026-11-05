"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, Check, Clock, Flag, Loader2, Lock, LockOpen, Pause, Play, RotateCcw, Search,
  Shuffle, Square, Swords, Trash2, Trophy, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AvatarPreference, TeamAvatar, preferFor } from "@/components/duel/TeamAvatar";
import { WhepVideo } from "@/components/duel/WhepVideo";
import { cn } from "@/lib/utils";
import { findClashes, remainingMs, sessionSizes, type DuelConfig, type DuelSplit } from "@/lib/duel";

// ── Types (shape of GET …/duel) ───────────────────────────────────────────────

type Team = {
  id: string; name: string; contingentId: string; contingentName: string; logoUrl: string | null;
  stateId: string | null; stateName: string | null; flagUrl: string | null;
};
type Entry = { id: string; teamId: string; slot: number; rank: number | null; points: number | null; advanced: boolean; team: Team };
type Session = {
  id: string; number: number; label: string; arena: number; wave: number; scheduledAt: string | null;
  status: string; startedAt: string | null; pausedAt: string | null; pausedMs: number; endedAt: string | null;
  /** WHEP URL while the media team's camera is live. */
  video: string | null;
  /** Stream watch page of the uploaded replay. */
  replayUrl: string | null;
  entries: Entry[];
};
type Round = {
  id: string; groupKey: string; number: number; isFinal: boolean; status: string; split: string;
  noSameContingent: boolean; noSameState: boolean; startAt: string | null; sessions: Session[];
};
type Standing = { teamId: string; position: number; total: number; reached: number; finalRank: number | null; perRound: Record<number, number | null>; team: Team };
type Group = { key: string; name: string | null; flagUrl: string | null; poolCount: number };
type State = {
  config: DuelConfig; role: string; pool: Team[]; groups: Group[]; rounds: Round[];
  /** Standings per bracket (group key; "" for a national bracket). */
  standings: Record<string, Standing[]>; serverNow: number;
};

const POLL_MS = 3_000;
const roundName = (r: { number: number; isFinal: boolean }) => (r.isFinal ? "Akhir" : `Pusingan ${r.number}`);
const sessionName = (r: Round, s: Session) => (r.isFinal ? "Akhir" : `Sesi ${s.label}`);
const clock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : null;

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-zinc-100 text-zinc-500" },
  RUNNING: { label: "Berjalan", cls: "bg-emerald-100 text-emerald-700" },
  PAUSED: { label: "Dijeda", cls: "bg-amber-100 text-amber-700" },
  ENDED: { label: "Perlu kedudukan", cls: "bg-rose-100 text-rose-700" },
  DONE: { label: "Selesai", cls: "bg-violet-100 text-violet-700" },
};

// ── Main ─────────────────────────────────────────────────────────────────────

export function DuelManageClient({ event, ecId, competition, role }: {
  event: { id: string; name: string; slug: string }; ecId: string; competition: { name: string; code: string }; role: string;
}) {
  const base = `/api/v2/organizer/events/${event.id}/competitions/${ecId}/duel`;
  const [data, setData] = useState<State | null>(null);
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<string | null>(null);
  const [groupSel, setGroupSel] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const pauseRef = useRef(false);
  const canConfig = ["SUPER_ADMIN", "ADMIN"].includes(role);
  const canControl = canConfig || role === "OPERATOR";

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) return;
      const j: State = await res.json();
      setOffset(j.serverNow - Date.now());
      setData(j);
    } catch { /* keep the last good state */ }
  }, [base]);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!pauseRef.current && !document.hidden) await load();
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [load]);

  /** POST/PATCH/DELETE then reload; the message is shown on failure. */
  const act = useCallback(async (url: string, method: string, body?: unknown) => {
    setErr("");
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal"); await load(); return null; }
    await load();
    return j;
  }, [load]);

  if (!data) {
    return <div className="p-10 text-center text-sm text-zinc-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</div>;
  }

  const { config, groups } = data;
  const isState = config.scope === "STATE";
  const gKey = groups.some(g => g.key === groupSel) ? groupSel! : groups[0]?.key ?? "";
  const group = groups.find(g => g.key === gKey);
  const rounds = data.rounds.filter(r => r.groupKey === gKey);
  const pool = data.pool.filter(t => (isState ? t.stateId ?? "" : "") === gKey);
  const last = rounds[rounds.length - 1];
  const finished = !!last?.isFinal && last.status === "DONE";
  // A new draw is possible when nothing is drawn yet or the last round is done (and not the final).
  const canDraw = !last || (last.status === "DONE" && !last.isFinal);
  const tabs = [
    ...rounds.map(r => ({ key: r.id, label: roundName(r), badge: r.status })),
    ...(canDraw ? [{ key: "draw", label: last ? "Cabut pusingan seterusnya" : "Cabutan", badge: "NEW" }] : []),
    { key: "standings", label: "Kedudukan Akhir", badge: finished ? "DONE" : "" },
  ];
  const active = tab && tabs.some(t => t.key === tab) ? tab : canDraw ? "draw" : last?.id ?? "standings";
  const round = rounds.find(r => r.id === active);

  return (
    <AvatarPreference value={preferFor(config.scope)}>
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href={`/organizer/events/${event.slug}/manage/scoreboard`} className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Scoreboard
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <Swords className="h-5 w-5 text-rose-500" />
            <span className="font-mono text-zinc-400">{competition.code}</span> {competition.name}
          </h1>
          <p className="text-sm text-zinc-500">{event.name}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {[
            isState ? "Skop: Negeri" : "Skop: Kebangsaan",
            `${config.perSession} pasukan/sesi`, `${config.advance} mara/sesi`, `${config.arenas} arena`,
            `${clock(config.durationSec * 1000)} /duel`,
          ].map(t => <span key={t} className="rounded-full border bg-white px-2.5 py-1 text-zinc-600">{t}</span>)}
          <Link href={`/organizer/events/${event.slug}/manage/judging`} className="rounded-full border border-rose-200 px-2.5 py-1 font-medium text-rose-600 hover:bg-rose-50">Tetapan</Link>
        </div>
      </div>

      {isState && (
        <div className="flex flex-wrap gap-2">
          {groups.length === 0 && <p className="text-sm text-zinc-400">Tiada pasukan hadir.</p>}
          {groups.map(g => {
            const gr = data.rounds.filter(r => r.groupKey === g.key);
            const gl = gr[gr.length - 1];
            const done = !!gl?.isFinal && gl.status === "DONE";
            const live = gl?.sessions.some(x => x.status === "RUNNING" || x.status === "PAUSED");
            return (
              <button key={g.key} onClick={() => { setGroupSel(g.key); setTab(null); }}
                className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition",
                  g.key === gKey ? "border-rose-400 bg-rose-50 font-semibold text-rose-700 shadow-sm" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                <TeamAvatar flagUrl={g.flagUrl} name={g.name ?? "?"} className="h-6 w-6" prefer="flag" />
                {g.name}
                <span className="text-[11px] font-normal text-zinc-400">{g.poolCount}</span>
                {live && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
                {done ? <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  : gl ? <span className="rounded bg-zinc-100 px-1 text-[10px] font-normal text-zinc-500">{roundName(gl)}{gl.status === "DRAFT" ? " · draf" : ""}</span>
                  : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active === t.key ? "border-rose-500 text-rose-600" : "border-transparent text-zinc-500 hover:text-zinc-800")}>
            {t.label}
            {t.badge === "DRAFT" && <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">draf</span>}
            {t.badge === "CONFIRMED" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            {t.badge === "DONE" && <Check className="h-3.5 w-3.5 text-violet-500" />}
          </button>
        ))}
      </div>

      {err && (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {err}
        </p>
      )}

      {active === "draw" && (
        <DrawPanel
          key={gKey}
          base={base} config={config} canConfig={canConfig} groupKey={gKey} groupName={group?.name ?? null}
          entrants={last ? last.sessions.flatMap(s => s.entries.filter(e => e.advanced).map(e => e.team)) : pool}
          nextNumber={(last?.number ?? 0) + 1}
          isPool={!last}
          act={act}
          onDrawn={() => setTab(null)}
        />
      )}
      {round?.status === "DRAFT" && (
        <DraftRound base={base} round={round} config={config} canConfig={canConfig} act={act} pauseRef={pauseRef} />
      )}
      {round && round.status !== "DRAFT" && (
        <LiveRound
          base={base} round={round} config={config} offset={offset} role={role}
          canConfig={canConfig} canControl={canControl} act={act}
          isLast={round.id === last?.id}
          onNext={() => setTab("draw")}
        />
      )}
      {active === "standings" && <Standings rounds={rounds} standings={data.standings[gKey] ?? []} finished={finished} />}
    </div>
    </AvatarPreference>
  );
}

type Act = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>;

// ── Draw ─────────────────────────────────────────────────────────────────────

function DrawPanel({ base, config, canConfig, groupKey, groupName, entrants, nextNumber, isPool, act, onDrawn }: {
  base: string; config: DuelConfig; canConfig: boolean; groupKey: string; groupName: string | null;
  entrants: Team[]; nextNumber: number; isPool: boolean;
  act: Act; onDrawn: () => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [split, setSplit] = useState<DuelSplit>("even");
  const [noSameContingent, setNoC] = useState(true);
  const [noSameState, setNoS] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = entrants.filter(t => !excluded.has(t.id));
  const preview = (s: DuelSplit) => sessionSizes(chosen.length, config.perSession, s);
  const isFinal = chosen.length <= config.perSession;
  const shown = entrants.filter(t => !q || `${t.name} ${t.contingentName} ${t.stateName ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  async function draw() {
    setBusy(true);
    const j = await act(`${base}/rounds`, "POST", {
      groupKey, teamIds: isPool ? chosen.map(t => t.id) : undefined, split, noSameContingent, noSameState: config.scope !== "STATE" && noSameState,
    });
    setBusy(false);
    if (j) onDrawn();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <Users className="h-4 w-4 text-zinc-400" />
          <p className="flex-1 text-sm font-semibold text-zinc-800">
            {groupName && <span className="mr-1 text-rose-600">{groupName} ·</span>}
            {isPool ? "Pasukan hadir" : `Pasukan mara ke ${isFinal ? "Akhir" : `Pusingan ${nextNumber}`}`}
            <span className="ml-2 font-normal text-zinc-400">{chosen.length}/{entrants.length} dipilih</span>
          </p>
          {isPool && entrants.length > 0 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari…" className="h-8 w-44 pl-7 text-xs" />
              </div>
              <button className="text-xs text-violet-600 hover:underline" onClick={() => setExcluded(new Set())}>Pilih semua</button>
              <button className="text-xs text-zinc-500 hover:underline" onClick={() => setExcluded(new Set(entrants.map(t => t.id)))}>Kosongkan</button>
            </>
          )}
        </div>
        {entrants.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-400">
            {isPool ? "Tiada pasukan yang direkodkan hadir untuk pertandingan ini. Rekod kehadiran di Log Kehadiran dahulu." : "Tiada pasukan yang mara."}
          </p>
        ) : (
          <div className="grid max-h-[32rem] gap-1 overflow-y-auto p-2 sm:grid-cols-2">
            {shown.map(t => {
              const on = !excluded.has(t.id);
              return (
                <label key={t.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-zinc-50", !on && "opacity-50")}>
                  {isPool && (
                    <input type="checkbox" checked={on} className="accent-rose-600"
                      onChange={() => setExcluded(p => { const n = new Set(p); if (on) n.add(t.id); else n.delete(t.id); return n; })} />
                  )}
                  <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingentName} className="h-7 w-7" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-800">{t.name}</span>
                    <span className="block truncate text-[11px] text-zinc-400">{t.contingentName}{t.stateName ? ` · ${t.stateName}` : ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-zinc-800">Pilihan cabutan</p>
        <div className="space-y-2">
          {([["even", "Sebar sama rata"], ["fill", "Penuhkan, baki akhir"]] as const).map(([k, l]) => (
            <label key={k} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5", split === k ? "border-rose-300 bg-rose-50/50" : "border-zinc-200")}>
              <input type="radio" checked={split === k} onChange={() => setSplit(k)} className="mt-0.5 accent-rose-600" />
              <span>
                <span className="block text-sm font-medium text-zinc-800">{l}</span>
                <span className="block text-[11px] text-zinc-500">
                  {chosen.length ? `${preview(k).length} sesi: ${preview(k).join(", ")}` : "—"}
                  {k === "fill" && preview(k).includes(1) && " · sesi 1 pasukan = bye (terus mara)"}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Toggle on={noSameContingent} onChange={setNoC} label="Elak kontinjen sama dalam satu sesi" />
          {config.scope !== "STATE" && <Toggle on={noSameState} onChange={setNoS} label="Elak negeri sama dalam satu sesi" />}
        </div>
        {isFinal && chosen.length >= 2 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {chosen.length} pasukan muat dalam satu sesi — ini akan menjadi <b>pusingan Akhir</b>.
          </p>
        )}
        {canConfig ? (
          <Button onClick={draw} disabled={busy || chosen.length < 2} className="w-full gap-2 bg-rose-600 hover:bg-rose-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />} Cabut secara rawak
          </Button>
        ) : (
          <p className="text-xs text-zinc-400">Hanya Admin boleh membuat cabutan.</p>
        )}
        <p className="text-[11px] text-zinc-400">Hasil cabutan disimpan sebagai draf. Anda boleh menukar pasukan antara sesi sebelum mengesahkan.</p>
      </section>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-2.5 text-left">
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-rose-600" : "bg-zinc-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="text-sm text-zinc-700">{label}</span>
    </button>
  );
}

// ── Draft: arrange by drag and drop, then confirm ─────────────────────────────

function DraftRound({ base, round, config, canConfig, act, pauseRef }: {
  base: string; round: Round; config: DuelConfig; canConfig: boolean; act: Act;
  pauseRef: React.MutableRefObject<boolean>;
}) {
  const fromServer = useMemo(() => round.sessions.map(s => s.entries.map(e => e.team)), [round]);
  const [local, setLocal] = useState<Team[][] | null>(null);
  const layout = local ?? fromServer;
  const [picked, setPicked] = useState<{ s: number; i: number } | null>(null);
  const [drag, setDrag] = useState<{ s: number; i: number } | null>(null);
  const [startAt, setStartAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(layout.flat().map(t => [t.id, { id: t.id, contingentId: t.contingentId, stateId: t.stateId }])), [layout]);
  const clashes = findClashes(layout.map(s => s.map(t => t.id)), byId, round);
  const clashIds = new Set(clashes.flatMap(c => c.teamIds));

  async function save(next: Team[][]) {
    setLocal(next);
    pauseRef.current = true;
    await act(`${base}/rounds/${round.id}`, "PATCH", { sessions: next.map(s => s.map(t => t.id)) });
    pauseRef.current = false;
    setLocal(null);
  }

  /** Swap two teams, or move a team to the end of another session (to = null index). */
  function move(from: { s: number; i: number }, to: { s: number; i: number | null }) {
    if (from.s === to.s && (to.i === null || from.i === to.i)) return;
    const next = layout.map(s => [...s]);
    if (to.i === null) {
      if (next[to.s].length >= config.perSession || next[from.s].length <= 1) return;
      const [t] = next[from.s].splice(from.i, 1);
      next[to.s].push(t);
    } else {
      [next[from.s][from.i], next[to.s][to.i]] = [next[to.s][to.i], next[from.s][from.i]];
    }
    save(next);
  }

  function tap(s: number, i: number | null) {
    if (!canConfig) return;
    if (!picked) { if (i !== null) setPicked({ s, i }); return; }
    move(picked, { s, i });
    setPicked(null);
  }

  async function redraw() {
    setBusy(true);
    await act(`${base}/rounds`, "POST", {
      groupKey: round.groupKey, split: round.split, noSameContingent: round.noSameContingent, noSameState: round.noSameState,
      teamIds: round.number === 1 ? layout.flat().map(t => t.id) : undefined,
    });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <p className="flex-1 text-sm text-amber-900">
          <b>Draf {roundName(round)}</b> · {layout.flat().length} pasukan dalam {layout.length} sesi.
          {canConfig && " Seret pasukan ke pasukan lain untuk bertukar, atau ke ruang kosong sesi untuk pindah. Di tablet: ketik satu pasukan, kemudian ketik sasaran."}
        </p>
        {canConfig && (
          <>
            <Button variant="outline" size="sm" onClick={redraw} disabled={busy} className="gap-1.5 bg-white">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />} Cabut semula
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDiscard(true)} className="gap-1.5 bg-white text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Buang draf
            </Button>
          </>
        )}
      </div>

      {clashes.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {clashes.length} pertembungan {round.noSameContingent && "kontinjen"}{round.noSameContingent && round.noSameState && "/"}{round.noSameState && "negeri"} sama — ditanda merah. Tukar pasukan untuk mengelaknya, atau sahkan juga.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {layout.map((teams, s) => (
          <div key={s}
            onDragOver={e => { if (drag) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); if (drag) move(drag, { s, i: null }); setDrag(null); }}
            className="relative rounded-2xl border bg-gradient-to-br from-violet-950 to-indigo-900 p-3 pt-6 text-white shadow-sm">
            <span className="absolute -top-3 left-3 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 px-3 py-0.5 text-xs font-bold text-violet-950 shadow">
              {round.isFinal ? "AKHIR" : `SESI ${round.sessions[s]?.label}`}
            </span>
            <span className="absolute right-3 top-1.5 text-[10px] text-white/50">{teams.length}/{config.perSession}</span>
            <div className="space-y-1.5">
              {teams.map((t, i) => {
                const isPicked = picked?.s === s && picked.i === i;
                return (
                  <div key={t.id}
                    draggable={canConfig}
                    onDragStart={() => { setDrag({ s, i }); pauseRef.current = true; }}
                    onDragEnd={() => { setDrag(null); pauseRef.current = false; }}
                    onDragOver={e => { if (drag) { e.preventDefault(); e.stopPropagation(); } }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag) move(drag, { s, i }); setDrag(null); }}
                    onClick={() => tap(s, i)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1.5 transition",
                      canConfig && "cursor-grab active:cursor-grabbing hover:bg-white/20",
                      clashIds.has(t.id) && "ring-2 ring-red-400",
                      isPicked && "ring-2 ring-cyan-300 bg-white/25",
                    )}>
                    <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingentName} className="h-7 w-7" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{t.name}</span>
                      <span className="block truncate text-[10px] text-white/60">{t.contingentName}{t.stateName ? ` · ${t.stateName}` : ""}</span>
                    </span>
                  </div>
                );
              })}
              {canConfig && teams.length < config.perSession && (
                <button type="button" onClick={() => tap(s, null)}
                  className={cn("w-full rounded-lg border border-dashed border-white/25 py-1.5 text-[11px] text-white/50", picked && "border-cyan-300 text-cyan-200")}>
                  {picked ? "Pindah ke sini" : "Ruang kosong"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canConfig && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-zinc-500">Masa mula (pilihan, untuk anggaran jadual)</span>
            <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="h-9 w-56" />
          </label>
          <p className="flex-1 text-xs text-zinc-500">
            Sesi diagih kepada {config.arenas} arena secara bergilir; setiap gelombang {clock(config.durationSec * 1000)} + rehat {clock(config.breakSec * 1000)}.
          </p>
          <Button onClick={() => setConfirming(true)} className="gap-2 bg-rose-600 hover:bg-rose-700">
            <Lock className="h-4 w-4" /> Sahkan & jadualkan
          </Button>
        </div>
      )}

      <ConfirmDialog open={confirming} onOpenChange={setConfirming}
        title={`Sahkan ${roundName(round)}?`}
        description="Susunan sesi akan dikunci dan arena serta masa dijadualkan. Sesi 1 pasukan (bye) terus selesai dan pasukan itu mara."
        confirmLabel="Sahkan"
        onConfirm={async () => {
          await act(`${base}/rounds/${round.id}/confirm`, "POST", { startAt: startAt ? new Date(startAt).toISOString() : null });
          setConfirming(false);
        }} />
      <ConfirmDialog open={discard} onOpenChange={setDiscard} destructive
        title="Buang draf cabutan?" confirmLabel="Buang"
        onConfirm={async () => { await act(`${base}/rounds/${round.id}`, "DELETE"); setDiscard(false); }} />
    </div>
  );
}

// ── Confirmed round: arena control panel ──────────────────────────────────────

function useNow(offset: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset, active]);
  return now;
}

function LiveRound({ base, round, config, offset, role, canConfig, canControl, act, isLast, onNext }: {
  base: string; round: Round; config: DuelConfig; offset: number; role: string;
  canConfig: boolean; canControl: boolean; act: Act; isLast: boolean; onNext: () => void;
}) {
  const running = round.sessions.some(s => s.status === "RUNNING");
  const now = useNow(offset, running);
  const [ranking, setRanking] = useState<Session | null>(null);
  const [reopen, setReopen] = useState(false);
  const playing = round.sessions.filter(s => s.arena > 0);
  const arenas = [...new Set(playing.map(s => s.arena))].sort((a, b) => a - b);
  const done = round.sessions.filter(s => s.status === "DONE").length;
  const started = round.sessions.some(s => s.startedAt);

  const current = (arena: number) => {
    const list = playing.filter(s => s.arena === arena).sort((a, b) => a.wave - b.wave || a.number - b.number);
    return list.find(s => ["RUNNING", "PAUSED", "ENDED"].includes(s.status)) ?? list.find(s => s.status === "PENDING") ?? null;
  };
  const control = (s: Session, action: string, extra?: object) => act(`${base}/sessions/${s.id}/control`, "POST", { action, ...extra });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
        <p className="flex-1 text-sm text-zinc-700">
          <b>{roundName(round)}</b> · {done}/{round.sessions.length} sesi selesai
          {round.startAt && <> · mula {timeOf(round.startAt)}</>}
        </p>
        {round.status === "DONE" && isLast && !round.isFinal && canConfig && (
          <Button size="sm" onClick={onNext} className="gap-1.5 bg-rose-600 hover:bg-rose-700"><Shuffle className="h-3.5 w-3.5" /> Cabut pusingan seterusnya</Button>
        )}
        {round.status === "DONE" && round.isFinal && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><Trophy className="h-4 w-4" /> Pertandingan selesai</span>
        )}
        {role === "SUPER_ADMIN" && !started && isLast && round.status === "CONFIRMED" && (
          <Button size="sm" variant="outline" onClick={() => setReopen(true)} className="gap-1.5"><LockOpen className="h-3.5 w-3.5" /> Buka semula draf</Button>
        )}
      </div>

      {round.status !== "DONE" && arenas.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {arenas.map(a => {
            const s = current(a);
            const ms = s ? remainingMs(s, config.durationSec, now) : 0;
            return (
              <div key={a} className="overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950 via-indigo-900 to-violet-800 text-white shadow-lg">
                <div className="flex items-center justify-between px-4 pt-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Arena {a}</span>
                  {s && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS[s.status]?.cls)}>{STATUS[s.status]?.label}</span>}
                </div>
                {!s ? (
                  <p className="px-4 py-10 text-center text-sm text-white/50">Tiada sesi lagi di arena ini.</p>
                ) : (
                  <div className="space-y-3 p-4">
                    <div className="flex items-end justify-between">
                      <p className="text-lg font-bold">{sessionName(round, s)}</p>
                      <p className={cn("font-mono text-5xl font-black tabular-nums",
                        s.status === "RUNNING" && ms <= 10_000 && "animate-pulse text-red-400",
                        s.status === "PAUSED" && "text-amber-300")}>
                        {clock(ms)}
                      </p>
                    </div>
                    {s.video && <WhepVideo url={s.video} className="aspect-video w-full rounded-lg" />}
                    <div className="space-y-1">
                      {s.entries.map(e => (
                        <div key={e.id} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1.5">
                          <TeamAvatar flagUrl={e.team.flagUrl} logoUrl={e.team.logoUrl} name={e.team.contingentName} className="h-7 w-7" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{e.team.name}</span>
                            <span className="block truncate text-[10px] text-white/60">{e.team.contingentName}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {canControl && (
                      <div className="flex flex-wrap gap-2">
                        {s.status === "PENDING" && <CtlBtn icon={Play} label="Mula" cls="bg-emerald-500 hover:bg-emerald-400" onClick={() => control(s, "start")} />}
                        {s.status === "RUNNING" && <CtlBtn icon={Pause} label="Jeda" cls="bg-amber-500 hover:bg-amber-400" onClick={() => control(s, "pause")} />}
                        {s.status === "PAUSED" && <CtlBtn icon={Play} label="Sambung" cls="bg-emerald-500 hover:bg-emerald-400" onClick={() => control(s, "resume")} />}
                        {(s.status === "RUNNING" || s.status === "PAUSED") && <CtlBtn icon={Square} label="Tamat" cls="bg-rose-500 hover:bg-rose-400" onClick={() => control(s, "end")} />}
                        {/* Also once the clock runs out: saving ranks ends the session too. */}
                        {(s.status === "ENDED" || ((s.status === "RUNNING" || s.status === "PAUSED") && ms <= 0)) && <CtlBtn icon={Flag} label="Beri kedudukan" cls="bg-cyan-500 text-violet-950 hover:bg-cyan-400" onClick={() => setRanking(s)} />}
                        {role === "SUPER_ADMIN" && s.status !== "PENDING" && (
                          <CtlBtn icon={RotateCcw} label="Set semula masa" cls="bg-white/15 hover:bg-white/25" onClick={() => control(s, "reset")} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="w-24 px-4 py-2 text-left">Sesi</th>
              <th className="w-24 px-4 py-2 text-left">Arena</th>
              <th className="w-20 px-4 py-2 text-left">Masa</th>
              <th className="px-4 py-2 text-left">Pasukan (kedudukan · mata)</th>
              <th className="w-36 px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {round.sessions.map(s => {
              const st = s.arena === 0 ? { label: "Bye", cls: "bg-sky-100 text-sky-700" } : STATUS[s.status] ?? STATUS.PENDING;
              const sorted = [...s.entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.slot - b.slot);
              return (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-2.5 font-semibold text-zinc-800">{sessionName(round, s)}</td>
                  <td className="px-4 py-2.5">
                    {s.arena === 0 ? "—" : s.status === "PENDING" && canControl ? (
                      <select value={s.arena} onChange={e => control(s, "arena", { arena: Number(e.target.value) })}
                        className="rounded border bg-white px-1.5 py-0.5 text-xs">
                        {Array.from({ length: Math.max(config.arenas, s.arena) }, (_, i) => i + 1).map(n => <option key={n} value={n}>Arena {n}</option>)}
                      </select>
                    ) : `Arena ${s.arena}`}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-500">{timeOf(s.scheduledAt) ?? `Gel. ${s.wave + 1}`}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map(e => (
                        <span key={e.id} className={cn("inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs",
                          e.advanced ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 text-zinc-700")}>
                          <TeamAvatar flagUrl={e.team.flagUrl} logoUrl={e.team.logoUrl} name={e.team.contingentName} className="h-5 w-5" />
                          {e.rank != null && <b>#{e.rank}</b>} {e.team.name}
                          {e.points != null && <span className="text-zinc-400">· {e.points}m</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", st.cls)}>{st.label}</span>
                    {s.video && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">● LIVE</span>}
                    {s.replayUrl && (
                      <a href={s.replayUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:underline">
                        <Play className="h-3 w-3" /> Tonton semula
                      </a>
                    )}
                    {canControl && s.arena > 0 && (s.status === "ENDED" || s.status === "DONE") && isLast && (
                      <button onClick={() => setRanking(s)} className="ml-2 text-[11px] text-violet-600 hover:underline">
                        {s.status === "DONE" ? "Ubah" : "Beri kedudukan"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {ranking && (
        <RankDialog key={ranking.id} session={ranking} round={round} advance={config.advance}
          onClose={() => setRanking(null)}
          onSave={async ranks => { const ok = await act(`${base}/sessions/${ranking.id}/ranks`, "POST", { ranks }); if (ok) setRanking(null); }} />
      )}
      <ConfirmDialog open={reopen} onOpenChange={setReopen}
        title="Buka semula sebagai draf?" description="Jadual arena dibuang dan susunan sesi boleh diubah semula."
        confirmLabel="Buka semula"
        onConfirm={async () => { await act(`${base}/rounds/${round.id}/confirm`, "DELETE"); setReopen(false); }} />
    </div>
  );
}

function CtlBtn({ icon: Icon, label, cls, onClick }: { icon: typeof Play; label: string; cls: string; onClick: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-60", cls)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  );
}

/** Tap teams in finishing order (1st first); tap again to undo. */
function RankDialog({ session, round, advance, onClose, onSave }: {
  session: Session; round: Round; advance: number; onClose: () => void; onSave: (ranks: Record<string, number>) => Promise<void>;
}) {
  const initial = session.entries.every(e => e.rank != null)
    ? [...session.entries].sort((a, b) => a.rank! - b.rank!).map(e => e.teamId) : [];
  const [order, setOrder] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const n = session.entries.length;
  const toggle = (id: string) => setOrder(o => (o.includes(id) ? o.slice(0, o.indexOf(id)) : [...o, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-lg font-bold text-zinc-900">Kedudukan · {sessionName(round, session)}</p>
          <p className="text-xs text-zinc-500">
            Ketik pasukan mengikut susunan tamat — pertama dahulu. Ketik semula untuk batal.
            {!round.isFinal && ` Kedudukan 1–${advance} mara ke pusingan seterusnya.`}
          </p>
        </div>
        <div className="space-y-2">
          {session.entries.map(e => {
            const pos = order.indexOf(e.teamId);
            const rank = pos + 1;
            return (
              <button key={e.id} type="button" onClick={() => toggle(e.teamId)}
                className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  pos >= 0 ? "border-violet-300 bg-violet-50" : "border-zinc-200 hover:bg-zinc-50")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black",
                  pos < 0 ? "bg-zinc-100 text-zinc-300" : rank === 1 ? "bg-amber-400 text-white" : "bg-violet-600 text-white")}>
                  {pos >= 0 ? rank : "–"}
                </span>
                <TeamAvatar flagUrl={e.team.flagUrl} logoUrl={e.team.logoUrl} name={e.team.contingentName} className="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-800">{e.team.name}</span>
                  <span className="block truncate text-[11px] text-zinc-400">{e.team.contingentName}</span>
                </span>
                {pos >= 0 && (
                  <span className="text-right text-[11px] leading-tight">
                    <b className="block text-zinc-700">{n - rank + 1} mata</b>
                    {!round.isFinal && rank <= advance && <span className="text-emerald-600">mara</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button className="text-xs text-zinc-500 hover:underline" onClick={() => setOrder([])}>Set semula</button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button disabled={order.length !== n || saving} className="gap-1.5 bg-rose-600 hover:bg-rose-700"
              onClick={async () => { setSaving(true); await onSave(Object.fromEntries(order.map((id, i) => [id, i + 1]))); setSaving(false); }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan kedudukan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Standings ────────────────────────────────────────────────────────────────

function Standings({ rounds, standings, finished }: { rounds: Round[]; standings: Standing[]; finished: boolean }) {
  const played = rounds.filter(r => r.status !== "DRAFT");
  if (standings.length === 0 || played.length === 0) {
    return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-zinc-400">Kedudukan dipaparkan selepas cabutan disahkan.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Clock className="h-3.5 w-3.5" />
        {finished ? "Kedudukan muktamad." : "Kedudukan sementara — dikemas kini setiap sesi diberi kedudukan."}
        {" "}Jumlah mata semua pusingan (pertama = n … terakhir = 1); seri dipecahkan oleh pusingan tertinggi dicapai, kemudian kedudukan di Akhir.
      </p>
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="w-14 px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Pasukan</th>
              {played.map(r => <th key={r.id} className="w-20 px-2 py-2 text-center">{r.isFinal ? "Akhir" : `P${r.number}`}</th>)}
              <th className="w-20 px-4 py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {standings.map(s => (
              <tr key={s.teamId} className={cn(finished && s.position <= 3 && "bg-amber-50/50")}>
                <td className="px-4 py-2.5">
                  <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    s.position === 1 ? "bg-amber-400 text-white" : s.position === 2 ? "bg-zinc-300 text-white" : s.position === 3 ? "bg-orange-300 text-white" : "bg-zinc-100 text-zinc-500")}>
                    {s.position}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <TeamAvatar flagUrl={s.team.flagUrl} logoUrl={s.team.logoUrl} name={s.team.contingentName} className="h-7 w-7" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-800">{s.team.name}</span>
                      <span className="block truncate text-[11px] text-zinc-400">{s.team.contingentName}</span>
                    </span>
                  </span>
                </td>
                {played.map(r => (
                  <td key={r.id} className="px-2 py-2.5 text-center font-mono text-zinc-600">{s.perRound[r.number] ?? (r.number <= s.reached ? "–" : "")}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono text-base font-bold text-zinc-900">{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
