"use client";

import { useState } from "react";
import Image from "next/image";

export default function ParticipantSignInPage() {
  const [ic, setIc]           = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedIc  = ic.trim();
    const trimmedPw  = password.trim();
    if (!trimmedIc) { setError("Sila masukkan nombor IC."); return; }
    if (!trimmedPw) { setError("Sila masukkan kata laluan."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/participant/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ic: trimmedIc, password: trimmedPw }),
      });

      if (res.ok) {
        window.location.href = "/participant/profile";
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setError("Nombor IC tidak dijumpai. Sila semak dengan pengurus kontingen anda.");
      } else if (res.status === 403 || body.error === "NO_PASSWORD") {
        setError("Kata laluan belum dijana. Sila hubungi pengurus kontingen anda.");
      } else if (res.status === 401 || body.error === "INVALID_PASSWORD") {
        setError("Kata laluan tidak betul. Sila cuba lagi.");
      } else if (res.status === 400) {
        setError("Sila isi semua medan.");
      } else {
        setError("Ralat tidak dijangka. Sila cuba lagi.");
      }
    } catch {
      setError("Ralat rangkaian. Sila cuba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/logo-mt.svg"
            alt="Malaysia Techlympics"
            width={140}
            height={80}
            priority
            style={{ height: 56, width: "auto" }}
          />
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Masuk sebagai Peserta
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Malaysia Techlympics 2026
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* IC */}
          <div className="space-y-1.5">
            <label
              htmlFor="ic"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Nombor Kad Pengenalan
            </label>
            <input
              id="ic"
              type="text"
              inputMode="numeric"
              value={ic}
              onChange={(e) => { setError(null); setIc(e.target.value); }}
              placeholder="cth: 010101012345"
              autoComplete="username"
              autoFocus
              disabled={loading}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Kata Laluan
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setError(null); setPassword(e.target.value); }}
              placeholder="Kata laluan"
              autoComplete="current-password"
              disabled={loading}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
            />
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Kata laluan awal: 2 huruf pertama nama + 6 digit pertama IC
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3.5 py-2.5">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sedang masuk…
              </span>
            ) : (
              "Log Masuk"
            )}
          </button>
        </form>

        {/* Footer hint */}
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Sekiranya anda menghadapi masalah, sila hubungi pengurus kontingen anda.
        </p>
      </div>
    </div>
  );
}
