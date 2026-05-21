"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { PushKbButton } from "./PushKbButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "./DeleteDialog";

// ─── types ────────────────────────────────────────────────────────────────────

type State = { id: string; name: string; code: string; _count: { schools: number; higherInstitutions: number } };
type ZoneStateEntry = { state: { id: string; name: string } };
type Zone  = { id: string; name: string; states: ZoneStateEntry[] };
function zoneStateNames(states: ZoneStateEntry[]) {
  return states.map((s) => s.state.name).join(", ") || "—";
}

// ─── StatesPane ───────────────────────────────────────────────────────────────

function StatesPane() {
  const [data, setData]     = useState<State[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState("");
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<State | null>(null);
  const [name, setName]           = useState("");
  const [code, setCode]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<State | null>(null);

  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
    const res = await fetch(`/api/v2/organizer/reference-data/states?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setName(""); setCode(""); setFormError(""); setFormOpen(true); }
  function openEdit(s: State) { setEditing(s); setName(s.name); setCode(s.code); setFormError(""); setFormOpen(true); }

  async function handleSave() {
    if (!name.trim() || !code.trim()) { setFormError("Name and code are required."); return; }
    setSaving(true); setFormError("");
    try {
      const url = editing
        ? `/api/v2/organizer/reference-data/states/${editing.id}`
        : `/api/v2/organizer/reference-data/states`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Error"); }
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
    const res = await fetch(`/api/v2/organizer/reference-data/states/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: has linked records." : j.error); }
    load();
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search states…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add State</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Code</th>
              <th className="px-3 py-2 text-center font-medium text-zinc-600">Schools</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && data.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-400">No states found.</td></tr>
            )}
            {!loading && data.map((s) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-3 py-2 text-center text-zinc-500">{s._count.schools}</td>
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
          <span>{total} states</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit State" : "Add State"}</DialogTitle></DialogHeader>
          <div className="px-6 space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
            <div><Label>Code (e.g. SGR)</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 font-mono" maxLength={5} /></div>
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

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will permanently remove the state. This action cannot be undone."
      />

      <div className="mt-4 flex justify-start">
        <PushKbButton entityType="reference/zones" label="Zones" />
      </div>
    </div>
  );
}

// ─── ZonesPane ────────────────────────────────────────────────────────────────

function ZonesPane() {
  const [states, setStates]   = useState<{ id: string; name: string }[]>([]);
  const [data, setData]       = useState<Zone[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [q, setQ]             = useState("");
  const [loading, setLoading] = useState(false);

  // Add / Edit zone name
  const [formOpen, setFormOpen]   = useState(false);
  const [editing, setEditing]     = useState<Zone | null>(null);
  const [name, setName]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  // State picker (click State column)
  const [pickerZone,     setPickerZone]     = useState<Zone | null>(null);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerSaving,   setPickerSaving]   = useState(false);
  const [pickerError,    setPickerError]    = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);

  const PAGE_SIZE = 15;

  useEffect(() => {
    fetch("/api/v2/organizer/reference-data/states?pageSize=100")
      .then((r) => r.json())
      .then((j) => setStates(j.data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q });
    const res = await fetch(`/api/v2/organizer/reference-data/zones?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, q]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditing(null); setName(""); setFormError(""); setFormOpen(true); }
  function openEdit(z: Zone) { setEditing(z); setName(z.name); setFormError(""); setFormOpen(true); }

  async function handleSave() {
    if (!name.trim()) { setFormError("Zone name is required."); return; }
    setSaving(true); setFormError("");
    try {
      const url    = editing ? `/api/v2/organizer/reference-data/zones/${editing.id}` : `/api/v2/organizer/reference-data/zones`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Error"); }
      setFormOpen(false);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // States already assigned to OTHER zones (across all loaded pages)
  function takenByOther(zoneId: string) {
    const taken = new Set<string>();
    data.forEach((z) => {
      if (z.id !== zoneId) z.states.forEach((s) => taken.add(s.state.id));
    });
    return taken;
  }

  function openPicker(z: Zone) {
    setPickerZone(z);
    setPickerSelected(new Set(z.states.map((s) => s.state.id)));
    setPickerError("");
  }

  function togglePicker(id: string) {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePickerSave() {
    if (!pickerZone) return;
    setPickerSaving(true); setPickerError("");
    try {
      const res = await fetch(`/api/v2/organizer/reference-data/zones/${pickerZone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateIds: [...pickerSelected] }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? "Error"); }
      setPickerZone(null);
      load();
    } catch (e: unknown) {
      setPickerError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPickerSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/reference-data/zones/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error === "HAS_DEPENDENTS" ? "Cannot delete: has linked records." : j.error); }
    load();
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  // Available states for picker: current zone's states + states not assigned to any zone
  const pickerAvailable = pickerZone
    ? (() => {
        const taken = takenByOther(pickerZone.id);
        return states.filter((s) => !taken.has(s.id));
      })()
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search zones…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-8" />
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Zone</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">Name</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-600">State</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="px-3 py-8 text-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && data.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-zinc-400">No zones found.</td></tr>}
            {!loading && data.map((z) => (
              <tr key={z.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="px-3 py-2 font-medium">{z.name}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => openPicker(z)}
                    className="text-left text-zinc-500 hover:text-blue-600 hover:underline underline-offset-2 transition-colors"
                    title="Click to assign states"
                  >
                    {z.states.length === 0
                      ? <span className="text-zinc-300 italic">— click to assign</span>
                      : zoneStateNames(z.states)}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(z)} className="p-1 rounded hover:bg-zinc-100"><Pencil className="h-3.5 w-3.5 text-zinc-500" /></button>
                    <button onClick={() => setDeleteTarget(z)} className="p-1 rounded hover:bg-zinc-100"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-zinc-500">
          <span>{total} zones</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 py-1">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Add / Edit zone name dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Zone" : "Add Zone"}</DialogTitle></DialogHeader>
          <div className="px-6 space-y-3">
            <div><Label>Zone Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
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

      {/* State picker dialog */}
      <Dialog open={!!pickerZone} onOpenChange={(v) => !v && setPickerZone(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign States — {pickerZone?.name}</DialogTitle>
            <p className="text-xs text-zinc-400 mt-0.5">Only unassigned states are listed. Select one or more.</p>
          </DialogHeader>
          <div className="px-6">
            {pickerAvailable.length === 0 ? (
              <p className="text-sm text-zinc-400 py-4 text-center">All states are already assigned to other zones.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border border-input divide-y">
                {pickerAvailable.map((s) => (
                  <label key={s.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 text-sm select-none">
                    <input
                      type="checkbox"
                      checked={pickerSelected.has(s.id)}
                      onChange={() => togglePicker(s.id)}
                      className="h-4 w-4 rounded border-zinc-300 accent-blue-600"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            {pickerSelected.size > 0 && (
              <p className="text-xs text-zinc-400 mt-2">{pickerSelected.size} state{pickerSelected.size > 1 ? "s" : ""} selected</p>
            )}
            {pickerError && <p className="text-sm text-red-500 mt-2">{pickerError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerZone(null)}>Cancel</Button>
            <Button onClick={handlePickerSave} disabled={pickerSaving}>
              {pickerSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete zone "${deleteTarget?.name}"?`}
        description="This will permanently remove the zone. This action cannot be undone."
      />

      <div className="mt-4 flex justify-start">
        <PushKbButton entityType="reference/zones" label="Zones" />
      </div>
    </div>
  );
}

// ─── GeographyTab (outer) ─────────────────────────────────────────────────────

const GEO_TABS = [
  { key: "states", label: "States" },
  { key: "zones",  label: "Zones"  },
] as const;

type GeoTab = (typeof GEO_TABS)[number]["key"];

export function GeographyTab() {
  const [tab, setTab] = useState<GeoTab>("states");

  return (
    <div>
      <div className="flex gap-1 border-b mb-6">
        {GEO_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-[#085782] text-[#085782]"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "states" && <StatesPane />}
      {tab === "zones"  && <ZonesPane />}
    </div>
  );
}
