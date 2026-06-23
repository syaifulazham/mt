"use client";

import { useState, useCallback, useEffect } from "react";
import { Plane, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

type DroneTeamStatus = {
  sectorExists:   boolean | null;
  userExists:     boolean | null;
  registered:     boolean;
  contingentId:   string;
  contingentName: string;
  teamId:         string;
  teamName:       string;
  droneUserId:    string | null;
};

export function EptimDroneTeamButton({ teamId }: { teamId: string }) {
  const [status,  setStatus]  = useState<DroneTeamStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/v2/participant/drone/team/status?teamId=${teamId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json as DroneTeamStatus);
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
      const res  = await fetch("/api/v2/participant/drone/team/register", {
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
      const res  = await fetch("/api/v2/participant/drone/team/signin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const { accessToken, appUrl } = json as { accessToken: string; appUrl: string };
      if (appUrl) {
        const sep = appUrl.includes("?") ? "&" : "?";
        window.open(`${appUrl}${sep}access_token=${accessToken}`, "_blank", "noopener,noreferrer");
      } else {
        await navigator.clipboard.writeText(accessToken).catch(() => {});
        setError(`EPTIMDRONE_APP_URL not set. Token copied to clipboard.`);
      }
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
        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-sky-700/40 bg-sky-950/30 hover:bg-sky-900/40 px-2.5 py-1.5 text-xs font-medium text-sky-300 transition-colors"
      >
        <Plane className="h-3.5 w-3.5" />
        Eptim Drone
      </button>
    );
  }

  // Expanded inline panel
  return (
    <div className="w-full mt-2 rounded-xl border border-sky-800/40 bg-sky-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-sky-900/30 border-b border-sky-800/30">
        <div className="flex items-center gap-1.5">
          <Plane className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold text-sky-300">Eptim Drone</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-3">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Memeriksa status…
          </div>
        )}

        {!loading && error && !status && (
          <div className="flex items-start gap-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {!loading && status && (
          <div className="space-y-2.5">
            {/* Status row */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-zinc-900 px-2.5 py-2">
                <p className="text-zinc-500 mb-0.5">Sektor (Kontinjen)</p>
                <p className={`font-medium ${status.sectorExists ? "text-green-400" : "text-amber-400"}`}>
                  {status.sectorExists === null ? "—" : status.sectorExists ? "Berdaftar" : "Belum daftar"}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-900 px-2.5 py-2">
                <p className="text-zinc-500 mb-0.5">Pengguna (Pasukan)</p>
                <p className={`font-medium ${status.userExists ? "text-green-400" : "text-amber-400"}`}>
                  {status.userExists === null ? "—" : status.userExists ? "Berdaftar" : "Belum daftar"}
                </p>
              </div>
            </div>

            {/* Register button */}
            {!status.registered && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRegister}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plane className="h-3.5 w-3.5" />}
                Daftar ke Eptim Drone
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
                Log Masuk ke Eptim Drone
              </button>
            )}

            {error && (
              <p className="text-[11px] text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
