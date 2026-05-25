"use client";

import { useState } from "react";
import { Lock, CheckCircle2 } from "lucide-react";

export function ChangePasswordForm() {
  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!current.trim() || !next.trim() || !confirm.trim()) {
      setError("Sila isi semua medan."); return;
    }
    if (next.trim().length < 6) {
      setError("Kata laluan baru mestilah sekurang-kurangnya 6 aksara."); return;
    }
    if (next.trim() !== confirm.trim()) {
      setError("Kata laluan baru tidak sepadan."); return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v2/participant/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current.trim(), newPassword: next.trim() }),
      });

      if (res.ok) {
        setSuccess(true);
        setCurrent(""); setNext(""); setConfirm("");
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (body.error === "WRONG_CURRENT") {
        setError("Kata laluan semasa tidak betul.");
      } else if (body.error === "PASSWORD_TOO_SHORT") {
        setError("Kata laluan baru mestilah sekurang-kurangnya 6 aksara.");
      } else {
        setError("Ralat tidak dijangka. Sila cuba lagi.");
      }
    } catch {
      setError("Ralat rangkaian. Sila cuba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Lock className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <h2 className="text-base font-semibold dark:text-zinc-100">Tukar Kata Laluan</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          id="current-pw"
          label="Kata Laluan Semasa"
          value={current}
          onChange={(v) => { setError(null); setSuccess(false); setCurrent(v); }}
          disabled={saving}
          autoComplete="current-password"
        />
        <Field
          id="new-pw"
          label="Kata Laluan Baru"
          value={next}
          onChange={(v) => { setError(null); setSuccess(false); setNext(v); }}
          disabled={saving}
          autoComplete="new-password"
          hint="Sekurang-kurangnya 6 aksara"
        />
        <Field
          id="confirm-pw"
          label="Sahkan Kata Laluan Baru"
          value={confirm}
          onChange={(v) => { setError(null); setSuccess(false); setConfirm(v); }}
          disabled={saving}
          autoComplete="new-password"
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3.5 py-2.5">
            {error}
          </p>
        )}

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/40 px-3.5 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Kata laluan berjaya dikemaskini.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2 justify-center">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Menyimpan…
            </span>
          ) : (
            "Kemaskini Kata Laluan"
          )}
        </button>
      </form>
    </div>
  );
}

function Field({
  id, label, value, onChange, disabled, autoComplete, hint,
}: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; disabled: boolean;
  autoComplete?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
      />
      {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  );
}
