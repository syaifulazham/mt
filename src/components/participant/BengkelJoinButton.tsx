"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";

type Props = {
  hasAccount: boolean;
};

// ── Standalone SSO login button (used when account already exists) ────────────

export function BengkelLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/v2/participant/bengkel/signin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ralat.");
      window.open(data.loginUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ralat rangkaian.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleLogin}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-60 text-sm font-medium px-4 py-2 transition-colors dark:text-zinc-100"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <ExternalLink className="h-3.5 w-3.5" />}
        Buka Eptim Education LMS
      </button>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

export function BengkelJoinButton({ hasAccount }: Props) {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<{ username: string; enrolled: number } | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleJoin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/participant/bengkel/join", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "NO_IC") setError("Nombor IC anda tidak ditemui dalam rekod. Sila hubungi pengurus kontingen.");
        else setError(data.error ?? "Ralat semasa menyertai LMS.");
        return;
      }
      setResult(data);
    } catch {
      setError("Ralat rangkaian. Sila cuba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
          <CheckCircle2 className="h-5 w-5" />
          {result.enrolled > 0
            ? `Berjaya! Didaftarkan ke ${result.enrolled} kursus.`
            : "Akaun LMS sedia ada. Pendaftaran kursus dikemaskini."}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ID Pengguna LMS: <span className="font-mono font-semibold">{result.username}</span>
        </p>
        <BengkelLoginButton />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={handleJoin}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 transition-colors"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BookOpen className="h-4 w-4" />
        )}
        {hasAccount ? "Daftar Kursus Baharu" : "Sertai Bengkel"}
      </button>

      {!hasAccount && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Akaun LMS akan dicipta secara automatik menggunakan nombor IC anda sebagai ID pengguna.
        </p>
      )}
    </div>
  );
}
