"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Vote, Plus, Trash2, Loader2, Copy, Check, ExternalLink, QrCode, Pencil, ChevronDown, ChevronRight,
  Lock, LockOpen, Eye, EyeOff, Link2, X, Users, ArrowDownWideNarrow, Globe,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// "Undian Awam" on a Penghakiman competition card: public voting sessions with
// entries (a team's article, video, site…) and their links, a score range, and
// a public /vote/<slug> link. Tallies refresh while the panel is open.

type VLink = { label: string; url: string };
type Entry = {
  id: string; teamId: string | null; title: string; subtitle: string | null; links: VLink[];
  sortOrder: number; votes: number; total: number; average: number | null;
};
type Session = {
  id: string; routeSlug: string; label: string; description: string | null;
  minScore: number; maxScore: number; status: "ACTIVE" | "CLOSED"; showResults: boolean;
  voters: number; entries: Entry[];
};
type Team = { id: string; name: string; contingentName: string; stateName: string | null };
type WcProject = { id: string; name: string; url: string; updatedAt: string | null };
/** WebCraft-integrated competitions: each team's published projects, fetched once on demand. */
type Wc = {
  projects: Record<string, WcProject[]> | null; loading: boolean; error: string;
  load: () => Promise<void>;
};

const POLL_MS = 10_000;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Gagal");
  return j;
}

export function VotingPanel({ eventId, ecId, canWrite }: { eventId: string; ecId: string; canWrite: boolean }) {
  const base = `/api/v2/organizer/events/${eventId}/competitions/${ecId}/voting`;
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [creating, setCreating] = useState(false);
  const [webcraft, setWebcraft] = useState(false);
  const [wcProjects, setWcProjects] = useState<Record<string, WcProject[]> | null>(null);
  const [wcLoading, setWcLoading] = useState(false);
  const [wcError, setWcError] = useState("");

  const loadWc = useCallback(async () => {
    setWcLoading(true); setWcError("");
    try { setWcProjects((await call(`${base}/webcraft`, "GET")).projects); }
    catch (e) { setWcError(e instanceof Error ? e.message : "Gagal"); }
    finally { setWcLoading(false); }
  }, [base]);
  const wc: Wc | null = webcraft ? { projects: wcProjects, loading: wcLoading, error: wcError, load: loadWc } : null;

  const load = useCallback(async () => {
    try {
      const j = await call(base, "GET");
      setSessions(j.sessions); setTeams(j.teams); setWebcraft(!!j.webcraft);
    } catch { /* next poll retries */ }
  }, [base]);

  // Count shows on the collapsed header, so read once up front; poll only while open.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  const count = sessions?.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 bg-teal-50/50">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 text-teal-500" /> : <ChevronRight className="h-4 w-4 text-teal-500" />}
          <Vote className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-teal-800">Undian Awam</span>
          <span className="text-[11px] text-zinc-400">{sessions === null ? "…" : count === 0 ? "tiada sesi" : `${count} sesi`}</span>
        </button>
        {canWrite && (
          <Button size="sm" variant="outline" className="h-7 gap-1 border-teal-200 text-xs text-teal-700 hover:bg-teal-50"
            onClick={() => { setOpen(true); setCreating(true); }}>
            <Plus className="h-3 w-3" /> Sesi undian
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 px-5 py-4">
          {sessions === null && <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-300" />}
          {sessions?.length === 0 && (
            <p className="text-center text-xs text-zinc-400">
              Tiada sesi undian. Cipta sesi untuk membenarkan orang awam menilai pautan (artikel, video, laman) setiap peserta.
            </p>
          )}
          {sessions?.map(s => (
            <SessionCard key={s.id} s={s} base={base} teams={teams} wc={wc} canWrite={canWrite} reload={load} />
          ))}
        </div>
      )}

      {creating && (
        <SessionDialog
          teamCount={teams.length}
          onClose={() => setCreating(false)}
          onSave={async v => { await call(base, "POST", v); await load(); }}
        />
      )}
    </div>
  );
}

// ── Session ───────────────────────────────────────────────────────────────────

