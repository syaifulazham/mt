"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkshopParticipant } from "@/lib/workshopStats";

export function DownloadParticipantsButton({ courseId, title, competitions, disabled }: {
  courseId: string;
  title: string;
  competitions: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/organizer/workshops/${encodeURIComponent(courseId)}/participants`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      const { exportWorkshopParticipantsExcel } = await import("@/lib/export/workshopParticipantsExport");
      await exportWorkshopParticipantsExcel({ title, competitions, participants: (j?.data ?? []) as WorkshopParticipant[] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={download} disabled={busy || disabled}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Download participants (XLSX)
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
