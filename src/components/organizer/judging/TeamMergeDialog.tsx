"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GripVertical, Loader2, Lock, Plus, Trash2, Users, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TeamAvatar } from "@/components/duel/TeamAvatar";
import { autoMerge, mergeNames } from "@/lib/team-merge";
import { cn } from "@/lib/utils";

type Team = {
  id: string; name: string; contingentId: string; contingentName: string; logoUrl: string | null;
  stateId: string | null; stateName: string | null; flagUrl: string | null; attended: boolean;
};
type Group = { key: string; name: string; stateId: string | null; teamIds: string[]; custom: boolean };
type Data = { enabled: boolean; max: number; locked: boolean; lockReason: string | null; teams: Team[]; merges: { id: string; name: string; stateId: string | null; teamIds: string[] }[] };

const UNMERGED = "__none";
let seq = 0;
const newKey = () => `g${++seq}`;

/**
 * Names follow the state: "JOHOR" when the state has one merged team, else
 * "JOHOR A", "JOHOR B"… in card order. Renamed cards keep their own name.
 */
function autoName(groups: Group[], stateName: Map<string, string>): Group[] {
  const byState = new Map<string, Group[]>();
  for (const g of groups) if (g.stateId && !g.custom && g.teamIds.length) byState.set(g.stateId, [...(byState.get(g.stateId) ?? []), g]);
  const name = new Map<string, string>();
  for (const [sid, list] of byState) {
    const names = mergeNames(stateName.get(sid) ?? "", list.length);
    list.forEach((g, i) => name.set(g.key, names[i]));
  }
  return groups.map(g => (name.has(g.key) ? { ...g, name: name.get(g.key)! } : g));
}

/**
 * Merged state teams for a national competition (Skor or Duel): a state's
 * registered teams compete as one ("JOHOR A"). Starts from an automatic merge; teams are dragged between
 * cards (or tapped, then a card tapped) and the arrangement saved.
 */
