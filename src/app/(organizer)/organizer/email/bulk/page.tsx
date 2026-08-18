"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Eye, Pencil, Trash2, Users, Loader2, X, CheckCircle, AlertCircle,
  Mail, CalendarClock, Send, PlayCircle, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BlastStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
type SendScope = "all" | "pending" | "resend";

type Blast = {
  id: string;
  title: string;
  subject: string | null;
  htmlBody: string | null;
  includeHeader: boolean;
  includeFooter: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  status: BlastStatus;
  createdAt: string;
  createdBy: { name: string };
  _count: { recipients: number };
};

const STATUS_BADGE: Record<BlastStatus, string> = {
  DRAFT:       "bg-zinc-100 text-zinc-600",
  SCHEDULED:   "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED:   "bg-emerald-100 text-emerald-700",
};

const STATUS_LABEL: Record<BlastStatus, string> = {
  DRAFT:       "Draft",
  SCHEDULED:   "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED:   "Completed",
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

// ── Create Blast Dialog ──────────────────────────────────────────────────────
function CreateBlastDialog({ onCreated, onClose }: { onCreated: (b: Blast) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/v2/organizer/email/blasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      onCreated(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">New Email Blast</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Task title <span className="text-rose-500">*</span></label>
            <input
              autoFocus
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Welcome email to Zone South managers"
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Recipients Modal ─────────────────────────────────────────────────────────
type Recipient = { email: string; name: string; meta: string };
type Event     = { id: string; name: string };
type State     = { id: string; name: string };
type SourceType = "managers" | "event" | "manual";

function parseManual(text: string): Recipient[] {
  return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.+?)\s*<([^>]+)>$/);
    if (m) return { name: m[1].trim(), email: m[2].trim(), meta: "manual" };
    if (line.includes("@")) return { name: line, email: line, meta: "manual" };
    return null;
  }).filter((r): r is Recipient => r !== null);
}

