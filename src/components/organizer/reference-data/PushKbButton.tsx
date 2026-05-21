"use client";

import { useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, XCircle } from "lucide-react";

type State = "idle" | "pushing" | "ok" | "err";

export function PushKbButton({ entityType, label = "Knowledge Base" }: { entityType: string; label?: string }) {
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
    state === "ok"      ? <CheckCircle2 className="h-4 w-4" /> :
    state === "err"     ? <XCircle className="h-4 w-4" /> :
                          <UploadCloud className="h-4 w-4" />;

  const title =
    state === "ok"  ? `${label} pushed to Knowledge Base` :
    state === "err" ? "Push failed — try again" :
                     `Push ${label} to Knowledge Base`;

  return (
    <button
      onClick={push}
      disabled={state === "pushing"}
      title={title}
      className={[
        "flex items-center justify-center w-9 h-9 rounded-full shadow-md transition-colors disabled:opacity-60",
        state === "ok"  ? "bg-emerald-500 text-white hover:bg-emerald-600" :
        state === "err" ? "bg-red-500 text-white hover:bg-red-600" :
                          "bg-green-600 text-white hover:bg-green-700",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}
