"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileBadge, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TARGET_TYPES = [
  "GENERAL", "EVENT_PARTICIPANT", "EVENT_WINNER", "NON_CONTEST_PARTICIPANT",
  "QUIZ_PARTICIPANT", "QUIZ_WINNER", "TRAINER", "CONTINGENT", "SCHOOL_WINNER",
] as const;

type Season = { id: string; code: string; name: string; year: number; archivedAt: string | null;
                _count: { certificates: number; templates: number } };

type Template = {
  id: string; name: string; targetType: string; status: string; issuedCount: number;
  season: { id: string; code: string; archivedAt: string | null };
  currentVersion: { version: number; publishedAt: string } | null;
  _count: { versions: number };
};

const SELECT = "h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm";

export function TemplateListClient({ canWrite }: { canWrite: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [seasons, setSeasons]     = useState<Season[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [q, setQ]                 = useState("");
  const [seasonId, setSeasonId]   = useState("");
  const [targetType, setTarget]   = useState("");
  const [creating, setCreating]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      if (q) params.set("q", q);
      if (seasonId) params.set("seasonId", seasonId);
      if (targetType) params.set("targetType", targetType);
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/v2/organizer/certificates/templates?${params}`),
        fetch("/api/v2/organizer/certificates/seasons"),
      ]);
      const [tJson, sJson] = await Promise.all([tRes.json(), sRes.json()]);
      if (!tRes.ok) throw new Error(tJson.error ?? `HTTP ${tRes.status}`);
      setTemplates(tJson.data);
      if (sRes.ok) setSeasons(sJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [q, seasonId, targetType]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <FileBadge className="h-5 w-5 text-zinc-400" /> Certificate templates
          </h1>
          <p className="text-sm text-zinc-500">
            Designs per season. Publishing freezes a version; issued certificates keep the version they were issued against.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/organizer/certificates/issued">
            <Button variant="outline" size="sm">Issued certificates</Button>
          </Link>
          {canWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New template
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="h-9 w-56 pl-8" />
        </div>
        <select className={SELECT} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">All seasons</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.code} — {s._count.templates} templates</option>
          ))}
        </select>
        <select className={SELECT} value={targetType} onChange={(e) => setTarget(e.target.value)}>
          <option value="">All types</option>
          {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Season</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Versions</th>
                <th className="px-3 py-2 text-right">Issued</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <Link href={`/organizer/certificates/templates/${t.id}`} className="font-medium text-blue-700 hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      {t.season.code}
                      {t.season.archivedAt && <Badge variant="outline" className="text-[10px]">archived</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{t.targetType}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{t.status}</Badge></td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-600">
                    {t._count.versions}{t.currentVersion ? ` (v${t.currentVersion.version} live)` : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.issuedCount.toLocaleString()}</td>
                </tr>
              ))}
              {!templates.length && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">No templates match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateTemplateDialog
          seasons={seasons.filter((s) => !s.archivedAt)}
          onClose={() => setCreating(false)}
          onCreated={(id) => { window.location.href = `/organizer/certificates/templates/${id}`; }}
        />
      )}
    </div>
  );
}

function CreateTemplateDialog({
  seasons, onClose, onCreated,
}: {
  seasons: Season[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName]         = useState("");
  const [seasonId, setSeasonId] = useState(seasons[0]?.id ?? "");
  const [targetType, setTarget] = useState<string>("EVENT_PARTICIPANT");
  const [orientation, setOrient] = useState<"portrait" | "landscape">("portrait");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v2/organizer/certificates/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, name, targetType, paper: "A4", orientation }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onCreated(json.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">New certificate template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="h-9" />
          <select className={`${SELECT} w-full`} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
          <select className={`${SELECT} w-full`} value={targetType} onChange={(e) => setTarget(e.target.value)}>
            {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={`${SELECT} w-full`} value={orientation}
                  onChange={(e) => setOrient(e.target.value as "portrait" | "landscape")}>
            <option value="portrait">A4 portrait</option>
            <option value="landscape">A4 landscape</option>
          </select>
          {!seasons.length && (
            <p className="text-xs text-amber-600">Every season is archived — open a new season first.</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={busy || !name.trim() || !seasonId} onClick={submit}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
