"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Loader2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "./DeleteDialog";

type School = {
  id: string;
  name: string;
  code: string;
  ppdCode: string | null;
  level: string;
  category: string;
  isActive: boolean;
  stateId: string;
  zoneId: string | null;
  districtId: string | null;
  state: { id: string; name: string };
  zone: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
};

const LEVELS = ["PRIMARY", "SECONDARY", "SPECIAL"];
const CATEGORIES = ["KEBANGSAAN", "KEBANGSAAN_CINA", "KEBANGSAAN_TAMIL", "AGAMA", "TEKNIK", "SPORT", "PRIVATE", "LAIN_LAIN"];

const LEVEL_COLORS: Record<string, string> = {
  PRIMARY: "bg-blue-50 text-blue-700",
  SECONDARY: "bg-purple-50 text-purple-700",
  SPECIAL: "bg-orange-50 text-orange-700",
};

const PAGE_SIZE = 20;

export function SchoolsTab() {
  const [states, setStates]       = useState<{ id: string; name: string }[]>([]);
  const [data, setData]           = useState<School[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [loading, setLoading]     = useState(false);

  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<School | null>(null);
  const [form, setForm]           = useState({ name: "", code: "", ppdCode: "", stateId: "", zoneId: "", districtId: "", level: "PRIMARY", category: "KEBANGSAAN" });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [csvRows, setCsvRows]       = useState<Record<string, string>[]>([]);
  const [importing, setImporting]   = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: { code: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then((r) => r.json())
      .then((j) => setStates(j.data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
    if (stateFilter) params.set("stateId", stateFilter);
    if (levelFilter) params.set("level", levelFilter);
    const res = await fetch(`/api/v2/organizer/reference-data/schools?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q, stateFilter, levelFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", code: "", ppdCode: "", stateId: stateFilter || "", zoneId: "", districtId: "", level: "PRIMARY", category: "KEBANGSAAN" });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(s: School) {
    setEditing(s);
    setForm({ name: s.name, code: s.code, ppdCode: s.ppdCode ?? "", stateId: s.stateId, zoneId: s.zoneId ?? "", districtId: s.districtId ?? "", level: s.level, category: s.category });
    setFormError("");
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim() || !form.stateId || !form.level || !form.category) {
      setFormError("Name, code, state, level and category are required.");
      return;
    }
    setSaving(true); setFormError("");
    try {
      const url = editing
        ? `/api/v2/organizer/reference-data/schools/${editing.id}`
        : `/api/v2/organizer/reference-data/schools`;
      const method = editing ? "PATCH" : "POST";
      const body = { ...form, ppdCode: form.ppdCode || undefined, zoneId: form.zoneId || undefined, districtId: form.districtId || undefined };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error === "CODE_TAKEN" ? "School code already exists." : j.error); }
      setFormOpen(false);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/reference-data/schools/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: school has contingents." : j.error); }
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
      const res = await fetch("/api/v2/organizer/reference-data/schools/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: csvRows }),
      });
      const json = await res.json();
      setImportResult(json);
      load();
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const csv = "name,code,ppdCode,state,level,category\nSekolah Kebangsaan Contoh,SKC1234,,Selangor,PRIMARY,KEBANGSAAN";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "schools_template.csv"; a.click();
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All states</option>
          {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setCsvRows([]); setImportResult(null); setImportOpen(true); }}><Upload className="h-4 w-4 mr-1" />Import CSV</Button>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add School</Button>
      </div>

      <div className="rounded-md border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Code</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Level</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Category</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">State</th>
              <th className="px-3 py-2 text-center font-medium text-zinc-600">Active</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && data.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-400">No schools found.</td></tr>}
            {!loading && data.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-3 py-2 max-w-[220px] truncate">{s.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[s.level] ?? ""}`}>{s.level}</span>
                </td>
                <td className="px-3 py-2 text-zinc-500 text-xs">{s.category.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-zinc-500">{s.state.name}</td>
                <td className="px-3 py-2 text-center">{s.isActive ? <span className="text-green-600">✓</span> : <span className="text-zinc-300">—</span>}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(s)} className="p-1 rounded hover:bg-zinc-100"><Pencil className="h-3.5 w-3.5 text-zinc-500" /></button>
                    <button onClick={() => setDeleteTarget(s)} className="p-1 rounded hover:bg-zinc-100"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-zinc-500">
          <span>{total} schools</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit School" : "Add School"}</DialogTitle></DialogHeader>
          <div className="px-6 grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>School Code</Label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="mt-1 font-mono" /></div>
            <div><Label>PPD Code (optional)</Label><Input value={form.ppdCode} onChange={(e) => setForm(f => ({ ...f, ppdCode: e.target.value }))} className="mt-1 font-mono" /></div>
            <div>
              <Label>Level</Label>
              <select value={form.level} onChange={(e) => setForm(f => ({ ...f, level: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label>State</Label>
              <select value={form.stateId} onChange={(e) => setForm(f => ({ ...f, stateId: e.target.value }))} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select state…</option>
                {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {editing && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={(editing as School & { isActive?: boolean }).isActive} onChange={(e) => setEditing(ed => ed ? { ...ed, isActive: e.target.checked } : ed)} />
                <Label htmlFor="isActive">Active</Label>
              </div>
            )}
          </div>
          {formError && <p className="text-sm text-red-500 px-6">{formError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => !v && setImportOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import Schools from CSV</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" />Download Template</Button>
              <span className="text-xs text-zinc-400">CSV columns: name, code, ppdCode, state, level, category</span>
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-zinc-50"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-zinc-300 mb-2" />
              <p className="text-sm text-zinc-500">{csvRows.length > 0 ? `${csvRows.length} rows loaded` : "Click to choose CSV file"}</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
            {csvRows.length > 0 && (
              <div className="text-sm text-zinc-600 bg-zinc-50 rounded p-3">
                <p className="font-medium mb-1">Preview (first 3 rows):</p>
                {csvRows.slice(0, 3).map((r, i) => (
                  <p key={i} className="font-mono text-xs truncate">{r.code} — {r.name} ({r.level})</p>
                ))}
                {csvRows.length > 3 && <p className="text-zinc-400">…and {csvRows.length - 3} more</p>}
              </div>
            )}
            {importResult && (
              <div className="text-sm">
                <p className="text-green-600 font-medium">✓ {importResult.created} schools imported</p>
                {importResult.skipped.length > 0 && (
                  <div className="mt-1 text-red-500">
                    <p>{importResult.skipped.length} skipped:</p>
                    {importResult.skipped.slice(0, 5).map((s, i) => <p key={i} className="font-mono text-xs">{s.code}: {s.reason}</p>)}
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
        description="This will permanently remove the school record."
      />
    </div>
  );
}
