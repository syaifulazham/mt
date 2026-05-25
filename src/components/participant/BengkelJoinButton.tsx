"use client";

import { useState } from "react";
import { BookOpen, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type Props = {
  hasAccount: boolean;
  lmsBaseUrl: string;
};

export function BengkelJoinButton({ hasAccount, lmsBaseUrl }: Props) {
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
        {lmsBaseUrl && (
          <a
            href={lmsBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Pergi ke Eptim Education LMS
          </a>
        )}
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
