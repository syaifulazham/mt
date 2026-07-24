"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  LayoutList,
  Loader2,
  Printer,
} from "lucide-react";

interface Props {
  eventId: string;
}

export function FinalProgramExportButtons({ eventId }: Props) {
  const [loading, setLoading] = useState<"xlsx-single" | "xlsx-multi" | "docx" | null>(null);
  const [showXlsxModal, setShowXlsxModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showDropdown]);

  async function download(type: "xlsx" | "docx", mode?: "single" | "multi") {
    const key = type === "xlsx" ? (`xlsx-${mode}` as "xlsx-single" | "xlsx-multi") : "docx";
    setLoading(key);
    setShowXlsxModal(false);
    setShowDropdown(false);
    try {
      const qs = mode ? `?mode=${mode}` : "";
      const res = await fetch(
        `/api/v2/organizer/events/${eventId}/reports/final-program/${type}${qs}`
      );
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
        {/* Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown((v) => !v)}
            disabled={!!loading}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Unduh / Cetak
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showDropdown ? "rotate-180" : ""}`}
            />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-2xl border border-slate-200 z-30 overflow-hidden">
              <div className="bg-slate-900 px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Format Laporan
                </p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { setShowDropdown(false); setShowXlsxModal(true); }}
                  disabled={!!loading}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 text-left text-sm text-slate-700 transition-colors disabled:opacity-50"
                >
                  {isXlsxLoading
                    ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                    : <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />}
                  Excel (XLSX)
                </button>
                <button
                  onClick={() => download("docx")}
                  disabled={!!loading}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 text-left text-sm text-slate-700 transition-colors disabled:opacity-50"
                >
                  {loading === "docx"
                    ? <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                    : <FileText className="w-4 h-4 text-blue-600 shrink-0" />}
                  Word (DOCX)
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => { setShowDropdown(false); window.print(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 text-left text-sm text-slate-700 transition-colors"
                >
                  <Printer className="w-4 h-4 text-slate-500 shrink-0" />
                  Cetak
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PDF */}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white transition-colors"
        >
          <FileDown className="w-4 h-4" />
          PDF
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
            <div className="bg-slate-900 px-5 py-4">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">
                Excel Export
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white leading-tight mt-0.5">
                Pilih Format Laporan
              </p>
            </div>
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
