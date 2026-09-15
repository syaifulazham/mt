"use client";

import { useState, useCallback, useEffect } from "react";
import { Fingerprint, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

type CsiTeamStatus = {
  registered: boolean;
  userExists: boolean | null;
  csiUserId:  string | null;
  csiAlias:   string | null;
  caseCount:  number | null;
  teamId:     string;
  teamName:   string;
};

export function EptimCsiTeamButton({ teamId }: { teamId: string }) {
  const [status,  setStatus]  = useState<CsiTeamStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/v2/participant/csi/team/status?teamId=${teamId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json as CsiTeamStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat tak dijangka");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/csi/team/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pendaftaran gagal");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignin() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/csi/team/signin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const { loginUrl } = json as { loginUrl: string };
      // The link is single-use and expires in 120s, so follow it immediately —
      // and in this tab if the popup was blocked.
      const opened = window.open(loginUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(loginUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Log masuk gagal");
    } finally {
      setBusy(false);
    }
  }

  // Collapsed trigger button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors"
      >
        <Fingerprint className="h-3.5 w-3.5" />
        Eptim CSI
      </button>
    );
  }

  // Expanded inline panel
  return (
    <div className="w-full mt-2 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-100/60 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800/30">
        <div className="flex items-center gap-1.5">
          <Fingerprint className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Eptim CSI</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-3">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Memeriksa status…
          </div>
        )}

        {!loading && error && !status && (
          <div className="flex items-start gap-2 text-xs text-red-500 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {!loading && status && (
          <div className="space-y-2.5">
            {/* Status row */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-white dark:bg-zinc-900 px-2.5 py-2">
                <p className="text-zinc-500 mb-0.5">Akaun Pasukan</p>
                <p className={`font-medium ${status.registered ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {status.registered ? "Berdaftar" : status.userExists ? "Ada di CSI" : "Belum daftar"}
                </p>
                {status.csiAlias && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">{status.csiAlias}</p>
                )}
              </div>
              <div className="rounded-lg bg-white dark:bg-zinc-900 px-2.5 py-2">
                <p className="text-zinc-500 mb-0.5">Kes Tersedia</p>
                <p className="font-medium text-zinc-700 dark:text-zinc-200">
                  {status.caseCount === null ? "—" : status.caseCount}
                </p>
              </div>
            </div>

            {/* Register button */}
            {!status.registered && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRegister}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
                Daftar ke Eptim CSI
              </button>
            )}

            {/* Signin button */}
            {status.registered && (
              <button
                type="button"
                disabled={busy}
                onClick={handleSignin}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Log Masuk ke Eptim CSI
              </button>
            )}

            {error && (
              <p className="text-[11px] text-red-500 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
