"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Globe, ExternalLink, Search, Loader2, AlertTriangle, RefreshCw, UserX,
} from "lucide-react";
import type { ParticipantProjects, WebcraftRosterCompetition, WebcraftRosterTeam } from "@/lib/webcraftJudging";
import type { WebcraftPublishedProject } from "@/lib/eptim-webcraft";

const PAGE_SIZE = 100;

type Filter = "all" | "with" | "without" | "no_account";

type Project = WebcraftPublishedProject & { owner: string | null };

/** One row per team: its shared account plus any members' personal accounts. */
type TeamRow = WebcraftRosterTeam & {
  hasAccount: boolean;
  /** Union of every account's published projects, de-duplicated. */
  projects: Project[];
  /** true when every account answered; false while any is still unknown. */
  resolved: boolean;
};

const ACCEPTANCE_STYLE: Record<string, string> = {
  ACCEPTED: "bg-green-50 text-green-700",
  PENDING:  "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-600",
};

function fmt(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function EventWebcraftJudgingClient({
  event, competitions,
}: {
  event: { id: string; name: string; slug: string };
  competitions: WebcraftRosterCompetition[];
}) {
  const [activeId, setActiveId] = useState(competitions[0]?.competitionId ?? "");
  const [q,        setQ]        = useState("");
  const [filter,   setFilter]   = useState<Filter>("all");
  const [page,     setPage]     = useState(0);

  const [projects, setProjects] = useState<Record<string, ParticipantProjects> | null>(null);
  const [teamProjects, setTeamProjects] = useState<Record<string, ParticipantProjects>>({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/v2/organizer/events/${event.id}/webcraft-projects`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setProjects(json.data ?? {});
      setTeamProjects(json.teams ?? {});
      setFetchedAt(json.fetchedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuatkan projek Webcraft");
    } finally {
      setLoading(false);
    }
  }, [event.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const active = competitions.find((c) => c.competitionId === activeId) ?? competitions[0];

  const isTeam = active?.participationType !== "INDIVIDUAL";

  const rows: TeamRow[] = useMemo(() => (active?.teams ?? []).map((t) => {
    const sources: { owner: string | null; state: ParticipantProjects | undefined }[] = [];
    if (t.teamWebcraftUserId) sources.push({ owner: "Akaun pasukan", state: teamProjects[t.teamId] });
    for (const m of t.members) {
      // A team account adopted from a member is that member's account — don't list it twice.
      if (!m.webcraftUserId || m.webcraftUserId === t.teamWebcraftUserId) continue;
      sources.push({ owner: m.name, state: projects?.[m.participantId] });
    }
    const seen = new Set<string>();
    const list: Project[] = [];
    for (const src of sources) {
      if (src.state?.state !== "ok") continue;
      for (const p of src.state.projects) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        list.push({ ...p, owner: sources.length > 1 ? src.owner : null });
      }
    }
    return {
      ...t,
      hasAccount: sources.length > 0,
      projects:   list,
      resolved:   !!projects && sources.every((src) => src.state && src.state.state !== "unknown"),
    };
  }), [active, projects, teamProjects]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "no_account" && r.hasAccount) return false;
      if (filter === "with"    && r.projects.length === 0) return false;
      if (filter === "without" && !(r.hasAccount && projects && r.projects.length === 0)) return false;
      if (!needle) return true;
      const hay = `${r.teamName} ${r.contingent} ${r.members.map((m) => m.name).join(" ")} ${r.projects.map((p) => p.name).join(" ")}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [rows, q, filter, projects]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount - 1);
  const visible   = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const memberCount  = rows.reduce((n, r) => n + r.members.length, 0);
  const withAccount  = rows.filter((r) => r.hasAccount).length;
  const withProjects = projects ? rows.filter((r) => r.projects.length > 0).length : null;
  const unit         = isTeam ? "pasukan" : "peserta";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/organizer/events/${event.slug}/manage`}
          className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Globe className="h-5 w-5 text-violet-600" /> Penghakiman Webcraft
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5 truncate">{event.name}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Muat semula projek
        </button>
      </div>

      {competitions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white py-16 text-center text-sm text-zinc-400">
          Tiada pertandingan bersepadu Eptim Webcraft dalam acara ini.
        </div>
      ) : (
        <>
          {/* Competition tabs — label is "<code> <name>" */}
          {competitions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {competitions.map((c) => (
                <button
                  key={c.competitionId}
                  type="button"
                  onClick={() => { setActiveId(c.competitionId); setPage(0); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    c.competitionId === active?.competitionId
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span className="font-mono text-zinc-400 mr-1.5">{c.code}</span>{c.name}
                </button>
              ))}
            </div>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-900">
                <span className="font-mono text-zinc-400 mr-1.5">{active.code}</span>{active.name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{memberCount} peserta</span>
                {isTeam && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">{rows.length} pasukan</span>}
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{withAccount} {unit} ada akaun Webcraft</span>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                  {withProjects === null ? "…" : withProjects} {unit} ada projek diterbitkan
                </span>
              </div>
            </div>

            {/* Search + filter */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50">
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  placeholder="Cari peserta, pasukan, kontinjen atau projek…"
                  className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs"
              >
                <option value="all">Semua {unit}</option>
                <option value="with">Ada projek diterbitkan</option>
                <option value="without">Akaun ada, tiada projek</option>
                <option value="no_account">Tiada akaun Webcraft</option>
              </select>
            </div>

            {error && (
              <p className="flex items-center gap-1.5 px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Projek Webcraft tidak dapat dimuatkan: {error}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                    <th className="px-5 py-2 font-medium">{isTeam ? "Pasukan" : "Peserta"}</th>
                    {isTeam && <th className="px-3 py-2 font-medium">Ahli</th>}
                    <th className="px-3 py-2 font-medium">Kontinjen</th>
                    <th className="px-3 py-2 font-medium w-[38%]">Projek diterbitkan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visible.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-10 text-center text-xs text-zinc-400">Tiada {unit} sepadan.</td></tr>
                  )}
                  {visible.map((r) => (
                    <tr key={r.teamId} className="align-top">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-zinc-800">{isTeam ? r.teamName : r.members[0]?.name ?? r.teamName}</p>
                        {(r.teamWebcraftUserId ?? (!isTeam ? r.members[0]?.webcraftUserId : null)) && (
                          <p className="text-[10px] font-mono text-zinc-400">
                            {r.teamWebcraftUserId ?? r.members[0]?.webcraftUserId}
                          </p>
                        )}
                        <span className={`mt-0.5 inline-block rounded-full px-1.5 text-[10px] ${ACCEPTANCE_STYLE[r.acceptance] ?? "bg-zinc-100 text-zinc-500"}`}>
                          {r.acceptance}
                        </span>
                      </td>
                      {isTeam && (
                        <td className="px-3 py-2.5">
                          <ul className="space-y-1">
                            {r.members.map((m) => (
                              <li key={m.participantId} className="text-xs text-zinc-700 leading-snug">
                                {m.name}
                                {!m.webcraftUserId && <span className="ml-1 text-[10px] text-zinc-400">(tiada akaun)</span>}
                              </li>
                            ))}
                          </ul>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-xs text-zinc-500">{r.contingent}</td>
                      <td className="px-3 py-2.5">
                        {r.projects.length > 0 ? (
                          <ul className="space-y-1">
                            {r.projects.map((proj) => (
                              <li key={proj.id}>
                                <a
                                  href={proj.published_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
                                >
                                  {proj.name} <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                                <p className="text-[10px] text-zinc-400">
                                  {fmt(proj.published_at) && `Diterbitkan ${fmt(proj.published_at)}`}
                                  {proj.updated_at && fmt(proj.updated_at) !== fmt(proj.published_at) && ` · Dikemas kini ${fmt(proj.updated_at)}`}
                                  {proj.owner && ` · ${proj.owner}`}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : !r.hasAccount ? (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                            <UserX className="h-3.5 w-3.5" /> Tiada akaun Webcraft
                          </span>
                        ) : loading && !projects ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" /> Memuatkan…
                          </span>
                        ) : !r.resolved ? (
                          <span className="text-xs text-zinc-400">—</span>
                        ) : (
                          <span className="text-xs text-zinc-400">Belum menerbitkan projek</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination keeps the DOM small on large competitions */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 text-xs text-zinc-500">
              <span>
                {filtered.length === 0 ? "0" : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}`}
                {" "}daripada {filtered.length}
                {fetchedAt && <span className="ml-2 text-zinc-400">· projek dikemas kini {new Date(fetchedAt).toLocaleTimeString("ms-MY")}</span>}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                    className="rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40">Sebelum</button>
                  <span className="px-2">{safePage + 1} / {pageCount}</span>
                  <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
                    className="rounded-md border border-zinc-200 px-2 py-1 disabled:opacity-40">Seterusnya</button>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
