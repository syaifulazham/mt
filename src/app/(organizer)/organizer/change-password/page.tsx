"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePasswordPage() {
  const { data: session, update } = useSession();
  const isForced = (session?.user as { forcePasswordChange?: boolean })?.forcePasswordChange === true;

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword]               = useState("");
  const [confirm, setConfirm]                 = useState("");
  const [error, setError]                     = useState("");
  const [success, setSuccess]                 = useState(false);
  const [loading, setLoading]                 = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Kata laluan baharu tidak sepadan."); return; }
    if (password.length < 8)  { setError("Kata laluan mestilah sekurang-kurangnya 8 aksara."); return; }
    setError(""); setLoading(true);

    const body: Record<string, string> = { password };
    if (!isForced) body.currentPassword = currentPassword;

    const res = await fetch("/api/v2/auth/organizer/password/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const j = await res.json();
      setError(j.error?.message ?? "Gagal menukar kata laluan.");
      return;
    }

    if (isForced) {
      await update({ forcePasswordChange: false });
      window.location.replace("/organizer/dashboard");
    } else {
      setSuccess(true);
      setCurrentPassword(""); setPassword(""); setConfirm("");
    }
  }

  return (
    <div className={isForced ? "min-h-screen flex items-center justify-center bg-zinc-50" : "p-8 max-w-md"}>
      <div className={`space-y-6 rounded-xl border bg-white p-8 shadow-sm ${isForced ? "w-full max-w-sm" : ""}`}>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">
            {isForced ? "Tetapkan kata laluan baharu" : "Tukar Kata Laluan"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isForced
              ? "Akaun anda memerlukan penukaran kata laluan sebelum meneruskan."
              : "Masukkan kata laluan semasa dan pilih kata laluan baharu."}
          </p>
        </div>

        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Kata laluan berjaya dikemas kini.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isForced && (
            <div className="space-y-1">
              <Label htmlFor="current">Kata laluan semasa</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="password">Kata laluan baharu</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm">Sahkan kata laluan baharu</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Menyimpan…" : isForced ? "Kemas kini kata laluan" : "Tukar Kata Laluan"}
          </Button>
        </form>
      </div>
    </div>
  );
}
