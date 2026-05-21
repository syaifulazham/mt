"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  Loader2, Upload, Download, Sparkles, Check, X,
  Building2, GitBranch, Globe, Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PushKbButton } from "./PushKbButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DeleteDialog } from "./DeleteDialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type HEI = {
  id: string;
  name: string;
  code: string | null;
  stateId: string | null;
  isActive: boolean;
  heiType: string;
  parentCode: string | null;
  sector: string | null;
  state: { id: string; name: string } | null;
  _count: { contingents: number };
};

type AiHEI = {
  name: string;
  code: string;
  type: "HQ" | "BRANCH";
  parentCode: string | null;
  state: string | null;
  sector: "PUBLIC" | "PRIVATE" | "FOREIGN_BRANCH";
};

// ── Sector / type badges ──────────────────────────────────────────────────────

const SECTOR_BADGE: Record<string, { label: string; className: string }> = {
  PUBLIC:         { label: "Public",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  PRIVATE:        { label: "Private",  className: "bg-purple-50 text-purple-700 border-purple-200" },
  FOREIGN_BRANCH: { label: "Foreign",  className: "bg-orange-50 text-orange-700 border-orange-200" },
};

const TYPE_BADGE: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  HQ:     { label: "HQ",     icon: Building2,  className: "bg-teal-50 text-teal-700 border-teal-200" },
  BRANCH: { label: "Branch", icon: GitBranch,  className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_BADGE[type] ?? TYPE_BADGE.HQ;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.className}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function SectorBadge({ sector }: { sector: string | null }) {
  if (!sector) return null;
  const cfg = SECTOR_BADGE[sector];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── AI Verification Dialog ────────────────────────────────────────────────────

function AiFetchDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [fetching, setFetching]       = useState(false);
  const [results, setResults]         = useState<AiHEI[]>([]);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [filter, setFilter]           = useState<"ALL" | "HQ" | "BRANCH">("ALL");
  const [sectorFilter, setSectorFilter] = useState<"ALL" | "PUBLIC" | "PRIVATE" | "FOREIGN_BRANCH">("ALL");
  const [searchQ, setSearchQ]         = useState("");
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: { name: string; reason: string }[] } | null>(null);
  const [error, setError]             = useState("");
  const [editingIdx, setEditingIdx]   = useState<number | null>(null);
  const [editBuf, setEditBuf]         = useState<Partial<AiHEI>>({});
  const [extraPrompt, setExtraPrompt] = useState("");

  function reset() {
    setFetching(false); setResults([]); setSelected(new Set());
    setFilter("ALL"); setSectorFilter("ALL"); setSearchQ("");
    setImporting(false); setImportResult(null); setError("");
    setEditingIdx(null); setExtraPrompt("");
  }

  async function handleFetch() {
    setFetching(true); setError(""); setResults([]); setSelected(new Set()); setImportResult(null);
    try {
      const res = await fetch("/api/v2/organizer/reference-data/higher-institutions/ai-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraPrompt: extraPrompt.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail ? `${j.error}: ${j.detail}` : (j.error ?? "AI fetch failed"));
      setResults(j.data ?? []);
      // Select all HQ by default
      const defaultSelected = new Set<number>();
      (j.data as AiHEI[]).forEach((inst, i) => { if (inst.type === "HQ") defaultSelected.add(i); });
      setSelected(defaultSelected);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch from AI");
    } finally {
      setFetching(false);
    }
  }

  function toggleAll(visible: number[]) {
    const allSelected = visible.every((i) => selected.has(i));
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((i) => allSelected ? next.delete(i) : next.add(i));
      return next;
    });
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function startEdit(i: number) {
    setEditingIdx(i);
    setEditBuf({ ...results[i] });
  }

  function commitEdit() {
    if (editingIdx === null) return;
    setResults((prev) => {
      const next = [...prev];
      next[editingIdx] = { ...next[editingIdx], ...editBuf } as AiHEI;
      return next;
    });
    setEditingIdx(null);
  }

  const visible = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => {
      if (filter !== "ALL" && r.type !== filter) return false;
      if (sectorFilter !== "ALL" && r.sector !== sectorFilter) return false;
      if (searchQ && !r.name.toLowerCase().includes(searchQ.toLowerCase()) &&
          !r.code.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });

  const visibleIndices = visible.map(({ i }) => i);
  const selectedCount  = [...selected].filter((i) => results[i]).length;

  const hqCount     = results.filter((r) => r.type === "HQ").length;
  const branchCount = results.filter((r) => r.type === "BRANCH").length;

  async function handleImport() {
    const rows = [...selected]
      .filter((i) => results[i])
      .map((i) => results[i]);
    if (rows.length === 0) return;

    setImporting(true); setError("");
    try {
      const res = await fetch("/api/v2/organizer/reference-data/higher-institutions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.map((r) => ({
          name:       r.name,
          code:       r.code,
          type:       r.type,
          parentCode: r.parentCode,
          state:      r.state,
          sector:     r.sector,
        })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      setImportResult(j);
      onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI Search — Malaysian Higher Institutions
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-0.5">
            Gemini searches for all registered HEIs in Malaysia. Review, edit, and select records before importing.
          </DialogDescription>
        </DialogHeader>

        {/* Extra prompt input */}
        <div className="px-6 py-3 border-b shrink-0">
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">
            Additional instructions <span className="font-normal text-zinc-400">(optional — refine what Gemini searches for)</span>
          </label>
          <textarea
            value={extraPrompt}
            onChange={(e) => setExtraPrompt(e.target.value)}
            disabled={fetching}
            rows={2}
            placeholder="e.g. Focus only on Sabah and Sarawak universities. Include all community colleges in Johor."
            className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-zinc-300 disabled:opacity-50 bg-white"
          />
        </div>

        {/* Fetch button / status bar */}
        <div className="px-6 py-3 border-b bg-zinc-50 shrink-0 flex items-center gap-3 flex-wrap">
          <Button
            onClick={handleFetch}
            disabled={fetching}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {fetching
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Searching…</>
              : <><Sparkles className="h-4 w-4" /> {results.length > 0 ? "Re-search" : "Search with Gemini"}</>}
          </Button>

          {results.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 flex-wrap">
              <span className="font-medium text-zinc-700">{results.length} institutions found</span>
              <span className="text-zinc-300">|</span>
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {hqCount} HQ</span>
              <span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> {branchCount} Branch</span>
              <span className="text-zinc-300">|</span>
              <span className="text-violet-600 font-medium">{selectedCount} selected</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-md">
              <X className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Import result banner */}
        {importResult && (
          <div className="px-6 py-3 bg-green-50 border-b border-green-200 shrink-0 flex items-center gap-3">
            <Check className="h-5 w-5 text-green-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-green-700">{importResult.created} institutions imported successfully.</span>
              {importResult.skipped.length > 0 && (
                <span className="ml-2 text-amber-600">{importResult.skipped.length} skipped (duplicate or unknown state).</span>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        {results.length > 0 && (
          <div className="px-6 py-2.5 border-b shrink-0 flex items-center gap-2 flex-wrap">
            {/* Type filter */}
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
              {(["ALL", "HQ", "BRANCH"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === f ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {f === "ALL" ? "All" : f === "HQ" ? `HQ (${hqCount})` : `Branch (${branchCount})`}
                </button>
              ))}
            </div>

            {/* Sector filter */}
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
              {(["ALL", "PUBLIC", "PRIVATE", "FOREIGN_BRANCH"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSectorFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sectorFilter === f ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {f === "ALL" ? "All sectors" : f === "FOREIGN_BRANCH" ? "Foreign" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
              <Input
                className="pl-8 h-7 text-xs"
                placeholder="Filter by name or code…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>

            <button
              onClick={() => toggleAll(visibleIndices)}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline ml-auto"
            >
              {visibleIndices.every((i) => selected.has(i)) ? "Deselect visible" : "Select visible"}
            </button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {fetching && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
              <p className="text-sm text-zinc-500">Gemini is searching the internet for Malaysian HEIs…</p>
              <p className="text-xs text-zinc-400">This may take 15–30 seconds</p>
            </div>
          )}

          {!fetching && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-8">
              <div className="rounded-full bg-violet-50 p-5">
                <Sparkles className="h-10 w-10 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-zinc-700">Search with Gemini AI</p>
                <p className="text-sm text-zinc-400 mt-1 max-w-sm">
                  Click &quot;Search with Gemini&quot; to fetch all registered Malaysian higher institutions
                  including public universities, private universities, and foreign branch campuses.
                </p>
              </div>
            </div>
          )}

          {!fetching && visible.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-50 border-b z-10">
                <tr>
                  <th className="w-10 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={visibleIndices.length > 0 && visibleIndices.every((i) => selected.has(i))}
                      onChange={() => toggleAll(visibleIndices)}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Sector</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">State</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Parent</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, i }) => {
                  const isEditing = editingIdx === i;
                  const isChecked = selected.has(i);
                  return (
                    <tr
                      key={i}
                      className={`border-b last:border-0 transition-colors ${
                        isChecked ? "bg-violet-50/40" : "hover:bg-zinc-50"
                      } ${r.type === "BRANCH" ? "opacity-90" : ""}`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(i)}
                          className="rounded accent-violet-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editBuf.code ?? ""}
                            onChange={(e) => setEditBuf((b) => ({ ...b, code: e.target.value.toUpperCase() }))}
                            className="h-7 text-xs w-24 font-mono"
                          />
                        ) : (
                          <span className="font-mono text-xs font-semibold text-zinc-700">{r.code}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[280px]">
                        {isEditing ? (
                          <Input
                            value={editBuf.name ?? ""}
                            onChange={(e) => setEditBuf((b) => ({ ...b, name: e.target.value }))}
                            className="h-7 text-xs"
                          />
                        ) : (
                          <span className={`text-xs ${r.type === "BRANCH" ? "text-zinc-600 pl-3 border-l-2 border-zinc-200" : "font-medium text-zinc-800"}`}>
                            {r.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editBuf.type ?? r.type}
                            onChange={(e) => setEditBuf((b) => ({ ...b, type: e.target.value as "HQ" | "BRANCH" }))}
                            className="h-7 rounded border text-xs px-1"
                          >
                            <option value="HQ">HQ</option>
                            <option value="BRANCH">Branch</option>
                          </select>
                        ) : (
                          <TypeBadge type={r.type} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editBuf.sector ?? r.sector ?? "PUBLIC"}
                            onChange={(e) => setEditBuf((b) => ({ ...b, sector: e.target.value as AiHEI["sector"] }))}
                            className="h-7 rounded border text-xs px-1"
                          >
                            <option value="PUBLIC">Public</option>
                            <option value="PRIVATE">Private</option>
                            <option value="FOREIGN_BRANCH">Foreign</option>
                          </select>
                        ) : (
                          <SectorBadge sector={r.sector} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {isEditing ? (
                          <Input
                            value={editBuf.state ?? ""}
                            onChange={(e) => setEditBuf((b) => ({ ...b, state: e.target.value }))}
                            className="h-7 text-xs w-28"
                          />
                        ) : (
                          r.state ?? <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        {isEditing ? (
                          <Input
                            value={editBuf.parentCode ?? ""}
                            onChange={(e) => setEditBuf((b) => ({ ...b, parentCode: e.target.value.toUpperCase() || null }))}
                            className="h-7 text-xs w-20 font-mono"
                            placeholder="—"
                          />
                        ) : (
                          r.parentCode
                            ? <span className="font-mono text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded">{r.parentCode}</span>
                            : <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button onClick={commitEdit} className="p-1 rounded text-green-600 hover:bg-green-50" title="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditingIdx(null)} className="p-1 rounded text-zinc-400 hover:bg-zinc-100" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(i)} className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!fetching && results.length > 0 && visible.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
              No institutions match the current filter.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-zinc-50 shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-zinc-400">
            {results.length > 0
              ? `${selectedCount} of ${results.length} selected for import`
              : "Search first to see results"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Close</Button>
            <Button
              onClick={handleImport}
              disabled={selectedCount === 0 || importing || importResult !== null}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {importing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                : importResult
                ? <><Check className="h-4 w-4" /> Imported</>
                : `Import ${selectedCount} Selected`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main HEITab ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function HEITab() {
  const [states, setStates]       = useState<{ id: string; name: string }[]>([]);
  const [data, setData]           = useState<HEI[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter]   = useState<"" | "HQ" | "BRANCH">("");
  const [loading, setLoading]     = useState(false);

  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<HEI | null>(null);
  const [name, setName]           = useState("");
  const [code, setCode]           = useState("");
  const [stateId, setStateId]     = useState("");
  const [heiType, setHeiType]     = useState<"HQ" | "BRANCH">("HQ");
  const [parentCode, setParentCode] = useState("");
  const [sector, setSector]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<HEI | null>(null);

  const [importOpen, setImportOpen]     = useState(false);
  const [csvRows, setCsvRows]           = useState<Record<string, string>[]>([]);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: { name: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [aiOpen, setAiOpen]       = useState(false);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then((r) => r.json())
      .then((j) => setStates(j.data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
    if (stateFilter) params.set("stateId", stateFilter);
    if (typeFilter)  params.set("heiType", typeFilter);
    const res = await fetch(`/api/v2/organizer/reference-data/higher-institutions?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q, stateFilter, typeFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null); setName(""); setCode(""); setStateId(stateFilter || "");
    setHeiType("HQ"); setParentCode(""); setSector(""); setFormError("");
    setFormOpen(true);
  }
  function openEdit(h: HEI) {
    setEditing(h); setName(h.name); setCode(h.code ?? ""); setStateId(h.stateId ?? "");
    setHeiType((h.heiType ?? "HQ") as "HQ" | "BRANCH");
    setParentCode(h.parentCode ?? ""); setSector(h.sector ?? ""); setFormError("");
    setFormOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) { setFormError("Name is required."); return; }
    setSaving(true); setFormError("");
    try {
      const url    = editing
        ? `/api/v2/organizer/reference-data/higher-institutions/${editing.id}`
        : `/api/v2/organizer/reference-data/higher-institutions`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code:       code || undefined,
          stateId:    stateId || undefined,
          heiType,
          parentCode: parentCode || undefined,
          sector:     sector || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error === "CODE_TAKEN" ? "Code already exists." : j.error);
      }
      setFormOpen(false); load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/reference-data/higher-institutions/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: institution has contingents." : j.error);
    }
    load();
  }

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const vals = line.split(",");
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? ""]));
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCsvRows(parseCsv(ev.target?.result as string)); setImportResult(null); };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (csvRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/v2/organizer/reference-data/higher-institutions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvRows }),
      });
      const json = await res.json();
      setImportResult(json); load();
    } finally { setImporting(false); }
  }

  function downloadTemplate() {
    const csv = "name,code,type,parentCode,state,sector\nUniversiti Malaya,UM,HQ,,Kuala Lumpur,PUBLIC\nUiTM Pulau Pinang,UiTM-PP,BRANCH,UiTM,Pulau Pinang,PUBLIC";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hei_template.csv"; a.click();
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  const hqCount     = data.filter((h) => h.heiType === "HQ").length;
  const branchCount = data.filter((h) => h.heiType === "BRANCH").length;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={stateFilter}
          onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All states</option>
          {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as "" | "HQ" | "BRANCH"); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All types</option>
          <option value="HQ">HQ only</option>
          <option value="BRANCH">Branch only</option>
        </select>

        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or code…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          onClick={() => setAiOpen(true)}
        >
          <Sparkles className="h-4 w-4" /> AI Search
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setCsvRows([]); setImportResult(null); setImportOpen(true); }}>
          <Upload className="h-4 w-4 mr-1" /> Import CSV
        </Button>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add HEI
        </Button>
        <PushKbButton entityType="reference/higher-institutions" label="HEIs" />
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Code</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Type</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Sector</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">State</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Parent</th>
              <th className="px-3 py-2 text-center font-medium text-zinc-600">Contingents</th>
              <th className="px-3 py-2 text-center font-medium text-zinc-600">Active</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-zinc-400">
                  No higher institutions found.
                </td>
              </tr>
            )}
            {!loading && data.map((h) => (
              <tr key={h.id} className={`border-b last:border-0 hover:bg-zinc-50 ${h.heiType === "BRANCH" ? "bg-zinc-50/50" : ""}`}>
                <td className="px-3 py-2 max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    {h.heiType === "BRANCH" && <span className="w-2 shrink-0 border-l-2 border-zinc-200 h-4" />}
                    <span className="truncate text-xs">{h.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-zinc-700">{h.code ?? "—"}</td>
                <td className="px-3 py-2"><TypeBadge type={h.heiType ?? "HQ"} /></td>
                <td className="px-3 py-2"><SectorBadge sector={h.sector} /></td>
                <td className="px-3 py-2 text-xs text-zinc-500">{h.state?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">
                  {h.parentCode
                    ? <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">{h.parentCode}</span>
                    : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center text-zinc-500 text-xs">{h._count.contingents}</td>
                <td className="px-3 py-2 text-center">
                  {h.isActive ? <span className="text-green-600 text-xs">✓</span> : <span className="text-zinc-300 text-xs">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(h)} className="p-1 rounded hover:bg-zinc-100" title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                    <button onClick={() => setDeleteTarget(h)} className="p-1 rounded hover:bg-zinc-100" title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination + summary */}
      <div className="flex items-center justify-between mt-3 text-sm text-zinc-500">
        <span>
          {total} institution{total !== 1 ? "s" : ""}
          {total > 0 && <span className="ml-2 text-zinc-400 text-xs">({hqCount} HQ · {branchCount} Branch)</span>}
        </span>
        {pages > 1 && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── AI Search Dialog ────────────────────────────── */}
      <AiFetchDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onImported={load}
      />

      {/* ── Add/Edit Dialog ─────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Institution" : "Add Higher Institution"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 font-mono" placeholder="e.g. UTM" />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={heiType}
                  onChange={(e) => setHeiType(e.target.value as "HQ" | "BRANCH")}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="HQ">HQ</option>
                  <option value="BRANCH">Branch</option>
                </select>
              </div>
            </div>
            {heiType === "BRANCH" && (
              <div>
                <Label>Parent Code</Label>
                <Input
                  value={parentCode}
                  onChange={(e) => setParentCode(e.target.value.toUpperCase())}
                  className="mt-1 font-mono"
                  placeholder="e.g. UTM"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sector</Label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Select —</option>
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private</option>
                  <option value="FOREIGN_BRANCH">Foreign Branch</option>
                </select>
              </div>
              <div>
                <Label>State (optional)</Label>
                <select
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No state</option>
                  {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ───────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(v) => !v && setImportOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Higher Institutions from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" /> Download Template
              </Button>
              <span className="text-xs text-zinc-400">name, code, type, parentCode, state, sector</span>
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-zinc-50"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-zinc-300 mb-2" />
              <p className="text-sm text-zinc-500">
                {csvRows.length > 0 ? `${csvRows.length} rows loaded` : "Click to choose CSV file"}
              </p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
            {csvRows.length > 0 && (
              <div className="text-sm text-zinc-600 bg-zinc-50 rounded p-3">
                <p className="font-medium mb-1">Preview (first 3 rows):</p>
                {csvRows.slice(0, 3).map((r, i) => (
                  <p key={i} className="font-mono text-xs truncate">
                    {r.code || "(no code)"} [{r.type || "HQ"}] — {r.name}
                  </p>
                ))}
                {csvRows.length > 3 && <p className="text-zinc-400">…and {csvRows.length - 3} more</p>}
              </div>
            )}
            {importResult && (
              <div className="text-sm">
                <p className="text-green-600 font-medium">✓ {importResult.created} institutions imported</p>
                {importResult.skipped.length > 0 && (
                  <div className="mt-1 text-red-500">
                    <p>{importResult.skipped.length} skipped:</p>
                    {importResult.skipped.slice(0, 5).map((s, i) => (
                      <p key={i} className="font-mono text-xs">{s.name}: {s.reason}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button>
            <Button onClick={handleImport} disabled={csvRows.length === 0 || importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {csvRows.length > 0 ? `${csvRows.length} rows` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will permanently remove the institution record."
      />
    </div>
  );
}
