"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export function OrganizerPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword]               = useState("");
  const [confirm, setConfirm]                 = useState("");
  const [error, setError]                     = useState("");
  const [success, setSuccess]                 = useState(false);
  const [loading, setLoading]                 = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(false);
    if (password !== confirm) { setError("Kata laluan baharu tidak sepadan."); return; }
    if (password.length < 8)  { setError("Kata laluan mestilah sekurang-kurangnya 8 aksara."); return; }
    setError(""); setLoading(true);

    const res = await fetch("/api/v2/auth/organizer/password/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, currentPassword }),
    });

    setLoading(false);

    if (!res.ok) {
      const j = await res.json();
      setError(j.error?.message ?? "Gagal menukar kata laluan.");
      return;
    }

    setSuccess(true);
    setCurrentPassword(""); setPassword(""); setConfirm("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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
        <p className="text-xs text-muted-foreground">Sekurang-kurangnya 8 aksara.</p>
      </div>
      <div className="space-y-1.5">
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

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Kata laluan berjaya dikemas kini.
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Menyimpan…" : "Kemas Kini Kata Laluan"}
      </Button>
    </form>
  );
}
