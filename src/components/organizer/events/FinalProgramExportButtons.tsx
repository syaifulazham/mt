"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

interface Props {
  eventId: string;
}

export function FinalProgramExportButtons({ eventId }: Props) {
  const [loading, setLoading] = useState<"xlsx" | "docx" | null>(null);

  async function download(type: "xlsx" | "docx") {
    setLoading(type);
    try {
      const res = await fetch(`/api/v2/organizer/events/${eventId}/reports/final-program/${type}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
        ?? `laporan-akhir-program.${type}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => download("xlsx")}
        disabled={!!loading}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors disabled:opacity-50"
      >
        {loading === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
        Excel (XLSX)
      </button>
      <button
        onClick={() => download("docx")}
        disabled={!!loading}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors disabled:opacity-50"
      >
        {loading === "docx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Word (DOCX)
      </button>
    </div>
  );
}
