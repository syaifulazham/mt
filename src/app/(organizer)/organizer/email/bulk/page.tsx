"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bold, Italic, Underline, List, ListOrdered, Minus, RemoveFormatting,
  Heading2, Heading3, Eye, EyeOff, Send, X, CheckCircle, AlertCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Recipient = { email: string; name: string; meta: string };
type Event     = { id: string; name: string; slug: string };
type State     = { id: string; name: string };
type SourceType = "managers" | "participants" | "manual";

function parseManualEntry(text: string): Recipient[] {
  const lines = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  return lines.map((line) => {
    // "Name <email>" format
    const m = line.match(/^(.+?)\s*<([^>]+)>$/);
    if (m) return { name: m[1].trim(), email: m[2].trim(), meta: "manual" };
    // plain email
    if (line.includes("@")) return { name: line, email: line, meta: "manual" };
    return null;
  }).filter((r): r is Recipient => r !== null);
}

export default function BulkSendPage() {
  const [sourceType, setSourceType]       = useState<SourceType>("managers");
  const [q, setQ]                         = useState("");
  const [stateId, setStateId]             = useState("");
  const [eventId, setEventId]             = useState("");
  const [results, setResults]             = useState<Recipient[]>([]);
  const [selected, setSelected]           = useState<Map<string, Recipient>>(new Map());
  const [manualText, setManualText]       = useState("");
  const [subject, setSubject]             = useState("");
  const [htmlBody, setHtmlBody]           = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt]     = useState("");
  const [sending, setSending]             = useState(false);
  const [blastResult, setBlastResult]     = useState<{ sent: number; failed: number } | null>(null);
  const [preview, setPreview]             = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const [events, setEvents]   = useState<Event[]>([]);
  const [states, setStates]   = useState<State[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load events and states on mount
  useEffect(() => {
    fetch("/api/v2/organizer/email/recipients?type=events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});

    fetch("/api/v2/organizer/reference-data/states?pageSize=20")
      .then((r) => r.json())
      .then((d) => setStates(d.data ?? d.states ?? []))
      .catch(() => {});
  }, []);

  const fetchResults = useCallback(async () => {
    if (sourceType === "manual") return;
    if (sourceType === "participants" && !eventId) return;

    setLoadingResults(true);
    try {
      const params = new URLSearchParams({ type: sourceType });
      if (q) params.set("q", q);
      if (sourceType === "managers" && stateId) params.set("stateId", stateId);
      if (sourceType === "participants" && eventId) params.set("eventId", eventId);

      const res = await fetch(`/api/v2/organizer/email/recipients?${params}`);
      const data = await res.json();
      setResults(data.recipients ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }, [sourceType, q, stateId, eventId]);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchResults();
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [fetchResults]);

  // Reset results when sourceType changes
  useEffect(() => {
    setResults([]);
    setQ("");
    setStateId("");
    setEventId("");
  }, [sourceType]);

  function toggleRecipient(r: Recipient) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(r.email)) next.delete(r.email);
      else next.set(r.email, r);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of results) next.set(r.email, r);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Map());
  }

  function addManual() {
    const parsed = parseManualEntry(manualText);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of parsed) next.set(r.email, r);
      return next;
    });
    setManualText("");
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    setHtmlBody(editorRef.current?.innerHTML ?? "");
  }

  async function handleSend() {
    if (selected.size === 0 || !subject.trim() || !htmlBody.trim()) return;
    setSending(true);
    setBlastResult(null);
    try {
      const recipients = Array.from(selected.values()).map(({ email, name }) => ({ email, name }));
      const res = await fetch("/api/v2/organizer/email/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          subject,
          html: htmlBody,
          ...(scheduleEnabled && scheduledAt ? { scheduledAt } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Blast failed");
      setBlastResult(data);
    } catch (err) {
      setBlastResult({ sent: 0, failed: selected.size });
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  const canSend = selected.size > 0 && subject.trim().length > 0 && htmlBody.trim().length > 0;

  return (
    <div className="p-6 flex flex-col md:flex-row gap-6 min-h-full">
      {/* ── Left panel: Recipient picker ── */}
      <div className="md:w-[420px] shrink-0 flex flex-col gap-4">
        <div className="rounded-xl border bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-800">Recipients</h2>
            {selected.size > 0 && (
              <span className="text-xs bg-violet-100 text-violet-700 font-medium px-2 py-0.5 rounded-full">
                {selected.size} selected
              </span>
            )}
          </div>

          {/* Source type selector */}
          <div className="flex gap-2 flex-wrap">
            {(["managers", "participants", "manual"] as SourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSourceType(t)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  sourceType === t
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-violet-400"
                )}
              >
                {t === "managers" ? "Contingent Managers" : t === "participants" ? "Event Participants" : "Manual Entry"}
              </button>
            ))}
          </div>

          {/* Filters */}
          {sourceType !== "manual" && (
            <input
              type="text"
              placeholder="Search name, email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          )}

          {sourceType === "managers" && (
            <select
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {sourceType === "participants" && (
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="">Select event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}

          {/* Manual entry */}
          {sourceType === "manual" && (
            <div className="flex flex-col gap-2">
              <textarea
                rows={4}
                placeholder={`One per line or comma-separated:\nName <email@example.com>\nemail@example.com`}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <button
                type="button"
                onClick={addManual}
                disabled={!manualText.trim()}
                className="self-end text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Add to selection
              </button>
            </div>
          )}

          {/* Results list */}
          {sourceType !== "manual" && (
            <>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll}
                  className="text-xs text-violet-600 hover:underline">Select all visible</button>
                <span className="text-zinc-300">|</span>
                <button type="button" onClick={clearSelection}
                  className="text-xs text-zinc-500 hover:underline">Clear selection</button>
              </div>

              <div className="max-h-64 overflow-y-auto border border-zinc-100 rounded-md divide-y">
                {loadingResults ? (
                  <div className="flex items-center justify-center py-6 text-zinc-400 text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-6 text-center text-zinc-400 text-sm">
                    {sourceType === "participants" && !eventId ? "Select an event to load participants." : "No results."}
                  </div>
                ) : (
                  results.map((r) => (
                    <label key={r.email}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(r.email)}
                        onChange={() => toggleRecipient(r)}
                        className="accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{r.name}</p>
                        <p className="text-xs text-zinc-400 truncate">{r.email}{r.meta ? ` · ${r.meta}` : ""}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Selected chips */}
        {selected.size > 0 && (
          <div className="rounded-xl border bg-white p-3 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-zinc-500 mb-2">Selected ({selected.size})</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected.values()).map((r) => (
                <span key={r.email}
                  className="inline-flex items-center gap-1 bg-violet-50 text-violet-800 text-xs px-2 py-0.5 rounded-full">
                  {r.name}
                  <button type="button" onClick={() => toggleRecipient(r)} className="hover:text-rose-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: Compose ── */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="rounded-xl border bg-white p-4 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-800">Compose</h2>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Subject <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject…"
              className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {/* Rich text editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-500">Body <span className="text-rose-500">*</span></label>
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
              >
                {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {preview ? "Edit" : "Preview"}
              </button>
            </div>

            {!preview ? (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap gap-1 border border-zinc-200 rounded-t-md bg-zinc-50 px-2 py-1.5">
                  {[
                    { icon: Bold,             cmd: "bold",                  title: "Bold" },
                    { icon: Italic,           cmd: "italic",                title: "Italic" },
                    { icon: Underline,        cmd: "underline",             title: "Underline" },
                  ].map(({ icon: Icon, cmd, title }) => (
                    <button key={cmd} type="button" title={title}
                      onMouseDown={(e) => { e.preventDefault(); execCmd(cmd); }}
                      className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                  <span className="w-px bg-zinc-200 mx-1" />
                  <button type="button" title="Heading 2"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("formatBlock", "h2"); }}
                    className="px-1.5 py-0.5 rounded hover:bg-zinc-200 text-zinc-600 text-xs font-bold">
                    <Heading2 className="h-4 w-4" />
                  </button>
                  <button type="button" title="Heading 3"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("formatBlock", "h3"); }}
                    className="px-1.5 py-0.5 rounded hover:bg-zinc-200 text-zinc-600 text-xs font-bold">
                    <Heading3 className="h-4 w-4" />
                  </button>
                  <span className="w-px bg-zinc-200 mx-1" />
                  <button type="button" title="Bullet list"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }}
                    className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                    <List className="h-4 w-4" />
                  </button>
                  <button type="button" title="Numbered list"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }}
                    className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <button type="button" title="Horizontal rule"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("insertHTML", "<hr/>"); }}
                    className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-px bg-zinc-200 mx-1" />
                  <button type="button" title="Clear formatting"
                    onMouseDown={(e) => { e.preventDefault(); execCmd("removeFormat"); }}
                    className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                    <RemoveFormatting className="h-4 w-4" />
                  </button>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setHtmlBody(editorRef.current?.innerHTML ?? "")}
                  className="min-h-[300px] border border-t-0 border-zinc-200 rounded-b-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 prose prose-sm max-w-none"
                />
              </>
            ) : (
              <div
                className="min-h-[300px] border border-zinc-200 rounded-md px-4 py-3 prose prose-sm max-w-none bg-white"
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
            )}
          </div>

          {/* Schedule */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="accent-violet-600"
              />
              Schedule for later
            </label>
            {scheduleEnabled && (
              <div>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <p className="text-xs text-zinc-400 mt-1">Resend supports scheduling up to 72 hours ahead.</p>
              </div>
            )}
          </div>

          {/* Blast result */}
          {blastResult && (
            <div className={cn(
              "flex items-start gap-2 rounded-lg px-4 py-3 text-sm",
              blastResult.failed === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}>
              {blastResult.failed === 0
                ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>
                Sent: <strong>{blastResult.sent}</strong>
                {blastResult.failed > 0 && <> · Failed: <strong>{blastResult.failed}</strong></>}
              </span>
            </div>
          )}

          {/* Send button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend || sending}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending…" : `Send to ${selected.size} recipient${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
