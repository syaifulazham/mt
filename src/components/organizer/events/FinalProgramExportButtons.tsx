"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, LayoutList, Layers } from "lucide-react";

interface Props {
  eventId: string;
}

export function FinalProgramExportButtons({ eventId }: Props) {
  const [loading, setLoading] = useState<"xlsx-single" | "xlsx-multi" | "docx" | null>(null);
  const [showXlsxModal, setShowXlsxModal] = useState(false);

  async function download(type: "xlsx" | "docx", mode?: "single" | "multi") {
    const key = type === "xlsx" ? (`xlsx-${mode}` as "xlsx-single" | "xlsx-multi") : "docx";
    setLoading(key);
    setShowXlsxModal(false);
    try {
      const qs = mode ? `?mode=${mode}` : "";
      const res = await fetch(`/api/v2/organizer/events/${eventId}/reports/final-program/${type}${qs}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `laporan-akhir-program.${type}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(null);
    }
  }

  const isXlsxLoading = loading === "xlsx-single" || loading === "xlsx-multi";

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowXlsxModal(true)}
          disabled={!!loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors disabled:opacity-50"
        >
          {isXlsxLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          Excel (XLSX)
        </button>
        <button
          onClick={() => download("docx")}
          disabled={!!loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors disabled:opacity-50"
        >
          {loading === "docx" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          Word (DOCX)
        </button>
      </div>

      {/* XLSX format modal */}
      {showXlsxModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowXlsxModal(false)}
        >
          <div
            className="w-80 overflow-hidden rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tabloid masthead */}
            <div className="bg-slate-900 px-5 py-4">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Excel Export
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white leading-tight mt-0.5">
                Pilih Format Laporan
              </p>
            </div>

            {/* Options */}
            <div className="bg-white p-4 space-y-2">
              <button
                onClick={() => download("xlsx", "single")}
                className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="mt-0.5 p-1.5 rounded bg-slate-100 group-hover:bg-slate-200 transition-colors shrink-0">
                  <LayoutList className="w-4 h-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Single Sheet</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                    Semua bahagian dalam satu lembaran kerja
                  </p>
                </div>
              </button>

              <button
                onClick={() => download("xlsx", "multi")}
                className="w-full flex items-start gap-3 p-3 rounded-md hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="mt-0.5 p-1.5 rounded bg-slate-100 group-hover:bg-slate-200 transition-colors shrink-0">
                  <Layers className="w-4 h-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Multiple Sheets</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                    Setiap bahagian dalam lembaran berasingan
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