function RecipientsModal({ blast, onClose, onSaved }: {
  blast: Blast;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [source, setSource]         = useState<SourceType>("managers");
  const [q, setQ]                   = useState("");
  const [stateId, setStateId]       = useState("");
  const [eventId, setEventId]       = useState("");
  const [results, setResults]       = useState<Recipient[]>([]);
  const [pending, setPending]       = useState<Map<string, Recipient>>(new Map());
  const [existing, setExisting]     = useState<{
    id: string; email: string; name: string; meta: string | null;
    userType: "manager" | "organizer" | "custom";
    contingent: string | null; state: string | null; event: string | null;
    status: string; sentAt: string | null;
  }[]>([]);
  const [manualText, setManualText] = useState("");
  const [events, setEvents]         = useState<Event[]>([]);
  const [states, setStates]         = useState<State[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [showAdd, setShowAdd]       = useState(false);

  // Load meta lists + existing recipients
  useEffect(() => {
    fetch("/api/v2/organizer/email/recipients?type=events").then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(() => {});
    fetch("/api/v2/organizer/reference-data/states?pageSize=20").then(r => r.json()).then(d => setStates(d.data ?? [])).catch(() => {});
    fetch(`/api/v2/organizer/email/blasts/${blast.id}/recipients`).then(r => r.json()).then(d => setExisting(d.recipients ?? [])).catch(() => {});
  }, [blast.id]);

  const search = useCallback(async () => {
    if (source === "manual") return;
    if (source === "event" && !eventId) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ type: source });
      if (q) p.set("q", q);
      if (source === "managers" && stateId) p.set("stateId", stateId);
      if (source === "event" && eventId) p.set("eventId", eventId);
      const d = await fetch(`/api/v2/organizer/email/recipients?${p}`).then(r => r.json());
      setResults(d.recipients ?? []);
    } finally { setLoading(false); }
  }, [source, q, stateId, eventId]);

  useEffect(() => {
    const t = setTimeout(search, 400);
    return () => clearTimeout(t);
  }, [search]);


  function toggle(r: Recipient) {
    setPending(prev => {
      const next = new Map(prev);
      if (next.has(r.email)) next.delete(r.email); else next.set(r.email, r);
      return next;
    });
  }

  function toggleAll() {
    setPending(prev => {
      const next = new Map(prev);
      const selectable = results.filter(r => !existingEmails.has(r.email));
      const allSelected = selectable.length > 0 && selectable.every(r => next.has(r.email));
      if (allSelected) {
        selectable.forEach(r => next.delete(r.email));
      } else {
        selectable.forEach(r => next.set(r.email, r));
      }
      return next;
    });
  }

  async function removeExisting(id: string) {
    await fetch(`/api/v2/organizer/email/blasts/${blast.id}/recipients/${id}`, { method: "DELETE" });
    setExisting(prev => prev.filter(r => r.id !== id));
  }

  async function addManual() {
    const parsed = parseManual(manualText);
    setPending(prev => { const n = new Map(prev); parsed.forEach(r => n.set(r.email, r)); return n; });
    setManualText("");
  }

  async function save() {
    if (pending.size === 0) { onClose(); return; }
    setSaving(true);
    const res = await fetch(`/api/v2/organizer/email/blasts/${blast.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: Array.from(pending.values()) }),
    });
    const j = await res.json();
    setSaving(false);
    onSaved(j.count ?? 0);
    onClose();
  }

  const existingEmails = new Set(existing.map(r => r.email));
  const TABS: { key: SourceType; label: string }[] = [
    { key: "managers", label: "Contingent Managers" },
    { key: "event",    label: "Event" },
    { key: "manual",   label: "Manual Entry" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Recipients — {blast.title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{existing.length} existing · {pending.size} pending</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Existing recipients */}
          {existing.length > 0 && (
            <div className="px-5 py-3 border-b bg-zinc-50">
              <p className="text-xs font-medium text-zinc-500 mb-2">Current recipients ({existing.length})</p>
              <div className="max-h-56 overflow-y-auto border border-zinc-200 rounded-md bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-100 sticky top-0">
                    <tr className="text-left text-zinc-500">
                      <th className="px-3 py-1.5 font-medium w-8">#</th>
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Email</th>
                      <th className="px-3 py-1.5 font-medium w-24">Type</th>
                      <th className="px-3 py-1.5 font-medium w-28">State</th>
                      <th className="px-3 py-1.5 font-medium">Contingent</th>
                      <th className="px-3 py-1.5 font-medium">Event</th>
                      <th className="px-3 py-1.5 font-medium w-20">Status</th>
                      <th className="px-3 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {existing.map((r, i) => (
                      <tr key={r.id} className="hover:bg-zinc-50">
                        <td className="px-3 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-zinc-800">{r.name}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{r.email}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            "inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                            r.userType === "manager"   && "bg-blue-50 text-blue-700",
                            r.userType === "organizer" && "bg-violet-50 text-violet-700",
                            r.userType === "custom"    && "bg-zinc-100 text-zinc-500",
                          )}>
                            {r.userType}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{r.state ?? "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{r.contingent ?? "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{r.event ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            "inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                            r.status === "SENT"    && "bg-emerald-50 text-emerald-700",
                            r.status === "FAILED"  && "bg-rose-50 text-rose-700",
                            r.status === "PENDING" && "bg-zinc-100 text-zinc-500",
                          )}
                            title={r.sentAt ? `Sent ${new Date(r.sentAt).toLocaleString("en-MY")}` : undefined}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button type="button" onClick={() => removeExisting(r.id)} title="Remove recipient"
                            className="text-zinc-300 hover:text-rose-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add Recipients toggle */}
          {!showAdd && existing.length > 0 && (
            <div className="px-5 py-4">
              <button type="button" onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 font-medium">
                <Plus className="h-4 w-4" /> Add Recipients
              </button>
            </div>
          )}

          {/* Source tabs */}
          {(showAdd || existing.length === 0) && (
          <>
          <div className="flex border-b px-5">
            {TABS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => { setSource(key); setResults([]); setQ(""); setStateId(""); setEventId(""); }}
                className={cn("px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                  source === key ? "border-violet-600 text-violet-700 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-800"
                )}>
                {label}
              </button>
            ))}
          </div>

          <div className="px-5 py-3 space-y-2">
            {source !== "manual" && (
              <input type="text" placeholder="Search name, email…" value={q} onChange={e => setQ(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
            )}
            {source === "managers" && (
              <select value={stateId} onChange={e => setStateId(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">All states</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {source === "event" && (
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">Select event…</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
            {source === "manual" && (
              <div className="space-y-2">
                <textarea rows={3} placeholder={"Name <email@example.com>\nemail@example.com"} value={manualText} onChange={e => setManualText(e.target.value)}
                  className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <button type="button" onClick={addManual} disabled={!manualText.trim()}
                  className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  Add to pending
                </button>
              </div>
            )}

            {source !== "manual" && (
              <div className="max-h-52 overflow-y-auto border border-zinc-100 rounded-md divide-y">
                {loading ? (
                  <div className="flex items-center justify-center py-5 gap-2 text-zinc-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-5 text-center text-zinc-400 text-sm">
                    {source === "event" && !eventId ? "Select an event." : "No results."}
                  </div>
                ) : (
                  <>
                    {(() => {
                      const selectable = results.filter(r => !existingEmails.has(r.email));
                      const allSelected = selectable.length > 0 && selectable.every(r => pending.has(r.email));
                      return (
                        <label className="flex items-center gap-3 px-3 py-2 cursor-pointer bg-zinc-50 hover:bg-zinc-100 font-medium">
                          <input type="checkbox" checked={allSelected} disabled={selectable.length === 0}
                            onChange={toggleAll} className="accent-violet-600" />
                          <span className="text-xs text-zinc-600">
                            Select all ({selectable.length})
                          </span>
                        </label>
                      );
                    })()}
                    {results.map(r => {
                      const alreadyIn = existingEmails.has(r.email);
                      return (
                        <label key={r.email} className={cn("flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-50", alreadyIn && "opacity-40")}>
                          <input type="checkbox" checked={pending.has(r.email)} disabled={alreadyIn}
                            onChange={() => toggle(r)} className="accent-violet-600" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800 truncate">{r.name}</p>
                            <p className="text-xs text-zinc-400 truncate">{r.email}{r.meta ? ` · ${r.meta}` : ""}</p>
                          </div>
                          {alreadyIn && <span className="text-[10px] text-zinc-400">already added</span>}
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* Pending chips */}
            {pending.size > 0 && (
              <div className="pt-1">
                <p className="text-xs font-medium text-zinc-500 mb-1.5">Pending ({pending.size})</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(pending.values()).map(r => (
                    <span key={r.email} className="inline-flex items-center gap-1 bg-violet-50 text-violet-800 text-xs px-2 py-0.5 rounded-full">
                      {r.name}
                      <button type="button" onClick={() => toggle(r)} className="hover:text-rose-600"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0 bg-white">
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending.size > 0 ? `Add ${pending.size} recipient${pending.size !== 1 ? "s" : ""}` : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Preview Modal ────────────────────────────────────────────────────
function buildEnvelopeHtml(body: string, includeHeader: boolean, includeFooter: boolean) {
  const header = includeHeader ? `
    <div style="background:linear-gradient(135deg,#3b0764 0%,#5b21b6 55%,#7c3aed 100%);padding:36px 40px 28px;text-align:center;">
      <img src="/logos-white/mt-logo-white.svg" alt="Malaysia Techlympics"
           style="height:48px;width:auto;max-width:200px;display:block;margin:0 auto;" />
      <div style="margin-top:18px;width:56px;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:2px;margin-left:auto;margin-right:auto;"></div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed);"></div>` : "";

  const footer = includeFooter ? `
    <div style="border-top:1px solid #e5e7eb;background:#f9fafb;padding:28px 40px;text-align:center;">
      <img src="/logo-mt.svg" alt="Malaysia Techlympics"
           style="height:32px;width:auto;max-width:120px;display:block;margin:0 auto 10px;opacity:0.65;" />
      <p style="margin:0 0 8px;font-family:sans-serif;font-size:13px;font-weight:600;color:#374151;letter-spacing:0.05em;">MALAYSIA TECHLYMPICS</p>
      <p style="margin:0 0 8px;font-family:sans-serif;font-size:11px;color:#9ca3af;">
        <a href="https://techlympics.my" style="color:#7c3aed;text-decoration:none;font-weight:500;">techlympics.my</a>
      </p>
      <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-family:sans-serif;font-size:10px;color:#d1d5db;">
        © 2025 Malaysia Techlympics. All rights reserved.<br/>
        You are receiving this email because you registered as a contingent manager.
      </p>
    </div>` : "";

  return `
    <div style="background:#ede9fe;padding:24px;min-height:100%;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(91,33,182,0.12);">
        ${header}
        <div style="padding:32px 40px;font-size:15px;line-height:1.7;color:#1f2937;">${body}</div>
        ${footer}
      </div>
    </div>`;
}

