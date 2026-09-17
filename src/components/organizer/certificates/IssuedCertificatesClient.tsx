"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Season = { id: string; code: string; name: string; archivedAt: string | null;
                _count: { certificates: number } };

type Issued = {
  id: string; serialNumber: string; uniqueCode: string; status: string; issuedAt: string | null;
  recipientName: string; recipientType: string; recipientIc: string | null;
  contingentName: string | null; teamName: string | null; competitionName: string | null; awardTitle: string | null;
  season: { code: string; archivedAt: string | null };
  templateVersion: { version: number; template: { id: string; name: string; targetType: string } };
};

const PAGE_SIZE = 25;
const SELECT = "h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm";

/**
 * Lookup over the certificate snapshot alone — name, IC, serial or verification
 * code. It deliberately never joins participants or events, which is what keeps
 * it working after a season's operational data is purged.
 */
export function IssuedCertificatesClient() {
  const [rows, setRows]       = useState<Issued[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState("");
  const [query, setQuery]     = useState("");
  const [seasonId, setSeason] = useState("");
  const [status, setStatus]   = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set("q", query);
      if (seasonId) params.set("seasonId", seasonId);
      if (status) params.set("status", status);
      const res  = await fetch(`/api/v2/organizer/certificates/issued?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.data); setTotal(json.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [page, query, seasonId, status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v2/organizer/certificates/seasons")
      .then((r) => r.json())
      .then((j) => setSeasons(j.data ?? []))
      .catch(() => {});
  }, []);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/organizer/certificates" className="text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Issued certificates</h1>
          <p className="text-sm text-zinc-500">
            {total.toLocaleString()} record{total === 1 ? "" : "s"} — each renders from its own snapshot, on demand.
          </p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}
      >
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-72 pl-8"
            placeholder="Name, IC, serial or verification code"
          />
        </div>
        <select className={SELECT} value={seasonId} onChange={(e) => { setPage(1); setSeason(e.target.value); }}>
          <option value="">All seasons</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.code} — {s._count.certificates.toLocaleString()}</option>
          ))}
        </select>
        <select className={SELECT} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">Any status</option>
          {["READY", "LISTED", "DRAFT", "REVOKED"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Serial</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Contingent</th>
              <th className="px-3 py-2">Competition / award</th>
              <th className="px-3 py-2">Template</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" /></td></tr>
            )}
            {!loading && rows.map((c) => (
              <tr key={c.id} className="border-t hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-[11px]">{c.serialNumber}</td>
                <td className="px-3 py-2">
                  <span className="block">{c.recipientName}</span>
                  <span className="block text-[11px] text-zinc-400">{c.recipientIc ?? "—"} · {c.recipientType}</span>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{c.contingentName ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.competitionName ?? "—"}{c.awardTitle ? ` · ${c.awardTitle}` : ""}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.templateVersion.template.name}
                  <span className="text-zinc-400"> v{c.templateVersion.version}</span>
                </td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{c.status}</Badge></td>
                <td className="px-3 py-2 text-right">
                  <a href={`/api/v2/certificates/${c.id}/download`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                      <Download className="mr-1 h-3 w-3" /> PDF
                    </Button>
                  </a>
                </td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">Nothing matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Page {page} of {pages.toLocaleString()}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
