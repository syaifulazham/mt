"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Switches international registration on for this event, then reloads the page into the registration tool. */
export function OpenInternationalButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function open() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/v2/organizer/events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowInternational: true }),
    }).catch(() => null);
    if (!res?.ok) { setBusy(false); setErr("Gagal membuka. Cuba lagi."); return; }
    router.refresh();
  }
  return (
    <div className="space-y-1">
      <Button onClick={open} disabled={busy} className="gap-1.5 bg-sky-600 hover:bg-sky-700">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} Buka penyertaan antarabangsa untuk acara ini
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