type FullBlast = Blast & { htmlBody: string | null; includeHeader: boolean; includeFooter: boolean };

function PreviewModal({ blastId, subject, onClose }: { blastId: string; subject: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<FullBlast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v2/organizer/email/blasts/${blastId}`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .finally(() => setLoading(false));
  }, [blastId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Chrome bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0 bg-zinc-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-zinc-600">Preview</span>
            {subject && (
              <span className="text-xs text-zinc-400 italic truncate max-w-xs">{subject}</span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Email envelope */}
        <div className="flex-1 overflow-y-auto bg-[#ede9fe]">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-2 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : detail?.htmlBody ? (
            <div
              dangerouslySetInnerHTML={{
                __html: buildEnvelopeHtml(detail.htmlBody, detail.includeHeader ?? true, detail.includeFooter ?? true),
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-zinc-400 text-sm italic">No message composed yet.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t text-right shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Send / Schedule Dialog ───────────────────────────────────────────────────
function SendDialog({ blast, onConfirm, onClose }: {
  blast: Blast;
  onConfirm: (blastId: string, scheduledAt: string | null, scope: SendScope) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"now" | "later">(blast.scheduledAt ? "later" : "now");
  const [dt, setDt]     = useState(blast.scheduledAt ? new Date(blast.scheduledAt).toISOString().slice(0, 16) : "");
  const [counts, setCounts] = useState<{ total: number; pending: number; sent: number } | null>(null);
  const [scope, setScope] = useState<SendScope>(blast.sentAt ? "pending" : "all");

  useEffect(() => {
    fetch(`/api/v2/organizer/email/blasts/${blast.id}/recipients`)
      .then(r => r.json())
      .then(d => {
        const list: { status: string }[] = d.recipients ?? [];
        setCounts({
          total:   list.length,
          pending: list.filter(r => r.status === "PENDING" || r.status === "FAILED").length,
          sent:    list.filter(r => r.status === "SENT").length,
        });
      })
      .catch(() => {});
  }, [blast.id]);

  const missingSubject    = !blast.subject?.trim();
  const missingBody       = !blast.htmlBody?.trim();
  const missingRecipients = blast._count.recipients === 0;
  const nothingToSend     = scope === "pending" && counts !== null && counts.pending === 0;
  const canSend           = !missingSubject && !missingBody && !missingRecipients && !nothingToSend;

  function run() {
    const schedAt = mode === "later" && dt ? new Date(dt).toISOString() : null;
    onConfirm(blast.id, schedAt, scope); // parent closes dialog, patches, fires send, polls
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
        {/* Title */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-violet-500 shrink-0" /> Run Task
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">{blast.title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-zinc-600">
            <Users className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span><span className="font-medium">{blast._count.recipients}</span> recipient{blast._count.recipients !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-start gap-2 text-zinc-600">
            <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
            {blast.subject ? (
              <span className="truncate">{blast.subject}</span>
            ) : (
              <span className="text-amber-600 italic">No subject set</span>
            )}
          </div>
        </div>

        {/* Warnings */}
        {(missingRecipients || missingSubject || missingBody) && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            {missingRecipients && <p className="text-xs text-amber-700">⚠ No recipients added yet.</p>}
            {missingSubject    && <p className="text-xs text-amber-700">⚠ Subject is required before sending.</p>}
            {missingBody       && <p className="text-xs text-amber-700">⚠ Email body is empty.</p>}
          </div>
        )}

        {/* Recipients scope */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-zinc-500">Recipients</p>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")}
              className="accent-violet-600 mt-1" />
            <div>
              <p className="text-sm font-medium text-zinc-800">
                Send{counts ? ` (${counts.total})` : ""}
              </p>
              <p className="text-xs text-zinc-400">All recipients on the list</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="radio" name="scope" value="pending" checked={scope === "pending"} onChange={() => setScope("pending")}
              className="accent-violet-600 mt-1" />
            <div>
              <p className="text-sm font-medium text-zinc-800">
                Send pendings{counts ? ` (${counts.pending})` : ""}
              </p>
              <p className="text-xs text-zinc-400">Only recipients not yet sent (or previously failed)</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="radio" name="scope" value="resend" checked={scope === "resend"} onChange={() => setScope("resend")}
              className="accent-violet-600 mt-1" />
            <div>
              <p className="text-sm font-medium text-zinc-800">
                Resend all{counts ? ` (${counts.total})` : ""}
              </p>
              <p className="text-xs text-zinc-400">Send again to everyone, including those already sent</p>
            </div>
          </label>
          {nothingToSend && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              ⚠ No pending recipients — everyone has already been sent.
            </p>
          )}
        </div>

        {/* Mode */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input type="radio" name="mode" value="now" checked={mode === "now"} onChange={() => setMode("now")}
              className="accent-violet-600" />
            <div>
              <p className="text-sm font-medium text-zinc-800">Send immediately</p>
              <p className="text-xs text-zinc-400">Recipients receive the email right away</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input type="radio" name="mode" value="later" checked={mode === "later"} onChange={() => setMode("later")}
              className="accent-violet-600 mt-1" />
            <div className="flex-1 space-y-1.5">
              <p className="text-sm font-medium text-zinc-800">Schedule for later</p>
              <input type="datetime-local" value={dt} onChange={e => setDt(e.target.value)}
                disabled={mode === "now"}
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-40 disabled:cursor-not-allowed" />
              <p className="text-xs text-zinc-400">Resend supports scheduling up to 72 hours ahead.</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="button" onClick={run} disabled={!canSend || (mode === "later" && !dt)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
            <PlayCircle className="h-4 w-4" />
            {mode === "later" ? "Schedule & Send" : "Send Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Dialog ────────────────────────────────────────────────────
function DeleteDialog({ blast, onDeleted, onClose }: { blast: Blast; onDeleted: () => void; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    await fetch(`/api/v2/organizer/email/blasts/${blast.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-900">Delete task?</h2>
        <p className="text-sm text-zinc-500">
          &ldquo;{blast.title}&rdquo; and all its recipients will be permanently deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50">Cancel</button>
          <button onClick={confirm} disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BulkPage() {
  const router      = useRouter();
  const pollingRef  = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [blasts, setBlasts]               = useState<Blast[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [recipientsFor, setRecipientsFor] = useState<Blast | null>(null);
  const [previewFor, setPreviewFor]       = useState<Blast | null>(null);
  const [sendFor, setSendFor]             = useState<Blast | null>(null);
  const [deleteFor, setDeleteFor]         = useState<Blast | null>(null);
  const [duplicating, setDuplicating]     = useState<string | null>(null);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editingTitle, setEditingTitle]   = useState("");
  const [flash, setFlash]                 = useState<{ ok: boolean; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/v2/organizer/email/blasts").then(r => r.json());
      setBlasts(d.blasts ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/v2/organizer/email/blasts")
      .then(r => r.json())
      .then(d => setBlasts(d.blasts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Stop all polling on unmount
  useEffect(() => () => { pollingRef.current.forEach(t => clearInterval(t)); }, []);

  function showFlash(ok: boolean, msg: string) {
    setFlash({ ok, msg });
    setTimeout(() => setFlash(null), 3500);
  }

  function handleCreated(b: Blast) {
    setBlasts(prev => [b, ...prev]);
    setShowCreate(false);
    showFlash(true, "Task created.");
  }

  function handleRecipientsSaved(count: number) {
    setBlasts(prev => prev.map(b =>
      b.id === recipientsFor?.id ? { ...b, _count: { recipients: count } } : b
    ));
    showFlash(true, `Recipients updated (${count} total).`);
  }

  async function handleTitleSave(id: string, title: string) {
    const trimmed = title.trim();
    setEditingId(null);
    if (!trimmed) return; // don't save empty
    setBlasts(prev => prev.map(b => b.id === id ? { ...b, title: trimmed } : b));
    await fetch(`/api/v2/organizer/email/blasts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }

  function handleDeleted() {
    setBlasts(prev => prev.filter(b => b.id !== deleteFor?.id));
    setDeleteFor(null);
    showFlash(true, "Task deleted.");
  }

  function startPolling(blastId: string) {
    if (pollingRef.current.has(blastId)) return;
    const timer = setInterval(async () => {
      try {
        const data = await fetch(`/api/v2/organizer/email/blasts/${blastId}`).then(r => r.json());
        setBlasts(prev => prev.map(b =>
          b.id === blastId
            ? { ...b, sentCount: data.sentCount ?? b.sentCount, status: data.status, sentAt: data.sentAt }
            : b
        ));
        if (data.status === "COMPLETED" || data.status === "DRAFT") {
          clearInterval(timer);
          pollingRef.current.delete(blastId);
          if (data.status === "COMPLETED") showFlash(true, `Sent to ${data.sentCount} recipient(s).`);
        }
      } catch { /* ignore transient errors */ }
    }, 1500);
    pollingRef.current.set(blastId, timer);
  }

  async function handleConfirmSend(blastId: string, scheduledAt: string | null, scope: SendScope) {
    setSendFor(null);
    // Patch scheduledAt first (fast)
    await fetch(`/api/v2/organizer/email/blasts/${blastId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt }),
    });
    // Optimistic: show IN_PROGRESS immediately
    setBlasts(prev => prev.map(b =>
      b.id === blastId ? { ...b, status: "IN_PROGRESS" as BlastStatus, sentCount: 0 } : b
    ));
    // Fire send in background — don't await
    fetch(`/api/v2/organizer/email/blasts/${blastId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    })
      .then(r => r.json())
      .then(j => { if (j.error) showFlash(false, j.error); })
      .catch(() => showFlash(false, "Send failed."));
    // Poll for progress until COMPLETED
    startPolling(blastId);
  }

  async function handleDuplicate(b: Blast) {
    setDuplicating(b.id);
    try {
      const createRes = await fetch("/api/v2/organizer/email/blasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Copy of ${b.title}` }),
      });
      const created = await createRes.json();
      if (b.subject || b.htmlBody) {
        await fetch(`/api/v2/organizer/email/blasts/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject:       b.subject,
            htmlBody:      b.htmlBody,
            includeHeader: b.includeHeader,
            includeFooter: b.includeFooter,
          }),
        });
      }
      await load();
      showFlash(true, `"${b.title}" duplicated.`);
    } catch {
      showFlash(false, "Failed to duplicate.");
    } finally {
      setDuplicating(null);
    }
  }

  return (
    <div className="p-6">
      {/* Flash */}
      {flash && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm",
          flash.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
        )}>
          {flash.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-500" /> Email Blasts
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage and send outgoing email campaigns.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-violet-600 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" /> New Blast
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : blasts.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center text-zinc-400">
          <Send className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No email blasts yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-500 w-36">Created</th>
                <th className="px-4 py-3 font-medium text-zinc-500">Title</th>
                <th className="px-4 py-3 font-medium text-zinc-500 w-28 text-center">Recipients</th>
                <th className="px-4 py-3 font-medium text-zinc-500 w-24 text-center">Message</th>
                <th className="px-4 py-3 font-medium text-zinc-500 w-36">Schedule</th>
                <th className="px-4 py-3 font-medium text-zinc-500 w-16 text-center">Sent</th>
                <th className="px-4 py-3 font-medium text-zinc-500 w-28 text-center">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {blasts.map(b => (
                <tr key={b.id} className="hover:bg-zinc-50 align-middle">
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmt(b.createdAt)}</td>
                  <td className="px-4 py-3">
                    {editingId === b.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={() => handleTitleSave(b.id, editingTitle)}
                        onKeyDown={e => {
                          if (e.key === "Enter")  e.currentTarget.blur();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full font-medium text-sm text-zinc-900 border border-violet-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      />
                    ) : (
                      <p
                        onClick={() => { setEditingId(b.id); setEditingTitle(b.title); }}
                        title="Click to rename"
                        className="font-medium text-zinc-900 cursor-text hover:text-violet-700 inline-flex items-center gap-1.5 group"
                      >
                        {b.title}
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-35 text-zinc-400 shrink-0" />
                      </p>
                    )}
                    {b.subject && <p className="text-xs text-zinc-400 truncate max-w-xs mt-0.5">{b.subject}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setRecipientsFor(b)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-violet-100 text-zinc-600 hover:text-violet-700 text-xs font-medium transition-colors"
                      title="Manage recipients"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {b._count?.recipients ?? 0}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setPreviewFor(b)} title="Preview message"
                        className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => router.push(`/organizer/email/bulk/${b.id}/compose`)} title="Edit message"
                        className="p-1.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-violet-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                    {b.scheduledAt ? (
                      <span className="flex items-center gap-1 text-blue-600">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmt(b.scheduledAt)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-mono text-zinc-600">{b.sentCount}</td>
                  <td className="px-4 py-3 text-center">
                    {b.status === "IN_PROGRESS" ? (
                      <div className="px-1 space-y-1.5">
                        <div className="relative h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: b._count.recipients > 0
                                ? `${Math.max(4, Math.min(100, Math.round((b.sentCount / b._count.recipients) * 100)))}%`
                                : "4%",
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-violet-600 font-medium tabular-nums">
                          {b.sentCount} / {b._count.recipients}
                        </p>
                      </div>
                    ) : (
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", STATUS_BADGE[b.status])}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => handleDuplicate(b)} disabled={duplicating === b.id} title="Duplicate task"
                        className="p-1.5 rounded hover:bg-zinc-100 text-zinc-300 hover:text-zinc-600 transition-colors disabled:opacity-40">
                        {duplicating === b.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => setSendFor(b)} disabled={b.status === "COMPLETED"} title="Run / schedule"
                        className="p-1.5 rounded hover:bg-violet-50 text-zinc-300 hover:text-violet-600 transition-colors disabled:opacity-30">
                        <PlayCircle className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteFor(b)} title="Delete"
                        className="p-1.5 rounded hover:bg-rose-50 text-zinc-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate    && <CreateBlastDialog onCreated={handleCreated} onClose={() => setShowCreate(false)} />}
      {recipientsFor && <RecipientsModal blast={recipientsFor} onClose={() => setRecipientsFor(null)} onSaved={handleRecipientsSaved} />}
      {previewFor    && <PreviewModal blastId={previewFor.id} subject={previewFor.subject} onClose={() => setPreviewFor(null)} />}
      {sendFor       && <SendDialog blast={sendFor} onConfirm={handleConfirmSend} onClose={() => setSendFor(null)} />}
      {deleteFor     && <DeleteDialog blast={deleteFor} onDeleted={handleDeleted} onClose={() => setDeleteFor(null)} />}
    </div>
  );
}