function SessionCard({ s, base, teams, wc, canWrite, reload }: {
  s: Session; base: string; teams: Team[]; wc: Wc | null; canWrite: boolean; reload: () => Promise<void>;
}) {
  const url = typeof window === "undefined" ? `/vote/${s.routeSlug}` : `${window.location.origin}/vote/${s.routeSlug}`;
  const sUrl = `${base}/${s.id}`;
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [entryDlg, setEntryDlg] = useState<Entry | "new" | null>(null);
  const [byScore, setByScore] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setErr("");
    try { await fn(); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(""); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  }

  const ballots = s.entries.reduce((n, e) => n + e.votes, 0);
  const rows = byScore
    ? [...s.entries].sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || b.votes - a.votes)
    : s.entries;
  const used = new Set(s.entries.map(e => e.teamId).filter(Boolean));
  const missing = teams.filter(t => !used.has(t.id));

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-start gap-3 bg-zinc-50/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-800">
            {s.label}
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold",
              s.status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-100 text-zinc-500")}>
              {s.status === "ACTIVE" ? "DIBUKA" : "DITUTUP"}
            </span>
            <span className="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] text-teal-700">Skor {s.minScore}–{s.maxScore}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {s.entries.length} penyertaan · {ballots} undian · {s.voters} pengundi
            {s.showResults && <> · <span className="text-teal-700">keputusan dipapar kepada awam</span></>}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="truncate rounded bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 border">{url}</code>
            <button onClick={copy} title="Salin pautan" className="text-zinc-400 hover:text-zinc-700">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Buka" className="text-zinc-400 hover:text-zinc-700"><ExternalLink className="h-3.5 w-3.5" /></a>
            <button onClick={() => setQr(true)} title="Kod QR" className="text-zinc-400 hover:text-zinc-700"><QrCode className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy}
              onClick={() => act("status", () => call(sUrl, "PATCH", { status: s.status === "ACTIVE" ? "CLOSED" : "ACTIVE" }))}>
              {busy === "status" ? <Loader2 className="h-3 w-3 animate-spin" /> : s.status === "ACTIVE" ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
              {s.status === "ACTIVE" ? "Tutup" : "Buka"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy}
              title="Papar purata dan bilangan undian di halaman awam"
              onClick={() => act("results", () => call(sUrl, "PATCH", { showResults: !s.showResults }))}>
              {s.showResults ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {s.showResults ? "Sorok keputusan" : "Papar keputusan"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Sunting sesi" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" title="Padam sesi" disabled={!!busy}
              onClick={() => { if (confirm(`Padam sesi "${s.label}" berserta ${s.entries.length} penyertaan dan ${ballots} undian?`)) act("del", () => call(sUrl, "DELETE")); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {err && <p className="border-t px-4 py-2 text-xs text-red-600">{err}</p>}
      {note && !err && <p className="border-t px-4 py-2 text-xs text-sky-700">{note}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
        <button onClick={() => setByScore(v => !v)}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            byScore ? "border-teal-300 bg-teal-50 text-teal-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50")}>
          <ArrowDownWideNarrow className="h-3 w-3" /> Susun ikut purata
        </button>
        {canWrite && (
          <div className="ml-auto flex items-center gap-1.5">
            {wc && (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-sky-200 text-xs text-sky-700 hover:bg-sky-50" disabled={!!busy}
                title="Isi pautan setiap pasukan yang belum berpautan dengan projek WebCraft terbitan terkini"
                onClick={() => act("wc", async () => {
                  setNote("");
                  const r = await call(`${sUrl}/webcraft-fill`, "POST");
                  setNote(`${r.filled} penyertaan diisi daripada WebCraft${r.noProject ? ` · ${r.noProject} pasukan tiada projek diterbitkan` : ""}.`);
                })}>
                {busy === "wc" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                Isi pautan WebCraft
              </Button>
            )}
            {missing.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy}
                title={missing.map(t => t.name).join(", ")}
                onClick={() => act("teams", () => call(`${sUrl}/entries`, "POST", {
                  entries: missing.map(t => ({ teamId: t.id, title: t.name, subtitle: t.contingentName })),
                }))}>
                {busy === "teams" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
                Tambah {missing.length} pasukan
              </Button>
            )}
            <Button size="sm" className="h-7 gap-1 bg-teal-600 text-xs text-white hover:bg-teal-700" onClick={() => setEntryDlg("new")}>
              <Plus className="h-3 w-3" /> Penyertaan
            </Button>
          </div>
        )}
      </div>

      {s.entries.length === 0 ? (
        <p className="border-t px-4 py-4 text-center text-xs italic text-zinc-400">Tiada penyertaan lagi.</p>
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50/40 text-xs text-zinc-500">
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Penyertaan</th>
                <th className="px-3 py-2 text-left font-medium">Pautan</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Undian</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Jumlah</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Purata</th>
                {canWrite && <th className="w-16 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 text-xs text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-zinc-800">{e.title}</p>
                    {e.subtitle && <p className="text-xs text-zinc-400">{e.subtitle}</p>}
                  </td>
                  <td className="px-3 py-2">
                    {e.links.length === 0
                      ? <span className="text-xs italic text-amber-600" title="Penyertaan tanpa pautan tidak dipapar di halaman undian">tiada pautan · tidak dipapar</span>
                      : <div className="flex flex-col gap-0.5">
                          {e.links.map((l, k) => (
                            <a key={k} href={l.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex max-w-64 items-center gap-1 truncate text-xs text-teal-700 hover:underline" title={l.url}>
                              <Link2 className="h-3 w-3 shrink-0" /> {l.label}
                            </a>
                          ))}
                        </div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.votes}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{e.total}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-teal-700">{e.average ?? "–"}</td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className="mr-2 text-zinc-400 hover:text-zinc-700" title="Sunting" onClick={() => setEntryDlg(e)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className="text-zinc-400 hover:text-red-600" title="Padam"
                        onClick={() => { if (confirm(`Padam "${e.title}"${e.votes ? ` dan ${e.votes} undiannya` : ""}?`)) act("e" + e.id, () => call(`${sUrl}/entries/${e.id}`, "DELETE")); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SessionDialog
          initial={s} locked={ballots > 0}
          onClose={() => setEditing(false)}
          onSave={async v => { await call(sUrl, "PATCH", v); await reload(); }}
        />
      )}
      {entryDlg && (
        <EntryDialog
          entry={entryDlg === "new" ? null : entryDlg}
          teams={missing}
          wc={wc}
          onClose={() => setEntryDlg(null)}
          onSave={async v => {
            if (entryDlg === "new") await call(`${sUrl}/entries`, "POST", { entries: [v] });
            else await call(`${sUrl}/entries/${entryDlg.id}`, "PATCH", v);
            await reload();
          }}
        />
      )}
      {qr && (
        <Dialog open onOpenChange={o => { if (!o) setQr(false); }}>
          <DialogContent className="max-w-sm space-y-4 px-6 pb-6 text-center">
            <DialogHeader className="px-0 text-left"><DialogTitle>{s.label}</DialogTitle></DialogHeader>
            <div className="flex justify-center rounded-xl border bg-white p-4"><QRCodeSVG value={url} size={256} level="M" marginSize={1} /></div>
            <p className="break-all font-mono text-[11px] text-zinc-500">{url}</p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

type SessionValues = { label: string; description: string; minScore: number; maxScore: number; showResults: boolean; addAllTeams?: boolean };

function SessionDialog({ initial, locked = false, teamCount, onClose, onSave }: {
  initial?: Session; locked?: boolean; teamCount?: number;
  onClose: () => void; onSave: (v: SessionValues) => Promise<void>;
}) {
  const [label, setLabel] = useState(initial?.label ?? "Undian Awam");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [minScore, setMin] = useState(String(initial?.minScore ?? 1));
  const [maxScore, setMax] = useState(String(initial?.maxScore ?? 5));
  const [showResults, setShowResults] = useState(initial?.showResults ?? false);
  const [addAllTeams, setAddAll] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr("");
    try {
      await onSave({
        label, description, minScore: Number(minScore), maxScore: Number(maxScore), showResults,
        ...(!initial && { addAllTeams: addAllTeams && !!teamCount }),
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-teal-700"><Vote className="h-4 w-4" /> {initial ? "Sunting sesi undian" : "Sesi undian baharu"}</DialogTitle></DialogHeader>
        <div className="space-y-4 px-4 py-2">
          <div>
            <Label className="text-xs">Nama sesi</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} className="mt-1 h-8 text-sm" placeholder="cth. Undian Artikel Terbaik" />
          </div>
          <div>
            <Label className="text-xs">Arahan kepada pengundi (pilihan)</Label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
              placeholder="cth. Baca setiap artikel dan beri skor berdasarkan kreativiti dan kejelasan." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Skor minimum</Label>
              <Input type="number" value={minScore} onChange={e => setMin(e.target.value)} disabled={locked} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Skor maksimum</Label>
              <Input type="number" value={maxScore} onChange={e => setMax(e.target.value)} disabled={locked} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          {locked && <p className="-mt-2 text-[11px] text-amber-700">Julat skor dikunci kerana undian telah diterima.</p>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showResults} onChange={e => setShowResults(e.target.checked)} />
            Papar purata dan bilangan undian kepada awam
          </label>
          {!initial && !!teamCount && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={addAllTeams} onChange={e => setAddAll(e.target.checked)} />
              Tambah semua {teamCount} pasukan sebagai penyertaan (pautan diisi kemudian)
            </label>
          )}
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {initial ? "Simpan" : "Cipta sesi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EntryValues = { teamId?: string | null; title: string; subtitle: string; links: VLink[] };

function EntryDialog({ entry, teams, wc, onClose, onSave }: {
  entry: Entry | null; teams: Team[]; wc: Wc | null; onClose: () => void; onSave: (v: EntryValues) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(entry?.teamId ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [subtitle, setSubtitle] = useState(entry?.subtitle ?? "");
  const [links, setLinks] = useState<VLink[]>(entry?.links.length ? entry.links : [{ label: "", url: "" }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function pickTeam(id: string) {
    setTeamId(id);
    const t = teams.find(x => x.id === id);
    if (t) { setTitle(t.name); setSubtitle(t.contingentName); }
  }
  // WebCraft: the team's published projects, read once per page.
  const wcLoad = wc?.load, wcHave = !!wc?.projects;
  useEffect(() => { if (wcLoad && !wcHave && teamId) void wcLoad(); }, [wcLoad, wcHave, teamId]);
  const wcList = teamId ? wc?.projects?.[teamId] ?? [] : [];
  function addProject(p: WcProject) {
    setLinks(ls => {
      if (ls.some(l => l.url.trim() === p.url)) return ls;
      const kept = ls.filter(l => l.url.trim() || l.label.trim());
      return [...kept, { label: p.name, url: p.url }].slice(0, 5);
    });
  }
  const setLink = (i: number, patch: Partial<VLink>) => setLinks(ls => ls.map((l, k) => k === i ? { ...l, ...patch } : l));

  async function save() {
    setSaving(true); setErr("");
    try {
      await onSave({
        ...(!entry && { teamId: teamId || null }),
        title, subtitle, links: links.filter(l => l.url.trim()),
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal"); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-teal-700">{entry ? "Sunting penyertaan" : "Penyertaan baharu"}</DialogTitle></DialogHeader>
        <div className="space-y-4 px-4 py-2">
          {!entry && teams.length > 0 && (
            <div>
              <Label className="text-xs">Pasukan (pilihan)</Label>
              <select value={teamId} onChange={e => pickTeam(e.target.value)} className="mt-1 h-8 w-full rounded-md border bg-white px-2 text-sm">
                <option value="">— Penyertaan bebas —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.contingentName}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">Tajuk</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 h-8 text-sm" placeholder="Nama pasukan atau tajuk karya" />
          </div>
          <div>
            <Label className="text-xs">Keterangan (pilihan)</Label>
            <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} className="mt-1 h-8 text-sm" placeholder="cth. kontinjen / sekolah" />
          </div>
          <div>
            {wc && (
              <div className="mb-3 rounded-md border border-sky-100 bg-sky-50/60 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800"><Globe className="h-3.5 w-3.5" /> Projek WebCraft diterbitkan</p>
                {!teamId ? <p className="mt-1 text-[11px] text-sky-700/80">Pilih pasukan untuk melihat projeknya.</p>
                  : wc.loading && !wc.projects ? <p className="mt-1 flex items-center gap-1 text-[11px] text-sky-700"><Loader2 className="h-3 w-3 animate-spin" /> Membaca WebCraft…</p>
                  : wc.error && !wc.projects ? <p className="mt-1 text-[11px] text-red-600">{wc.error} <button className="underline" onClick={() => void wc.load()}>Cuba lagi</button></p>
                  : wcList.length === 0 ? <p className="mt-1 text-[11px] text-sky-700/80">Pasukan ini tiada projek diterbitkan.</p>
                  : <ul className="mt-1.5 space-y-1">
                      {wcList.map(p => {
                        const added = links.some(l => l.url.trim() === p.url);
                        return (
                          <li key={p.id} className="flex items-center gap-2 text-xs">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-zinc-800">{p.name}</p>
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] text-sky-700 hover:underline">{p.url}</a>
                            </div>
                            <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" disabled={added || links.filter(l => l.url.trim()).length >= 5}
                              onClick={() => addProject(p)}>
                              {added ? <><Check className="h-3 w-3" /> Dipilih</> : <><Plus className="h-3 w-3" /> Guna</>}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>}
              </div>
            )}
            <Label className="text-xs">Pautan (artikel, video, laman…)</Label>
            <div className="mt-1 space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={l.label} onChange={e => setLink(i, { label: e.target.value })} className="h-8 w-32 text-sm" placeholder="Label" />
                  <Input value={l.url} onChange={e => setLink(i, { url: e.target.value })} className="h-8 flex-1 text-sm" placeholder="https://…" />
                  <button onClick={() => setLinks(ls => ls.filter((_, k) => k !== i))} className="text-zinc-400 hover:text-red-600" title="Buang"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {links.length < 5 && (
                <button onClick={() => setLinks(ls => [...ls, { label: "", url: "" }])} className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline">
                  <Plus className="h-3 w-3" /> Tambah pautan
                </button>
              )}
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
