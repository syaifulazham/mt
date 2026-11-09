"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, Loader2, CheckCircle2, Users, Plus, X, AlertCircle, AlertTriangle, XCircle,
} from "lucide-react";
import type { SlotScheduleConfig } from "@/lib/walkin-slots";
import { CounterSlotPicker, type SessionSlots, type SlotChoice } from "./CounterSlotPicker";

/* Team competitions at the walk-in counter: pending team entries, existing
   teams and on-the-spot new teams. Server: /api/v2/walkin/[slug]/teams. */

const B = { navy: "#085782", purple: "#8573b0", gold: "#f2dc0c" };

type Member = { id?: string; name: string; ic: string | null };
type SubHit = {
  id: string; teamName: string; schoolName: string | null; source: "BORANG" | "PORTAL";
  sessionNumber: number | null; slotNumber: number | null; members: Member[];
};
type TeamHit = {
  id: string; name: string; contingentName: string; members: Member[];
  registration: {
    id: string; status: string; sessionNumber: number | null; slotNumber: number | null;
    vibeBlocksToken: string | null;
  } | null;
};
type Preview = {
  contingent: { id: string; name: string };
  teamName: string;
  members: { ic: string; name: string; status: "MATCHED" | "NOT_FOUND" | "OTHER_CONTINGENT"; otherContingentName?: string }[];
  outcome: "LINK_EXISTING" | "CREATE_TEAM";
  existingTeam: { id: string; name: string } | null;
  finalMembers: { id: string; name: string }[];
  error: { code: string; detail?: string } | null;
};
export type TeamRegResult = {
  registrationId: string; teamName: string; contingentName: string;
  members: string[]; sessionNumber: number | null; slotNumber: number | null;
  vibeBlocksToken: string | null;
  gameName: string | null;
};
type Selection =
  | { kind: "sub"; sub: SubHit }
  | { kind: "team"; team: TeamHit }
  | { kind: "new" };

function errorText(code: string, detail?: string): string {
  const d = detail ? ` (${detail})` : "";
  switch (code) {
    case "SLOT_TAKEN":              return "Slot baru sahaja ditempah. Sila pilih slot lain.";
    case "SLOT_REQUIRED":           return "Sila pilih sesi dan slot.";
    case "DATE_REQUIRED":           return "Sila pilih tarikh.";
    case "SLOTS_FULL":              return "Pertandingan ini sudah penuh.";
    case "ALREADY_REGISTERED":      return `Ahli/pasukan sudah berdaftar untuk pertandingan ini${d}.`;
    case "UNIQUE_PARTICIPATION":    return `Ahli sudah berdaftar untuk pertandingan walk-in lain dalam acara ini${d}.`;
    case "ALREADY_PROCESSED":       return "Penyertaan ini telah diproses.";
    case "TEAM_ALREADY_REGISTERED": return "Pasukan ini sudah berdaftar untuk pertandingan walk-in ini.";
    case "TEAM_TOO_SMALL":          return `Ahli yang dijumpai tidak mencukupi saiz minimum pasukan${d}.`;
    case "TEAM_FULL":               return "Bilangan ahli melebihi saiz maksimum pasukan.";
    case "TEAM_SIZE":               return `Bilangan ahli mesti ${detail ?? "mengikut saiz pasukan"}.`;
    case "MEMBER_NOT_ELIGIBLE":     return `Ahli tidak menepati kumpulan sasaran pertandingan${d}.`;
    case "PARTICIPANT_IN_SAME_EVENT": return `Ahli sudah menyertai pertandingan lain dalam acara ini${d}.`;
    case "MEMBER_NOT_IN_CONTINGENT":
    case "MIXED_CONTINGENT":        return "Semua ahli mesti daripada kontinjen yang sama.";
    case "MEMBER_NOT_FOUND":        return `IC tiada dalam rekod peserta${d}. Peserta perlu mendaftar dahulu.`;
    case "NO_MEMBER_FOUND":         return "Tiada ahli pasukan ini dijumpai dalam rekod peserta.";
    case "EXISTING_TEAM_EMPTY":     return "Pasukan sedia ada tidak mempunyai ahli.";
    case "DUPLICATE_MEMBER_IC":     return "IC ahli berulang.";
    case "INVALID_MEMBERS":         return `IC tidak sah${d}.`;
    case "INVALID_TEAM_NAME":       return "Nama pasukan terlalu pendek.";
    case "DUPLICATE_SUBMISSION":    return "Ahli sudah mempunyai penyertaan dalam pertandingan ini — cari nama atau IC ahli untuk melihatnya.";
    default:                        return code || "Gagal mendaftar.";
  }
}

