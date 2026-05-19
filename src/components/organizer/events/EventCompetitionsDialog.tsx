"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Pencil, Trash2, Loader2, Trophy, User, Phone,
  ChevronLeft, ChevronRight, ArrowLeft, Search, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "@/components/organizer/reference-data/DeleteDialog";

// ── Types ──────────────────────────────────────────────────────────────────────

type TargetGroup = { id: string; name: string; schoolLevel: string };

type Competition = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  participationType: string;
  minTeamSize: number;
  maxTeamSize: number;
  targetGroups: { targetGroup: TargetGroup }[];
};

type EventCompetition = {
  id: string;
  eventId: string;
  competitionId: string;
  picName: string | null;
  picContact: string | null;
  maxTeams: number;
  competition: Competition & { _count: { teams: number } };
};


const TYPE_STYLES: Record<string, string> = {
  INDIVIDUAL: "bg-sky-50 text-sky-700",
  TEAM:       "bg-violet-50 text-violet-700",
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  eventId: string;
  eventName: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EventCompetitionsDialog({ open, eventId, eventName, onClose, onCountChange }: Props) {
  // Stable ref so load() doesn't re-create when parent re-renders
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; });

  // ── List state ──
  const [data, setData]       = useState<EventCompetition[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 10;

  // ── View: "list" | "form" ──
  const [view, setView] = useState<"list" | "form">("list");

  // ── Form state ──
  const [editing, setEditing]     = useState<EventCompetition | null>(null);
  const [picName, setPicName]     = useState("");
  const [picContact, setPicContact] = useState("");
  const [maxTeams, setMaxTeams]   = useState(0);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  // ── Competition search (for new link) ──
  const [compSearch, setCompSearch]       = useState("");
  const [compResults, setCompResults]     = useState<Competition[]>([]);
  const [compSearching, setCompSearching] = useState(false);
  const [selected, setSelected]           = useState<Competition | null>(null);
  const searchTimeout                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delete ──
  const [deleteTarget, setDeleteTarget] = useState<EventCompetition | null>(null);

  // ── Load linked competitions ──────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/organizer/events/${eventId}/competitions`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      onCountChangeRef.current(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [eventId]); // onCountChange excluded — accessed via stable ref

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { if (!open) { setView("list"); setPage(1); } }, [open]);

  // ── Competition catalog search ────────────────────────────────────────────────

  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const searchCompetitions = useCallback(async (q: string) => {
    setCompSearching(true);
    try {
      const res  = await fetch(`/api/v2/organizer/competitions?q=${encodeURIComponent(q)}&pageSize=20`);
      const json = await res.json();
      const linkedIds = new Set(dataRef.current.map(ec => ec.competitionId));
      setCompResults((json.data ?? []).filter((c: Competition) => !linkedIds.has(c.id)));
    } finally {
      setCompSearching(false);
    }
  }, []); // data accessed via stable ref

  useEffect(() => {
    if (view !== "form" || editing) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCompetitions(compSearch), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [compSearch, view, editing, searchCompetitions]);

  // ── Open add form ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setSelected(null);
    setCompSearch("");
    setCompResults([]);
    setPicName(""); setPicContact(""); setMaxTeams(0);
    setFormError("");
    setView("form");
    // Trigger initial search with empty string
    searchCompetitions("");
  }

  // ── Open edit form ────────────────────────────────────────────────────────────

  function openEdit(ec: EventCompetition) {
    setEditing(ec);
    setSelected(ec.competition);
    setPicName(ec.picName ?? "");
    setPicContact(ec.picContact ?? "");
    setMaxTeams(ec.maxTeams);
    setFormError("");
    setView("form");
  }

  // ── Save (create link or update link) ────────────────────────────────────────

  async function handleSave() {
    if (!editing && !selected) {
      setFormError("Select a competition first.");
      return;
    }
    setSaving(true); setFormError("");
    try {
      if (editing) {
        // PATCH — update PIC / maxTeams only
        const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picName, picContact, maxTeams }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Error ${res.status}`);
        }
      } else {
        // POST — link competition
        const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitionId: selected!.id, picName, picContact, maxTeams }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            j.error === "ALREADY_LINKED" ? "Competition already added to this event." : (j.error ?? `Error ${res.status}`)
          );
        }
      }
      setView("list");
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete (unlink) ───────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/organizer/events/${eventId}/competitions/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error === "HAS_TEAMS" ? "Remove all teams first." : (j.error ?? "Failed"));
    }
    load();
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const paged = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">

          {/* Header */}
          <DialogHeader className="pl-6 pr-14 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              {view === "form" && (
                <button onClick={() => setView("list")} className="p-1 rounded hover:bg-zinc-100 mr-1">
                  <ArrowLeft className="h-4 w-4 text-zinc-500" />
                </button>
              )}
              <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <DialogTitle className="leading-tight">
                  {view === "list"
                    ? `Competitions — ${eventName}`
                    : editing ? `Edit · ${editing.competition.name}` : `Add Competition — ${eventName}`}
                </DialogTitle>
                {view === "list" && (
                  <p className="text-xs text-zinc-400 mt-0.5">{total} competition{total !== 1 ? "s" : ""} linked</p>
                )}
              </div>
              {view === "list" && (
                <Button size="sm" className="ml-auto" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">

            {/* ── LIST VIEW ───────────────────────────────────────────────── */}
            {view === "list" && (
              <>
                {loading && (
                  <div className="flex items-center justify-center py-12 text-zinc-400">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                  </div>
                )}
                {!loading && data.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-14 text-zinc-400 gap-2">
                    <Trophy className="h-8 w-8 text-zinc-200" />
                    <p className="text-sm">No competitions linked yet.</p>
                    <Button size="sm" variant="outline" onClick={openAdd}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add a competition
                    </Button>
                  </div>
                )}
                {!loading && data.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Competition</th>
                        <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Type</th>
                        <th className="px-4 py-2.5 text-left font-medium text-zinc-600">PIC</th>
                        <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Max Teams</th>
                        <th className="px-4 py-2.5 text-left font-medium text-zinc-600">Teams</th>
                        <th className="px-4 py-2.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((ec) => (
                        <tr key={ec.id} className="border-b last:border-0 hover:bg-zinc-50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{ec.competition.name}</p>
                            <p className="text-xs text-zinc-400 font-mono">{ec.competition.code}</p>
                            {ec.competition.targetGroups.length > 0 && (
                              <p className="text-xs text-zinc-400 mt-0.5">
                                {ec.competition.targetGroups.map(t => t.targetGroup.name).join(", ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_STYLES[ec.competition.participationType] ?? "bg-zinc-100 text-zinc-600"}`}>
                              {ec.competition.participationType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            {ec.picName && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-zinc-400 shrink-0" />{ec.picName}
                              </div>
                            )}
                            {ec.picContact && (
                              <div className="flex items-center gap-1 text-zinc-400">
                                <Phone className="h-3 w-3 shrink-0" />{ec.picContact}
                              </div>
                            )}
                            {!ec.picName && !ec.picContact && <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600">
                            {ec.maxTeams > 0 ? ec.maxTeams : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-500">
                            {ec.competition._count.teams}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openEdit(ec)} className="p-1 rounded hover:bg-zinc-100">
                                <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                              </button>
                              <button onClick={() => setDeleteTarget(ec)} className="p-1 rounded hover:bg-zinc-100">
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t text-sm text-zinc-500">
                    <span>{total} total</span>
                    <div className="flex gap-1 items-center">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="px-2">{page}/{pages}</span>
                      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── FORM VIEW ───────────────────────────────────────────────── */}
            {view === "form" && (
              <div className="px-6 py-5 space-y-5">

                {/* Competition selector (new link only) */}
                {!editing && (
                  <div className="space-y-2">
                    <Label>Competition *</Label>

                    {selected ? (
                      /* Selected state */
                      <div className="flex items-center gap-3 p-3 rounded-md border border-green-200 bg-green-50">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{selected.name}</p>
                          <p className="text-xs text-zinc-500 font-mono">{selected.code}</p>
                        </div>
                        <button
                          onClick={() => { setSelected(null); setCompSearch(""); searchCompetitions(""); }}
                          className="text-xs text-zinc-400 hover:text-zinc-600 shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      /* Search state */
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                          <Input
                            placeholder="Search by name or code…"
                            value={compSearch}
                            onChange={(e) => setCompSearch(e.target.value)}
                            className="pl-8"
                            autoFocus
                          />
                          {compSearching && (
                            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-zinc-400" />
                          )}
                        </div>

                        <div className="rounded-md border max-h-52 overflow-y-auto">
                          {!compSearching && compResults.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-zinc-400">
                              {compSearch ? "No matching competitions." : "Start typing to search…"}
                            </div>
                          )}
                          {compResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setSelected(c)}
                              className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 border-b last:border-0 flex items-start gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{c.name}</p>
                                <p className="text-xs text-zinc-400 font-mono">{c.code}</p>
                                {c.targetGroups.length > 0 && (
                                  <p className="text-xs text-zinc-400 mt-0.5">
                                    {c.targetGroups.map(t => t.targetGroup.name).join(", ")}
                                  </p>
                                )}
                              </div>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TYPE_STYLES[c.participationType] ?? "bg-zinc-100 text-zinc-600"}`}>
                                {c.participationType}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Editing — show competition read-only */}
                {editing && (
                  <div>
                    <Label>Competition</Label>
                    <div className="mt-1 px-3 py-2 rounded-md border bg-zinc-50 text-sm">
                      <span className="font-medium">{editing.competition.name}</span>
                      <span className="ml-2 text-xs text-zinc-400 font-mono">{editing.competition.code}</span>
                    </div>
                  </div>
                )}

                {/* PIC + maxTeams */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Person In Charge</Label>
                    <Input
                      value={picName}
                      onChange={(e) => setPicName(e.target.value)}
                      placeholder="Full name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>PIC Contact</Label>
                    <Input
                      value={picContact}
                      onChange={(e) => setPicContact(e.target.value)}
                      placeholder="Phone or email"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="w-40">
                  <Label>Max Teams per Contingent</Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxTeams}
                    onChange={(e) => setMaxTeams(parseInt(e.target.value) || 0)}
                    className="mt-1"
                  />
                  <p className="text-xs text-zinc-400 mt-1">0 = unlimited</p>
                </div>

                {formError && <p className="text-sm text-red-500">{formError}</p>}
              </div>
            )}
          </div>

          {/* Footer (form only) */}
          {view === "form" && (
            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || (!editing && !selected)}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add to Event"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Remove "${deleteTarget?.competition.name}"?`}
        description="This will unlink the competition from this event. Teams registered under it must be removed first."
      />
    </>
  );
}
