"use client";

import { useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = "idle" | "pushing" | "ok" | "err";

export function PushKbButton({ entityType, label = "Push to KB" }: { entityType: string; label?: string }) {
  const [state, setState] = useState<State>("idle");

  async function push() {
    setState("pushing");
    try {
      const res = await fetch("/api/v2/organizer/knowledge-base/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType }),
      });
      setState(res.ok ? "ok" : "err");
    } catch {
      setState("err");
    }
    setTimeout(() => setState("idle"), 3000);
  }

  const icon =
    state === "pushing" ? <Loader2 className="h-4 w-4 animate-spin" /> :
    state === "ok"      ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
    state === "err"     ? <XCircle className="h-4 w-4 text-red-500" /> :
                          <UploadCloud className="h-4 w-4" />;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={push}
      disabled={state === "pushing"}
      title={`Push ${label} to Knowledge Base`}
    >
      {icon}
      <span className="ml-1.5">{state === "ok" ? "Pushed!" : state === "err" ? "Failed" : label}</span>
    </Button>
  );
}
