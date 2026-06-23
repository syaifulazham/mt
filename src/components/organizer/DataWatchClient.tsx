"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, RefreshCw, Wrench, ChevronDown, ChevronUp, Loader2, CheckCircle2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type IcRow = {
  id: string; name: string; ic: string | null; contingentName: string;
};

type GradeRow = {
  id: string; name: string; ic: string;
  classGrade: string | null; age: number; expectedGrade: string;
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
      const json = await res.json();
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
  const [rows,      setRows]      = useState<GradeRow[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [limit,     setLimit]     = useState(10);
  const [repairing, setRepairing] = useState(false);
  const [repaired,  setRepaired]  = useState<number | null>(null);
  const [repairErr, setRepairErr] = useState<string | null>(null);

  const load = useCallback(async (lim: number) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/organizer/data-watch/wrong-grade?limit=${lim}`);
      const json = await res.json();
      setRows(json.data  ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(limit); }, [load, limit]);

  async function handleRepair() {
    setRepairing(true);
    setRepaired(null);
    setRepairErr(null);
    try {
      const res  = await fetch("/api/v2/organizer/data-watch/repair-grade", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRepaired(json.updated ?? 0);
      await load(limit);
    } catch (e) {
      setRepairErr(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Incorrect Class Grade (Age 7–17)</h2>
            <p className="text-xs text-zinc-500">
              Grade derived from IC year of birth — Darjah 1–6 (age 7–12), Tingkatan 1–5 (age 13–17)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              total > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
            }`}>
              {total} record{total !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(limit)}
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
                  {["Name", "IC", "Age", "Current Grade", "Expected Grade", "Contingent"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{r.ic}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{r.age}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">{r.classGrade ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">{r.expectedGrade}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{r.contingentName}</td>
                  </tr>
                ))}
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

// ── Main export ────────────────────────────────────────────────────────────────

export function DataWatchClient() {
  return (
    <div className="space-y-6">
      <IncompleteIcSection />
      <WrongGradeSection />
    </div>
  );
}
