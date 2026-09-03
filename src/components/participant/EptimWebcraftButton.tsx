"use client";

import { useState, useCallback, useEffect } from "react";
import { Globe, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

type WebcraftStatus = {
  registered: boolean;
  userExists: boolean | null;
  webcraftUserId: string | null;
};

export function EptimWebcraftButton() {
  const [status,  setStatus]  = useState<WebcraftStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/webcraft/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json as WebcraftStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat tak dijangka");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/webcraft/register", { method: "POST" });
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
      const res  = await fetch("/api/v2/participant/webcraft/signin", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const { accessToken, refreshToken, appUrl } = json as {
        accessToken: string; refreshToken: string; appUrl: string;
      };
      if (appUrl) {
        const sep = appUrl.includes("?") ? "&" : "?";
        window.open(`${appUrl}${sep}access_token=${accessToken}&refresh_token=${refreshToken}`, "_blank", "noopener,noreferrer");
      } else {
        await navigator.clipboard.writeText(accessToken).catch(() => {});
        setError("EPTIM_WEBCRAFT_APP_URL not set. Token copied to clipboard.");
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
        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 dark:border-violet-700/40 dark:bg-violet-950/30 dark:hover:bg-violet-900/40 px-2.5 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 transition-colors"
      >
        <Globe className="h-3.5 w-3.5" />
        Eptim Webcraft
      </button>
    );
  }

  // Expanded inline panel
  return (
    <div className="w-full mt-2 rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/60 dark:bg-violet-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-violet-100/60 dark:bg-violet-900/30 border-b border-violet-200 dark:border-violet-800/30">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Eptim Webcraft</span>
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
            {/* Status */}
            <div className="rounded-lg bg-white dark:bg-zinc-900 px-2.5 py-2 text-[11px]">
              <p className="text-zinc-500 mb-0.5">Akaun Pelajar</p>
              <p className={`font-medium ${status.registered || status.userExists ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                {status.registered ? "Berdaftar" : status.userExists === false ? "Belum daftar" : "—"}
              </p>
              {status.registered && status.webcraftUserId && (
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{status.webcraftUserId}</p>
              )}
            </div>

            {/* Register button */}
            {!status.registered && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRegister}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                Daftar Akaun Webcraft
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
                Log Masuk ke Webcraft
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