export function TeamMergeDialog({ apiBase, competition, onClose, onSaved }: {
  apiBase: string; competition: { name: string; code: string }; onClose: () => void; onSaved: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiBase, { cache: "no-store" }).then(async res => {
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal memuatkan"); return; }
      const d = j as Data;
      setData(d);
      const names = new Map(d.teams.filter(t => t.stateId).map(t => [t.stateId!, t.stateName ?? ""]));
      if (d.merges.length) {
        const loaded = d.merges.map(m => ({ key: newKey(), name: m.name, stateId: m.stateId, teamIds: m.teamIds.filter(id => d.teams.some(t => t.id === id)), custom: false }));
        // A saved name that isn't the state's automatic one was typed by hand: keep it.
        const auto = autoName(loaded, names);
        setGroups(loaded.map((g, i) => ({ ...g, custom: auto[i].name !== g.name })));
      } else {
        setGroups(autoMerge(d.teams, d.max).map(g => ({ ...g, key: newKey(), custom: false })));
        setDirty(d.teams.length > 0);
      }
    }).catch(() => alive && setErr("Ralat rangkaian"));
    return () => { alive = false; };
  }, [apiBase]);

  const teamById = useMemo(() => new Map((data?.teams ?? []).map(t => [t.id, t])), [data]);
  const stateName = useMemo(() => new Map((data?.teams ?? []).filter(t => t.stateId).map(t => [t.stateId!, t.stateName ?? ""])), [data]);
  const assigned = new Set(groups.flatMap(g => g.teamIds));
  const unmerged = (data?.teams ?? []).filter(t => !assigned.has(t.id));
  const max = data?.max ?? 0;
  const readOnly = !data || data.locked;
  const overLimit = groups.filter(g => g.teamIds.length > max);

  function update(next: Group[]) {
    setGroups(autoName(next, stateName));
    setDirty(true);
    setMsg("");
  }

  function moveTo(teamId: string, target: string) {
    const from = groups.find(g => g.teamIds.includes(teamId))?.key ?? UNMERGED;
    if (from === target) return;
    // Over the limit is allowed while rearranging (e.g. mid-swap): the card turns red and saving waits.
    const team = teamById.get(teamId);
    update(groups.map(g => {
      if (g.key === from) return { ...g, teamIds: g.teamIds.filter(id => id !== teamId) };
      // An empty card takes the state of the first team dropped in.
      if (g.key === target) return { ...g, teamIds: [...g.teamIds, teamId], stateId: g.teamIds.length ? g.stateId : team?.stateId ?? null };
      return g;
    }));
  }

  /** Two teams trade places (cards or the unmerged list). */
  function swap(a: string, b: string) {
    if (a === b) return;
    const ga = groups.find(g => g.teamIds.includes(a))?.key ?? UNMERGED;
    const gb = groups.find(g => g.teamIds.includes(b))?.key ?? UNMERGED;
    if (ga === gb) return;
    update(groups.map(g => ({ ...g, teamIds: g.teamIds.map(id => (id === a ? b : id === b ? a : id)).filter(id => g.key === ga || g.key === gb || (id !== a && id !== b)) })));
  }

  function tapTarget(target: string) {
    if (readOnly || !picked) return;
    moveTo(picked, target);
    setPicked(null);
  }

  function runAuto() {
    if (!data) return;
    update(autoMerge(data.teams, data.max).map(g => ({ ...g, key: newKey(), custom: false })));
  }

  async function save() {
    setSaving(true); setErr("");
    const res = await fetch(apiBase, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: groups.filter(g => g.teamIds.length).map(g => ({ name: g.name, stateId: g.stateId, teamIds: g.teamIds })) }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(j.message ?? j.error ?? "Gagal menyimpan"); return; }
    setDirty(false);
    setMsg("Gabungan disimpan.");
    onSaved();
  }

  function close() {
    if (dirty && !readOnly && !window.confirm("Gabungan belum disimpan. Tutup juga?")) return;
    onClose();
  }

  const chip = (t: Team) => (
    <div key={t.id}
      draggable={!readOnly}
      onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setOver(`t:${t.id}`); }}
      onDragLeave={() => setOver(o => (o === `t:${t.id}` ? null : o))}
      onDrop={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) swap(id, t.id); }}
      onClick={e => {
        e.stopPropagation();
        if (readOnly) return;
        // A team picked, then another tapped: swap them (same card: pick the new one).
        if (picked && picked !== t.id && (groups.find(g => g.teamIds.includes(picked))?.key ?? UNMERGED) !== (groups.find(g => g.teamIds.includes(t.id))?.key ?? UNMERGED)) {
          swap(picked, t.id); setPicked(null);
        } else setPicked(p => (p === t.id ? null : t.id));
      }}
      className={cn("flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-left",
        !readOnly && "cursor-grab active:cursor-grabbing hover:border-violet-300",
        picked === t.id && "border-violet-500 ring-2 ring-violet-200",
        over === `t:${t.id}` && "border-violet-500 bg-violet-50")}>
      {!readOnly && <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
      <TeamAvatar flagUrl={t.flagUrl} logoUrl={t.logoUrl} name={t.contingentName} className="h-6 w-6" prefer="logo" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-zinc-800">{t.name}</span>
        <span className="block truncate text-[10px] text-zinc-400">{t.contingentName}</span>
      </span>
      <span title={t.attended ? "Hadir" : "Belum hadir"} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.attended ? "bg-emerald-500" : "bg-zinc-300")} />
    </div>
  );

  const dropProps = (key: string) => readOnly ? {} : {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(key); },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) moveTo(id, key); },
    onClick: () => tapTarget(key),
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-violet-600" /> Gabungan negeri · {competition.code} {competition.name}</DialogTitle>
          <DialogDescription>
            Pasukan dari negeri yang sama digabungkan menjadi satu pasukan permainan bernama negeri itu
            (cth. JOHOR; jika dipecah: JOHOR A, JOHOR B). Seret pasukan antara kad untuk menyusun semula — di tablet,
            ketik pasukan kemudian ketik kad sasaran. Lepaskan pasukan di atas pasukan lain untuk menukar tempat.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-400">{err || <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Memuatkan…</>}</p>
        ) : (
          <div className="space-y-3 px-6 pb-6 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">Maks {max} pasukan / gabungan</span>
              <span className="rounded-full border bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">{groups.filter(g => g.teamIds.length).length} gabungan · {data.teams.length} pasukan</span>
              {data.locked ? (
                <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600"><Lock className="h-3 w-3" /> Dikunci — {data.lockReason}</span>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => (groups.some(g => g.teamIds.length) ? setConfirmAuto(true) : runAuto())}>
                    <Wand2 className="h-3.5 w-3.5" /> Gabung automatik
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => update([...groups, { key: newKey(), name: "", stateId: null, teamIds: [], custom: false }])}>
                    <Plus className="h-3.5 w-3.5" /> Tambah gabungan
                  </Button>
                  <span className="flex-1" />
                  {dirty && <span className="text-[11px] font-medium text-amber-600">Belum disimpan</span>}
                  <Button size="sm" className="h-8 gap-1 bg-violet-600 hover:bg-violet-700" disabled={saving || !dirty || overLimit.length > 0} onClick={save}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Simpan gabungan
                  </Button>
                </>
              )}
            </div>
            {!data.locked && <p className="text-[11px] text-zinc-500">Gabungan dikunci sebaik sahaja markah pertama direkodkan atau cabutan duel disahkan. Menyimpan membuang draf cabutan duel yang belum disahkan.</p>}
            {overLimit.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" /> Melebihi {max} pasukan: {overLimit.map(g => g.name || "Tanpa nama").join(", ")} — pindahkan pasukan keluar sebelum menyimpan.
              </p>
            )}
            {(err || msg) && (
              <p className={cn("flex items-center gap-1.5 text-xs", err ? "text-red-600" : "text-zinc-600")}>
                {err && <AlertTriangle className="h-3.5 w-3.5" />} {err || msg}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map(g => {
                const full = g.teamIds.length >= max;
                const over_ = g.teamIds.length > max;
                const st = g.stateId ? data.teams.find(t => t.stateId === g.stateId) : undefined;
                return (
                  <div key={g.key} {...dropProps(g.key)}
                    className={cn("space-y-2 rounded-xl border bg-zinc-50 p-2.5 transition",
                      over_ && "border-red-400 bg-red-50 ring-1 ring-red-200",
                      over === g.key && !over_ && "border-violet-400 bg-violet-50",
                      picked && !readOnly && "cursor-pointer hover:border-violet-300")}>
                    <div className="flex items-center gap-2">
                      <TeamAvatar flagUrl={st?.flagUrl} name={g.name || "?"} className="h-7 w-7" prefer="flag" />
                      <Input value={g.name} disabled={readOnly} placeholder="Nama gabungan"
                        onClick={e => e.stopPropagation()}
                        onChange={e => update(groups.map(x => (x.key === g.key ? { ...x, name: e.target.value.toUpperCase(), custom: true } : x)))}
                        className="h-8 flex-1 bg-white text-sm font-bold tracking-wide" maxLength={60} />
                      <span className={cn("shrink-0 font-mono text-[11px]", over_ ? "font-bold text-red-600" : full ? "font-bold text-violet-700" : "text-zinc-400")}>{g.teamIds.length}/{max}</span>
                      {!readOnly && (
                        <button title="Buang gabungan (pasukan kembali tidak digabung)" onClick={e => { e.stopPropagation(); update(groups.filter(x => x.key !== g.key)); }}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    {g.custom && !readOnly && g.stateId && (
                      <button onClick={e => { e.stopPropagation(); update(groups.map(x => (x.key === g.key ? { ...x, custom: false } : x))); }}
                        className="text-[10px] text-violet-600 hover:underline">Guna nama negeri</button>
                    )}
                    <div className="min-h-10 space-y-1.5">
                      {g.teamIds.map(id => teamById.get(id)).filter((t): t is Team => !!t).map(chip)}
                      {g.teamIds.length === 0 && <p className="rounded-lg border border-dashed py-3 text-center text-[11px] text-zinc-400">Seret pasukan ke sini</p>}
                    </div>
                  </div>
                );
              })}
              <div {...dropProps(UNMERGED)}
                className={cn("space-y-2 rounded-xl border border-dashed p-2.5 transition", over === UNMERGED && "border-violet-400 bg-violet-50",
                  picked && !readOnly && "cursor-pointer")}>
                <p className="text-xs font-semibold text-zinc-600">Tidak digabung <span className="font-normal text-zinc-400">— bermain sebagai pasukan sendiri ({unmerged.length})</span></p>
                <div className="min-h-10 space-y-1.5">
                  {unmerged.map(chip)}
                  {unmerged.length === 0 && <p className="py-3 text-center text-[11px] text-zinc-400">Semua pasukan sudah digabung.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog open={confirmAuto} onOpenChange={setConfirmAuto}
          title="Gabung semula secara automatik?" description="Susunan semasa akan diganti dengan gabungan automatik mengikut negeri."
          confirmLabel="Gabung automatik" onConfirm={() => { runAuto(); setConfirmAuto(false); }} />
      </DialogContent>
    </Dialog>
  );
}
