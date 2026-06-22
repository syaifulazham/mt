"use client";

import { useState } from "react";
import { BookOpen, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EptimEduLoginButton({
  teamId,
  eventId,
}: {
  teamId: string;
  eventId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/participant/bengkel/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, eventId }),
      });
      const text = await res.text();
      let json: { loginUrl?: string; error?: string } = {};
      try { json = JSON.parse(text); } catch { throw new Error("Ralat sambungan — sila cuba lagi"); }
      if (!res.ok) throw new Error(json.error ?? "Gagal log masuk");
      window.open(json.loginUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal log masuk");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 whitespace-nowrap"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <BookOpen className="h-3.5 w-3.5" />}
        Bengkel MT
        {!loading && <ExternalLink className="h-3 w-3 opacity-60" />}
      </Button>
      {error && <p className="text-xs text-red-500 max-w-48 text-right">{error}</p>}
    </div>
  );
}