const card = { background: "rgba(255,255,255,.05)", backdropFilter: "blur(12px)" };
const muted = { color: "rgba(255,255,255,.45)" };

function MemberList({ members }: { members: Member[] }) {
  return (
    <ol className="text-[11px] space-y-0.5 list-decimal list-inside" style={{ color: "rgba(255,255,255,.7)" }}>
      {members.map((m, i) => (
        <li key={m.id ?? `${m.ic}-${i}`}>
          {m.name}{m.ic && <span className="font-mono ml-1.5" style={{ color: "rgba(255,255,255,.35)" }}>{m.ic}</span>}
        </li>
      ))}
    </ol>
  );
}

function SlotChip({ s, n }: { s: number | null; n: number | null }) {
  if (s == null) return null;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: "rgba(242,220,12,.15)", color: B.gold, border: "1px solid rgba(242,220,12,.3)" }}>
      Sesi {s} · Slot {n}
    </span>
  );
}

const primaryBtn = "w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-60";
const primaryStyle = { background: `linear-gradient(90deg, ${B.navy}, ${B.purple})`, color: "white" };

export function CounterTeamPanel({
  slug, passcode, competitionId, cfg, sessions, slotsLoading, minSize, maxSize, onRegistered, gameName,
  slotDates, slotDate, onSlotDate,
}: {
  slug: string; passcode: string; competitionId: string; gameName?: string | null;
  cfg: SlotScheduleConfig | null; sessions: SessionSlots[] | null; slotsLoading: boolean;
  slotDates: string[]; slotDate: string | null; onSlotDate: (d: string | null) => void;
  minSize: number; maxSize: number;
  onRegistered: (r: TeamRegResult) => void;
}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [subs, setSubs] = useState<SubHit[]>([]);
  const [teams, setTeams] = useState<TeamHit[]>([]);
  const [sel, setSel] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [slot, setSlot] = useState<SlotChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");
  const [newIcs, setNewIcs] = useState<string[]>(() => Array(Math.max(1, minSize)).fill(""));
  const searchSeq = useRef(0);

  const base = { passcode, competitionId };

  async function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setSubs([]); setTeams([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const sp = new URLSearchParams({ ...base, q: value.trim() });
    const j = await fetch(`/api/v2/walkin/${slug}/teams?${sp}`).then(r => r.json()).catch(() => ({}));
    if (seq !== searchSeq.current) return; // a newer search is in flight
    setSubs(j.data?.submissions ?? []); setTeams(j.data?.teams ?? []);
    setSearching(false);
  }

  function choose(s: Selection) {
    setSel(s); setErr(""); setSlot(null); setPreview(null);
  }

  // Preview what verifying a pending entry would do.
  const subId = sel?.kind === "sub" ? sel.sub.id : null;
  useEffect(() => {
    if (!subId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewLoading(true);
    const sp = new URLSearchParams({ passcode, competitionId, submissionId: subId });
    fetch(`/api/v2/walkin/${slug}/teams?${sp}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (j.data) setPreview(j.data); else setErr(errorText(j.error, j.detail));
      })
      .catch(() => { if (!cancelled) setErr("Ralat memuatkan semakan."); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [subId, slug, passcode, competitionId]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/v2/walkin/${slug}/teams`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(errorText(j.error, j.detail)); return; }
    onRegistered(j.data as TeamRegResult);
    setSel(null); setPreview(null); setSlot(null); setQ(""); setSubs([]); setTeams([]);
    setNewName(""); setNewIcs(Array(Math.max(1, minSize)).fill(""));
  }

  const slotOk = !cfg || (!!slot && !slotsLoading && !!sessions && (slotDates.length === 0 || slot.slotDate === slotDate));
  const picker = cfg && (
    <CounterSlotPicker cfg={cfg} sessions={sessions} loading={slotsLoading}
      choice={slot} onChoose={setSlot} disabled={busy}
      dates={slotDates} date={slotDate} onDate={(d) => { setSlot(null); onSlotDate(d); }} />
  );

  /* ── Right column ── */
  let detail: React.ReactNode;
  if (!sel) {
    detail = (
      <div className="hidden md:flex rounded-2xl border border-dashed p-10 items-center justify-center text-center min-h-44"
        style={{ borderColor: "rgba(255,255,255,.15)" }}>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.3)" }}>
          Pilih penyertaan atau pasukan daripada senarai carian,<br />atau daftar pasukan baharu.
        </p>
      </div>
    );
  } else if (sel.kind === "sub") {
    const s = sel.sub;
    detail = (
      <div className="rounded-2xl p-4 space-y-3 border" style={{ background: "rgba(242,220,12,.05)", borderColor: "rgba(242,220,12,.3)" }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: B.gold }}>
              Sahkan penyertaan {s.source === "PORTAL" ? "portal" : "borang"}
            </p>
            <p className="text-base font-bold text-white">{s.teamName}</p>
          </div>
          <SlotChip s={s.sessionNumber} n={s.slotNumber} />
        </div>
        {previewLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs" style={muted}>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: B.gold }} /> Menyemak ahli…
          </div>
        ) : preview && (
          <>
            <p className="text-xs" style={muted}>Kontinjen: <strong className="text-white/85">{preview.contingent.name}</strong></p>
            <ul className="space-y-1">
              {preview.members.map(m => (
                <li key={m.ic} className="flex items-start gap-2 text-[11px]">
                  {m.status === "MATCHED"
                    ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0 text-emerald-400" />
                    : m.status === "OTHER_CONTINGENT"
                      ? <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0 text-amber-400" />
                      : <XCircle className="h-3.5 w-3.5 mt-px shrink-0 text-red-400" />}
                  <span className="text-white/80">
                    {m.name}
                    <span className="block" style={{ color: "rgba(255,255,255,.35)" }}>
                      {m.status === "MATCHED" ? "Dijumpai"
                        : m.status === "OTHER_CONTINGENT" ? `Kontinjen lain (${m.otherContingentName}) — digugurkan`
                        : "Tiada dalam rekod — digugurkan"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] rounded-lg px-3 py-2"
              style={{ background: "rgba(8,87,130,.25)", color: "#7dd3fc", border: `1px solid ${B.navy}80` }}>
              {preview.outcome === "LINK_EXISTING"
                ? <>Pasukan <strong>{preview.existingTeam?.name}</strong> sudah wujud dalam kontinjen ini — pasukan itu akan didaftarkan ({preview.finalMembers.length} ahli).</>
                : <>Pasukan baharu akan dicipta dengan {preview.finalMembers.length} ahli yang dijumpai.</>}
            </p>
            {preview.error && <p className="text-xs text-red-400">{errorText(preview.error.code, preview.error.detail)}</p>}
          </>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="button" onClick={() => post({ action: "confirm_submission", submissionId: s.id })}
          disabled={busy || previewLoading || !preview || !!preview.error}
          className={primaryBtn} style={primaryStyle}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sahkan &amp; Daftar
        </button>
      </div>
    );
  } else if (sel.kind === "team") {
    const t = sel.team;
    const reg = t.registration;
    detail = (
      <div className="rounded-2xl p-4 space-y-3 border" style={{ background: "rgba(8,87,130,.2)", borderColor: `${B.navy}60` }}>
        <div>
          <p className="text-base font-bold text-white">{t.name}</p>
          <p className="text-xs" style={muted}>{t.contingentName}</p>
        </div>
        <MemberList members={t.members} />
        {reg ? (
          <div className="space-y-2 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(16,185,129,.15)", color: "#34d399", border: "1px solid rgba(16,185,129,.3)" }}>
                {reg.status === "CONFIRMED" ? "Sudah berdaftar" : "Pre-daftar"}
              </span>
              <SlotChip s={reg.sessionNumber} n={reg.slotNumber} />
            </div>
            {reg.vibeBlocksToken && (
              <div className="rounded-xl px-4 py-3 border text-center"
                style={{ background: "rgba(5,150,105,.15)", borderColor: "rgba(16,185,129,.4)" }}>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "#6ee7b7" }}>{gameName ?? "VibeBlocks"} Token</p>
                <p className="text-xl font-extrabold font-mono tracking-[0.3em] text-white">{reg.vibeBlocksToken}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {picker}
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button type="button" onClick={() => post({ action: "register_team", teamId: t.id, ...(slot ?? {}) })}
              disabled={busy || !slotOk} className={primaryBtn} style={primaryStyle}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Daftar Pasukan
            </button>
          </>
        )}
      </div>
    );
  } else {
    const filled = newIcs.filter(v => v.replace(/[\s-]/g, "")).length;
    detail = (
      <div className="rounded-2xl p-4 space-y-3 border" style={{ background: "rgba(8,87,130,.2)", borderColor: `${B.navy}60` }}>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: B.gold }}>Pasukan baharu</p>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama pasukan"
          className="w-full h-10 rounded-xl px-3 text-sm text-white placeholder-white/25 focus:outline-none"
          style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }} />
        <div className="space-y-1.5">
          <p className="text-[11px]" style={muted}>
            IC ahli ({minSize === maxSize ? minSize : `${minSize}–${maxSize}`} orang, satu kontinjen). Ahli mesti sudah berdaftar sebagai peserta.
          </p>
          {newIcs.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-5 text-[11px] text-right" style={muted}>{i + 1}.</span>
              <input value={v} inputMode="numeric" placeholder="No. IC"
                onChange={e => setNewIcs(a => a.map((x, j) => (j === i ? e.target.value : x)))}
                className="flex-1 h-9 rounded-lg px-3 text-sm font-mono text-white placeholder-white/25 focus:outline-none"
                style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }} />
              {newIcs.length > minSize && (
                <button type="button" title="Buang ahli" onClick={() => setNewIcs(a => a.filter((_, j) => j !== i))}
                  className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ color: "rgba(255,255,255,.4)" }}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {newIcs.length < maxSize && (
            <button type="button" onClick={() => setNewIcs(a => [...a, ""])}
              className="text-[11px] font-semibold flex items-center gap-1 pl-6" style={{ color: "#7dd3fc" }}>
              <Plus className="h-3.5 w-3.5" /> Tambah ahli
            </button>
          )}
        </div>
        {picker}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button type="button"
          onClick={() => post({ action: "new_team", teamName: newName, ics: newIcs.filter(v => v.trim()), ...(slot ?? {}) })}
          disabled={busy || !slotOk || newName.trim().length < 2 || filled < minSize}
          className={primaryBtn} style={primaryStyle}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Daftar Pasukan
        </button>
      </div>
    );
  }

  /* ── Left column ── */
  const searched = q.trim().length >= 2;
  return (
    <div className="grid gap-4 md:grid-cols-2 items-start">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "rgba(255,255,255,.3)" }} />
          <input value={q} onChange={e => search(e.target.value)}
            placeholder="Cari pasukan (nama pasukan, nama atau IC ahli)…"
            className="w-full h-11 rounded-xl pl-10 pr-10 text-sm text-white placeholder-white/25 focus:outline-none"
            style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }} />
          {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{ color: "rgba(255,255,255,.4)" }} />}
        </div>

        <button type="button" onClick={() => choose({ kind: "new" })}
          className="w-full rounded-xl border border-dashed py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          style={sel?.kind === "new"
            ? { borderColor: B.gold, color: B.gold, background: "rgba(242,220,12,.06)" }
            : { borderColor: "rgba(255,255,255,.2)", color: "rgba(255,255,255,.6)" }}>
          <Plus className="h-3.5 w-3.5" /> Daftar pasukan baharu
        </button>

        {subs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: B.gold }}>Menunggu pengesahan</p>
            {subs.map(s => (
              <button key={s.id} type="button" onClick={() => choose({ kind: "sub", sub: s })}
                className="w-full text-left rounded-2xl border p-3.5 space-y-1.5 transition-colors"
                style={{
                  background: sel?.kind === "sub" && sel.sub.id === s.id ? "rgba(242,220,12,.12)" : "rgba(242,220,12,.05)",
                  borderColor: "rgba(242,220,12,.35)",
                }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white truncate">{s.teamName}</p>
                  <SlotChip s={s.sessionNumber} n={s.slotNumber} />
                </div>
                <p className="text-[10px]" style={muted}>
                  {s.source === "PORTAL" ? "Portal peserta" : "Borang awam"}{s.schoolName && <> · {s.schoolName}</>}
                </p>
                <MemberList members={s.members} />
              </button>
            ))}
          </div>
        )}

        {teams.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,.5)" }}>Pasukan</p>
            <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/10" style={card}>
              {teams.map(t => (
                <button key={t.id} type="button" onClick={() => choose({ kind: "team", team: t })}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                  style={sel?.kind === "team" && sel.team.id === t.id ? { background: `${B.navy}40` } : {}}>
                  <Users className="h-4 w-4 shrink-0" style={{ color: "#c4b5fd" }} />
                  <div className={`flex-1 min-w-0 ${t.registration ? "opacity-60" : ""}`}>
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,.4)" }}>
                      {t.contingentName} · {t.members.map(m => m.name.split(" ")[0]).join(", ")}
                    </p>
                  </div>
                  {t.registration && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: "rgba(22,163,74,.2)", color: "#4ade80", border: "1px solid rgba(22,163,74,.3)" }}>
                      Terdaftar
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {searched && !searching && subs.length === 0 && teams.length === 0 && (
          <p className="flex items-center justify-center gap-1.5 text-xs py-6" style={{ color: "rgba(255,255,255,.3)" }}>
            <AlertCircle className="h-3.5 w-3.5" /> Tiada padanan. Gunakan &quot;Daftar pasukan baharu&quot;.
          </p>
        )}
        {!searched && (
          <p className="text-center text-xs py-6" style={{ color: "rgba(255,255,255,.25)" }}>
            Taip nama pasukan, atau nama/IC ahli untuk mencari.
          </p>
        )}
      </div>

      <div className="md:sticky md:top-4">{detail}</div>
    </div>
  );
}
