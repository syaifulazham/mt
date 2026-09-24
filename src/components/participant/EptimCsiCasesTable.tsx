"use client";

import { useState, useCallback, useEffect } from "react";
import { Fingerprint, Loader2, Check, AlertTriangle } from "lucide-react";

type CaseRow = { id: string; slug: string; title: string; registered: boolean };

type CasesResponse = {
  configured: boolean;
  accountRegistered: boolean;
  csiCompetitionName?: string | null;
  cases: CaseRow[];
};

export function EptimCsiCasesTable({ teamId, eventId }: { teamId: string; eventId: string }) {
  const [data,       setData]       = useState<CasesResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [busyId,     setBusyId]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/v2/participant/csi/team/cases?teamId=${teamId}&eventId=${eventId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as CasesResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat tak dijangka");
    } finally {
      setLoading(false);
    }
  }, [teamId, eventId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function register(caseId: string) {
    setBusyId(caseId);
    setError(null);
    try {
      const res = await fetch("/api/v2/participant/csi/team/cases", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ teamId, eventId, caseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(prev => prev && {
        ...prev,
        cases: prev.cases.map(c => (c.id === caseId ? { ...c, registered: true } : c)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pendaftaran gagal");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
        <Loader2 className="h-3 w-3 animate-spin" />Memuatkan kes Eptim CSI…
      </div>
    );
  }

  if (!data?.configured) return null;

  // The list stays hidden until the team holds a CSI account; the API withholds
  // it too, so there is nothing to reveal by poking at the response.
  if (!data.accountRegistered) {
    return (
      <div className="mt-2.5 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <Fingerprint className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            Daftar pasukan ke <span className="font-semibold">Eptim CSI</span> terlebih dahulu
            untuk melihat dan mendaftar kes acara ini. Gunakan butang{" "}
            <span className="font-semibold">Eptim CSI</span> di bahagian atas kad pasukan.
          </span>
        </p>
        <button
          type="button"
          disabled={rechecking}
          onClick={async () => { setRechecking(true); await load(); setRechecking(false); }}
          className="mt-2 flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-700/50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
        >
          {rechecking && <Loader2 className="h-3 w-3 animate-spin" />}
          Semak semula
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/60 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800/30">
        <Fingerprint className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          Kes Eptim CSI{data.csiCompetitionName ? ` — ${data.csiCompetitionName}` : ""}
        </span>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-zinc-400 dark:text-zinc-500">
            <th className="font-medium px-3 py-1.5">Kes</th>
            <th className="font-medium px-3 py-1.5 w-28">Tindakan</th>
            <th className="font-medium px-3 py-1.5 w-28">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-200/60 dark:divide-amber-800/30">
          {data.cases.map(c => (
            <tr key={c.id}>
              <td className="px-3 py-2 align-top">
                <p className="text-zinc-700 dark:text-zinc-200 font-medium">{c.title}</p>
                <p className="text-[10px] text-zinc-400 font-mono truncate">{c.slug}</p>
              </td>
              <td className="px-3 py-2 align-top">
                {c.registered ? (
                  <span className="text-[11px] text-zinc-400">—</span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => register(c.id)}
                    className="flex items-center gap-1 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium px-2 py-1 transition-colors"
                  >
                    {busyId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    Daftar
                  </button>
                )}
              </td>
              <td className="px-3 py-2 align-top">
                {c.registered ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                    <Check className="h-3 w-3" />Berdaftar
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Belum daftar</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && (
        <p className="flex items-start gap-1 px-3 py-1.5 text-[10px] text-red-500 dark:text-red-400 border-t border-amber-200 dark:border-amber-800/30">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{error}
        </p>
      )}
    </div>
  );
}
