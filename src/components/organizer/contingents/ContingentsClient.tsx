"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Trophy, UserCheck, ChevronRight, Building2 } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ContingentRow = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  contingentType: "SCHOOL" | "HIGHER" | "INDEPENDENT" | "INTERNATIONAL";
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  stateName: string | null;
  stateCode: string | null;
  _count: { managers: number; participants: number; teams: number };
};

const TYPE_LABEL: Record<ContingentRow["contingentType"], string> = {
  SCHOOL:        "School",
  HIGHER:        "Higher Ed",
  INDEPENDENT:   "Independent",
  INTERNATIONAL: "International",
};

const TYPE_COLOR: Record<ContingentRow["contingentType"], string> = {
  SCHOOL:        "bg-blue-50 text-blue-700 border-blue-200",
  HIGHER:        "bg-purple-50 text-purple-700 border-purple-200",
  INDEPENDENT:   "bg-amber-50 text-amber-700 border-amber-200",
  INTERNATIONAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export function ContingentsClient() {
  const router = useRouter();
  const [q, setQ]             = useState("");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(50);
  const [rows, setRows]       = useState<ContingentRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (q: string, p: number, ps: number) => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(ps) });
    if (q) params.set("q", q);
    try {
      const res  = await fetch(`/api/v2/organizer/contingents?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(search, page, pageSize);
  }, [search, page, pageSize, fetchData]);

  function handleInput(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  function handlePageSize(ps: 20 | 50 | 100) {
    setPageSize(ps);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd   = Math.min(page * pageSize, total);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Contingents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All registered contingents — schools, higher education, independent &amp; international
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            value={q}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search by name, short name or state…"
            className="pl-9"
          />
        </div>

        {/* Page size selector */}
        <div className="flex items-center gap-1 text-sm">
          <span className="text-zinc-500 mr-1">Show</span>
          {PAGE_SIZE_OPTIONS.map((ps) => (
            <button
              key={ps}
              onClick={() => handlePageSize(ps)}
              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                pageSize === ps
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {ps}
            </button>
          ))}
        </div>

        <span className="text-sm text-muted-foreground whitespace-nowrap ml-auto">
          {loading ? "Loading…" : `${total.toLocaleString()} contingent${total !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 w-10">#</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Contingent</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">State</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Managers</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Participants</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">
                  <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Teams</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Registered</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    No contingents found{search ? ` for "${search}"` : ""}.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push(`/organizer/contingents/${row.id}`)}
                    className="hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-zinc-400 tabular-nums text-xs">
                      {rangeStart + i}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-md border border-zinc-100 bg-zinc-50 overflow-hidden flex items-center justify-center">
                          {row.logoUrl ? (
                            <Image
                              src={row.logoUrl}
                              alt={row.shortName ?? row.name}
                              width={36}
                              height={36}
                              className="object-contain h-full w-full"
                              unoptimized
                            />
                          ) : (
                            <Building2 className="h-4 w-4 text-zinc-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900 leading-snug">{row.name}</p>
                          {row.shortName && (
                            <p className="text-xs text-zinc-400 mt-0.5">{row.shortName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLOR[row.contingentType]}`}>
                        {TYPE_LABEL[row.contingentType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-xs">
                      {row.stateName ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">{row._count.managers}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">{row._count.participants}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">{row._count.teams}</td>
                    <td className="px-4 py-3">
                      {row.status === "ACTIVE" ? (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 text-xs">Suspended</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {new Date(row.createdAt).toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-zinc-300" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50 text-sm">
            <span className="text-zinc-500">
              Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2.5 py-1 rounded border text-xs disabled:opacity-40 hover:bg-white transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-white transition-colors"
              >
                Prev
              </button>
              <span className="px-3 text-zinc-600 tabular-nums">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border text-xs disabled:opacity-40 hover:bg-white transition-colors"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2.5 py-1 rounded border text-xs disabled:opacity-40 hover:bg-white transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
