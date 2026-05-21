"use client";

import { useState } from "react";
import {
  Sparkles, Loader2, CheckCircle2, XCircle,
  ChevronLeft, AlertTriangle, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ParsedRow } from "@/app/api/v2/organizer/competitions/ai-import/route";

// ── Editable row (extends ParsedRow with UI state) ──────────────────────────

type EditableRow = ParsedRow & {
  editCode: string;
  editName: string;
  skip: boolean;
};

type RowResult = { ok: boolean; message: string };

// ── Small badge ─────────────────────────────────────────────────────────────

function MatchBadge({ matched, original, resolved }: { matched: boolean; original: string; resolved: string | null }) {
  if (matched) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 max-w-[130px] truncate" title={resolved ?? ""}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />{resolved}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 max-w-[130px] truncate" title={original}>
      <AlertTriangle className="h-3 w-3 shrink-0" />{original || "—"}
    </span>
  );
}

// ── Main dialog ──────────────────────────────────────────────────────────────

export function AIImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<"input" | "confirm" | "importing" | "done">("input");
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0);

  // ── Phase 1: parse ─────────────────────────────────────────────────────────

  async function handleParse() {
    if (!input.trim()) return;
    setParsing(true); setParseError("");
    try {
      const res = await fetch("/api/v2/organizer/competitions/ai-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal menguraikan input.");
      setRows(
        (j.rows as ParsedRow[]).map(r => ({
          ...r,
          editCode: r.code,
          editName: r.competition,
          skip: r.duplicate,
        }))
      );
      setPhase("confirm");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Ralat tidak diketahui.");
    } finally {
      setParsing(false);
    }
  }

  // ── Phase 2 → 3: import ────────────────────────────────────────────────────

  async function handleImport() {
    const toImport = rows.filter(r => !r.skip);
    if (toImport.length === 0) return;
    setPhase("importing"); setProgress(0); setResults([]);
    const newResults: RowResult[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const r = toImport[i];
      try {
        const res = await fetch("/api/v2/organizer/competitions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code:                         r.editCode.toUpperCase(),
            name:                         r.editName,
            themeId:                      r.resolvedThemeId,
            targetGroupIds:               r.resolvedTargetGroupId ? [r.resolvedTargetGroupId] : [],
            participationType:            "INDIVIDUAL",
            minTeamSize:                  1,
            maxTeamSize:                  1,
            maxParticipantsPerContingent: 0,
            maxTotalParticipants:         0,
          }),
        });
        if (res.ok) {
          newResults.push({ ok: true, message: "Berjaya" });
        } else {
          const j = await res.json();
          newResults.push({ ok: false, message: j.error === "CODE_TAKEN" ? "Kod sudah wujud" : (j.error ?? "Gagal") });
        }
      } catch {
        newResults.push({ ok: false, message: "Ralat rangkaian" });
      }
      setProgress(i + 1);
      setResults([...newResults]);
    }

    setPhase("done");
    onImported();
  }

  const toImportCount = rows.filter(r => !r.skip).length;
  const skippedCount  = rows.filter(r => r.skip).length;
  const successCount  = results.filter(r => r.ok).length;
  const failCount     = results.filter(r => !r.ok).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={phase === "input" || phase === "done" ? onClose : undefined} />

      <div className={cn(
        "relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden",
        phase === "confirm" || phase === "importing" || phase === "done"
          ? "w-full max-w-4xl mx-4 max-h-[90vh]"
          : "w-full max-w-lg mx-4",
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-800">Import Pertandingan dengan AI</p>
            <p className="text-[11px] text-zinc-500">
              {phase === "input"    && "Tampal teks bebas atau JSON senarai pertandingan"}
              {phase === "confirm"  && `${rows.length} baris ditemui — semak sebelum mencipta`}
              {phase === "importing"&& `Mengimport… ${progress}/${toImportCount}`}
              {phase === "done"     && `Selesai — ${successCount} berjaya, ${failCount} gagal`}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
        </div>

        {/* ── Phase 1: Input ───────────────────────────────────────── */}
        {phase === "input" && (
          <div className="p-5 space-y-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={12}
              placeholder={`Tampal teks bebas atau JSON, contoh:\n[\n  {\n    "Record no": 1,\n    "Theme": "KETERANGKUMAN MALAYSIA MADANI",\n    "Code": "1.1K",\n    "Competition": "Cabaran Mencipta Robot (PPKI)",\n    "Target Group": "Kanak-Kanak"\n  }\n]`}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {parseError && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <XCircle className="h-3.5 w-3.5 shrink-0" />{parseError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Batal</Button>
              <Button size="sm" onClick={handleParse} disabled={parsing || !input.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {parsing ? "Mengurai…" : "Urai dengan AI"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase 2: Confirm ─────────────────────────────────────── */}
        {phase === "confirm" && (
          <>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-zinc-50 border-b z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium w-8">#</th>
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium w-28">Kod</th>
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium">Nama Pertandingan</th>
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium w-40">Tema</th>
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium w-40">Kumpulan Sasaran</th>
                    <th className="px-3 py-2 text-center text-zinc-500 font-medium w-16">Langkau</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn(
                      "border-b last:border-0",
                      r.skip ? "opacity-40 bg-zinc-50" : "hover:bg-slate-50"
                    )}>
                      <td className="px-3 py-2 text-zinc-400">{r.recordNo}</td>
                      <td className="px-3 py-2">
                        <Input
                          value={r.editCode}
                          onChange={e => setRows(prev => prev.map((p, j) => j === i ? { ...p, editCode: e.target.value.toUpperCase() } : p))}
                          disabled={r.skip}
                          className={cn("h-6 text-xs font-mono px-2", r.duplicate && !r.skip && "border-amber-300 bg-amber-50")}
                        />
                        {r.duplicate && !r.skip && (
                          <span className="text-[9px] text-amber-600">Kod sudah wujud</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={r.editName}
                          onChange={e => setRows(prev => prev.map((p, j) => j === i ? { ...p, editName: e.target.value } : p))}
                          disabled={r.skip}
                          className="h-6 text-xs px-2"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MatchBadge
                          matched={!!r.resolvedThemeId}
                          original={r.theme}
                          resolved={r.resolvedThemeName}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MatchBadge
                          matched={!!r.resolvedTargetGroupId}
                          original={r.targetGroup}
                          resolved={r.resolvedTargetGroupName}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setRows(prev => prev.map((p, j) => j === i ? { ...p, skip: !p.skip } : p))}
                          className={cn(
                            "w-5 h-5 rounded flex items-center justify-center mx-auto transition-colors",
                            r.skip ? "bg-zinc-200 text-zinc-400 hover:bg-zinc-300" : "hover:bg-zinc-100 text-zinc-300 hover:text-zinc-500"
                          )}
                          title={r.skip ? "Masukkan semula" : "Langkau baris ini"}
                        >
                          <SkipForward className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary bar */}
            <div className="border-t px-5 py-3 bg-zinc-50 flex items-center justify-between gap-4">
              <div className="text-xs text-zinc-500 flex items-center gap-4">
                <span><span className="font-semibold text-zinc-700">{toImportCount}</span> akan dicipta</span>
                {skippedCount > 0 && <span className="text-zinc-400">{skippedCount} dilangkau</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPhase("input")} className="gap-1.5">
                  <ChevronLeft className="h-3.5 w-3.5" />Semak Semula
                </Button>
                <Button size="sm" onClick={handleImport} disabled={toImportCount === 0}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cipta {toImportCount} Pertandingan
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Phase 3: Importing / Done ────────────────────────────── */}
        {(phase === "importing" || phase === "done") && (
          <div className="p-5 space-y-4">
            {/* Progress bar */}
            {phase === "importing" && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Mengimport…</span>
                  <span>{progress}/{toImportCount}</span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2">
                  <div
                    className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${toImportCount > 0 ? (progress / toImportCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Per-row results */}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {rows.filter(r => !r.skip).map((r, i) => {
                const res = results[i];
                return (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                    {!res ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-200 shrink-0" />
                    ) : res.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="font-mono text-zinc-500 shrink-0 w-20 truncate">{r.editCode}</span>
                    <span className="flex-1 truncate text-zinc-700">{r.editName}</span>
                    {res && !res.ok && (
                      <span className="text-[10px] text-red-500 shrink-0">{res.message}</span>
                    )}
                  </div>
                );
              })}
              {rows.filter(r => r.skip).length > 0 && (
                <p className="text-[10px] text-zinc-400 pt-1">{rows.filter(r => r.skip).length} baris dilangkau.</p>
              )}
            </div>

            {phase === "done" && (
              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={onClose}>Tutup</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
