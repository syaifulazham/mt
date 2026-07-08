"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, RefreshCw, Wrench, ChevronDown, ChevronUp, Loader2, CheckCircle2, ScrollText, Trash2, Search, Pencil } from "lucide-react";

const CANONICAL_GRADES = [
  "Prasekolah 5thn", "Prasekolah 6thn",
  "Darjah 1", "Darjah 2", "Darjah 3", "Darjah 4", "Darjah 5", "Darjah 6",
  "Tingkatan 1", "Tingkatan 2", "Tingkatan 3", "Tingkatan 4", "Tingkatan 5",
  "Tingkatan Peralihan",
];

type LogEntry = {
  ts: string;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  detail?: string;
};

// ── Types ──────────────────────────────────────────────────────────────────────

type IcRow = {
  id: string; name: string; ic: string | null; contingentName: string;
};

type GradeRow = {
  id: string; name: string; ic: string | null;
  classGrade: string | null; age: number; suggestedGrade: string | null;
  contingentName: string;
};

// ── Section 1: Incomplete IC ──────────────────────────────────────────────────

function IncompleteIcSection() {
  const [rows,    setRows]    = useState<IcRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(10);

  const load = useCallback(async (lim: number) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/organizer/data-watch/incomplete-ic?limit=${lim}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      setRows(json.data  ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(limit); }, [load, limit]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Incomplete IC Number</h2>
            <p className="text-xs text-zinc-500">Participants with fewer than 12 digit characters in their IC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              total > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
            }`}>
              {total} record{total !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(limit)}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-zinc-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && total === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4" /> All participant ICs are complete.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-100">
                <tr>
                  {["Name", "IC (as stored)", "Digits", "Contingent"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {rows.map(r => {
                  const digits = (r.ic ?? "").replace(/\D/g, "");
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-red-600">{r.ic ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">{digits.length}/12</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500">{r.contingentName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > rows.length && (
            <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-xs text-zinc-400">Showing {rows.length} of {total}</p>
              <button
                type="button"
                onClick={() => setLimit(l => l + 20)}
                className="flex items-center gap-1 text-xs text-[#085782] hover:underline"
              >
                <ChevronDown className="h-3.5 w-3.5" /> Load more
              </button>
            </div>
          )}
          {total <= rows.length && total > 10 && (
            <div className="px-4 py-3 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => setLimit(10)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Collapse
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Section 2: Wrong Grade ─────────────────────────────────────────────────────

function WrongGradeSection() {
  const [rows,        setRows]        = useState<GradeRow[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [limit,       setLimit]       = useState(10);
  const [repairing,   setRepairing]   = useState(false);
  const [repaired,    setRepaired]    = useState<number | null>(null);
  const [repairErr,   setRepairErr]   = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search,      setSearch]      = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editingValue,setEditingValue]= useState("");
  const [saving,      setSaving]      = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (lim: number, srch: string, gf: string) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: String(lim) });
      if (srch) sp.set("search", srch);
      if (gf)   sp.set("gradeFilter", gf);
      const res  = await fetch(`/api/v2/organizer/data-watch/wrong-grade?${sp}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      setRows(json.data  ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(limit, search, gradeFilter); }, [load, limit, gradeFilter]);

  // Debounce search input
  function handleSearchChange(val: string) {
    setSearch(val);
    setLimit(10);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(10, val, gradeFilter), 400);
  }

  function handleGradeFilterChange(val: string) {
    setGradeFilter(val);
    setLimit(10);
  }

  // Distinct grade values from current rows for filter dropdown
  const distinctGrades = [...new Set(rows.map(r => r.classGrade ?? "__NULL__"))].sort();

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  }

  const allSelected  = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < rows.length;

  async function handleRepair() {
    setRepairing(true);
    setRepaired(null);
    setRepairErr(null);
    try {
      const body = selectedIds.size > 0 ? { ids: [...selectedIds] } : {};
      const res  = await fetch("/api/v2/organizer/data-watch/repair-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRepaired(json.updated ?? 0);
      setSelectedIds(new Set());
      await load(limit, search, gradeFilter);
    } catch (e) {
      setRepairErr(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/v2/organizer/data-watch/repair-grade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, classGrade: editingValue }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setEditingId(null);
      await load(limit, search, gradeFilter);
    } catch (e) {
      setRepairErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: GradeRow) {
    setEditingId(r.id);
    setEditingValue(r.suggestedGrade ?? r.classGrade ?? CANONICAL_GRADES[0]);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Incorrect Class Grade</h2>
            <p className="text-xs text-zinc-500">
              All non-canonical class grades — Prasekolah, Darjah 1–6, Tingkatan 1–5 &amp; Peralihan
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!loading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              total > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
            }`}>
              {total} record{total !== 1 ? "s" : ""}
            </span>
          )}
          {/* Search input */}
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3 w-3 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search name / IC / grade…"
              className="pl-6 pr-2 py-1 text-xs border border-zinc-200 rounded-md bg-white text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-orange-300 w-44"
            />
          </div>
          {/* Grade filter */}
          {rows.length > 0 && (
            <select
              value={gradeFilter}
              onChange={e => handleGradeFilterChange(e.target.value)}
              className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-300"
            >
              <option value="">All grades</option>
              {distinctGrades.map(g => (
                <option key={g} value={g}>
                  {g === "__NULL__" ? "— (kosong)" : g}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => load(limit, search, gradeFilter)}
            disabled={loading || repairing}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {total > 0 && (
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing || loading}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              {repairing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Repairing…</>
                : selectedIds.size > 0
                  ? <><Wrench className="h-3.5 w-3.5" /> Repair {selectedIds.size} Selected</>
                  : <><Wrench className="h-3.5 w-3.5" /> Repair All</>}
            </button>
          )}
        </div>
      </div>

      {/* Repair result */}
      {repaired !== null && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-green-50 border-b border-green-100 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {repaired} record{repaired !== 1 ? "s" : ""} repaired successfully.
        </div>
      )}
      {repairErr && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border-b border-red-100 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {repairErr}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-zinc-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && total === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4" /> All grades are in the correct format.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-100">
                <tr>
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="rounded border-zinc-300 cursor-pointer"
                    />
                  </th>
                  {["Name", "IC", "Age", "Current Grade", "Suggested Correction", "Contingent", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {rows.map(r => {
                  const checked = selectedIds.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-zinc-50/60 cursor-pointer ${checked ? "bg-orange-50/40" : ""}`}
                      onClick={() => toggleRow(r.id)}
                    >
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.id)}
                          className="rounded border-zinc-300 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-zinc-900">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{r.ic ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{r.age || "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">{r.classGrade ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {r.suggestedGrade
                          ? <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{r.suggestedGrade}</span>
                          : <span className="text-zinc-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500">{r.contingentName}</td>
                      {/* Inline edit cell */}
                      {editingId === r.id ? (
                        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <select
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              className="text-xs border border-zinc-300 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                            >
                              {CANONICAL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <button
                              onClick={() => handleSaveEdit(r.id)}
                              disabled={saving}
                              className="text-xs text-green-700 hover:underline disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-zinc-400 hover:text-zinc-600"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startEdit(r)}
                            className="text-zinc-300 hover:text-indigo-600 transition-colors"
                            title="Edit grade"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedIds.size > 0 && (
            <div className="px-4 py-2 border-t border-orange-100 bg-orange-50/50 text-xs text-orange-700 flex items-center gap-1.5">
              <Wrench className="h-3 w-3" />
              {selectedIds.size} row{selectedIds.size !== 1 ? "s" : ""} selected — click &quot;Repair {selectedIds.size} Selected&quot; to fix only these records.
            </div>
          )}

          {total > rows.length && (
            <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-xs text-zinc-400">Showing {rows.length} of {total}</p>
              <button
                type="button"
                onClick={() => setLimit(l => l + 20)}
                className="flex items-center gap-1 text-xs text-[#085782] hover:underline"
              >
                <ChevronDown className="h-3.5 w-3.5" /> Load more
              </button>
            </div>
          )}
          {total <= rows.length && total > 10 && (
            <div className="px-4 py-3 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => setLimit(10)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Collapse
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Section 3: Error Log Watcher ─────────────────────────────────────────────

const LEVEL_STYLES: Record<string, { badge: string; row: string }> = {
  error: { badge: "bg-red-100 text-red-700",    row: "bg-red-50/40" },
  warn:  { badge: "bg-amber-100 text-amber-700", row: "bg-amber-50/30" },
  info:  { badge: "bg-blue-100 text-blue-600",   row: "" },
};

function ErrorLogSection() {
  const [entries,  setEntries]  = useState<LogEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [clearing, setClearing] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: "200" });
      if (levelFilter) sp.set("level", levelFilter);
      const res  = await fetch(`/api/v2/organizer/data-watch/error-logs?${sp}`);
      const text = await res.text();
      const json = JSON.parse(text);
      setEntries(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleClear() {
    if (!confirm("Clear all error log entries?")) return;
    setClearing(true);
    try {
      await fetch("/api/v2/organizer/data-watch/error-logs", { method: "DELETE" });
      setEntries([]);
    } finally {
      setClearing(false);
    }
  }

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.level] = (acc[e.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <ScrollText className="h-4 w-4 text-zinc-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Error Log Watcher</h2>
            <p className="text-xs text-zinc-500">Recent application errors from API routes (newest first)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Level summary pills */}
          {(["error", "warn", "info"] as const).map((lvl) => counts[lvl] ? (
            <button
              key={lvl}
              onClick={() => setLevelFilter(levelFilter === lvl ? "" : lvl)}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-opacity ${
                LEVEL_STYLES[lvl].badge
              } ${levelFilter && levelFilter !== lvl ? "opacity-40" : ""}`}
            >
              {counts[lvl]} {lvl}
            </button>
          ) : null)}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-8 text-sm text-zinc-400 justify-center">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          No log entries{levelFilter ? ` at level "${levelFilter}"` : ""}.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 text-xs font-mono">
          {entries.map((e, i) => (
            <div
              key={i}
              className={`${LEVEL_STYLES[e.level]?.row ?? ""} cursor-pointer`}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className="shrink-0 mt-0.5 text-[10px] text-zinc-400 tabular-nums w-36">
                  {new Date(e.ts).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "medium" })}
                </span>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${LEVEL_STYLES[e.level]?.badge ?? ""}`}>
                  {e.level.toUpperCase()}
                </span>
                <span className="shrink-0 text-zinc-400 w-40 truncate">{e.source}</span>
                <span className="text-zinc-700 truncate flex-1">{e.message}</span>
                {e.detail && <ChevronDown className={`h-3 w-3 text-zinc-400 shrink-0 transition-transform ${expanded === i ? "rotate-180" : ""}`} />}
              </div>
              {expanded === i && e.detail && (
                <div className="px-4 pb-3 pt-0">
                  <pre className="text-[11px] text-zinc-500 bg-zinc-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {e.detail}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function DataWatchClient() {
  return (
    <div className="space-y-6">
      <IncompleteIcSection />
      <WrongGradeSection />
      <ErrorLogSection />
    </div>
  );
}
