"use client";

import { useState } from "react";
import { BookOpen, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EptimEduLoginButton({ teamId }: { teamId: string }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/participant/bengkel/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
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
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="gap-2 w-full sm:w-auto border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <BookOpen className="h-3.5 w-3.5" />}
        Bengkel MT (EptimEdu)
        {!loading && <ExternalLink className="h-3 w-3 opacity-60" />}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
