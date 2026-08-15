"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bold, Italic, Underline, List, ListOrdered, Minus,
  RemoveFormatting, Heading2, Heading3, Eye, EyeOff,
  Save, Loader2, CalendarClock, CheckCircle, ImageIcon, Paperclip, X,
  LayoutTemplate, Link2, QrCode, Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EMAIL_HEADER_HTML, EMAIL_FOOTER_HTML } from "@/lib/email/templates";

type Blast = {
  id: string;
  title: string;
  subject: string | null;
  htmlBody: string | null;
  includeHeader: boolean;
  includeFooter: boolean;
  scheduledAt: string | null;
  status: string;
};

type InsertMode = "none" | "image" | "doc" | "link" | "qrcode" | "table";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
          checked ? "bg-violet-600" : "bg-zinc-300"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out mt-0.5",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
      <span className="text-xs text-zinc-600">{label}</span>
    </label>
  );
}

export default function ComposePage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();

  const [blast, setBlast]                     = useState<Blast | null>(null);
  const [subject, setSubject]                 = useState("");
  const [scheduledAt, setScheduledAt]         = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [includeHeader, setIncludeHeader]     = useState(true);
  const [includeFooter, setIncludeFooter]     = useState(true);
  const [preview, setPreview]                 = useState(false);
  const [htmlBody, setHtmlBody]               = useState("");
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);
  const [loading, setLoading]                 = useState(true);

  const [insertMode, setInsertMode]     = useState<InsertMode>("none");
  const [insertUrl, setInsertUrl]       = useState("");
  const [insertLabel, setInsertLabel]   = useState("");
  const [uploading, setUploading]       = useState(false);

  // Hyperlink
  const [linkUrl, setLinkUrl]           = useState("");
  const [linkText, setLinkText]         = useState("");
  // QR code
  const [qrText, setQrText]             = useState("");
  const [qrSize, setQrSize]             = useState(200);
  // Table
  const [tableRows, setTableRows]       = useState(3);
  const [tableCols, setTableCols]       = useState(3);

  const editorRef      = useRef<HTMLDivElement>(null);
  const imgFileRef     = useRef<HTMLInputElement>(null);
  const docFileRef     = useRef<HTMLInputElement>(null);
  const savedRangeRef  = useRef<Range | null>(null);

  useEffect(() => {
    fetch(`/api/v2/organizer/email/blasts/${id}`)
      .then(r => r.json())
      .then((d: Blast) => {
        setBlast(d);
        setSubject(d.subject ?? "");
        const body = d.htmlBody ?? "";
        setHtmlBody(body);
        setIncludeHeader(d.includeHeader ?? true);
        setIncludeFooter(d.includeFooter ?? true);
        setScheduledAt(d.scheduledAt ? new Date(d.scheduledAt).toISOString().slice(0, 16) : "");
        setScheduleEnabled(!!d.scheduledAt);
        if (editorRef.current) editorRef.current.innerHTML = body;
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function syncBody() {
    const html = editorRef.current?.innerHTML ?? "";
    setHtmlBody(html);
    return html;
  }

  function togglePreview() {
    if (!preview) syncBody();
    setPreview(p => !p);
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    syncBody();
  }

  async function uploadFile(file: File): Promise<string> {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/v2/organizer/email/upload", { method: "POST", body: form });
    const j   = await res.json();
    setUploading(false);
    return j.url as string;
  }

  function doInsertImage(url: string) {
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false,
      `<img src="${url}" style="max-width:100%;height:auto;border-radius:4px;" alt="" /><br/>`);
    syncBody();
    setInsertMode("none");
    setInsertUrl("");
  }

  function doInsertDoc(url: string, label: string) {
    if (!url) return;
    const name = label.trim() || url.split("/").pop() || "document";
    const html = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#f4f4f5;border-radius:8px;text-decoration:none;color:#374151;font-size:14px;font-family:sans-serif;">📎 ${name}</a><br/>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    syncBody();
    setInsertMode("none");
    setInsertUrl("");
    setInsertLabel("");
  }

  function saveRange() {
    const sel = window.getSelection();
    savedRangeRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
  }

  function restoreRange() {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function doInsertLink(url: string, text: string) {
    if (!url) return;
    const label = text.trim() || url;
    const html = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#7c3aed;text-decoration:underline;">${label}</a>`;
    editorRef.current?.focus();
    restoreRange();
    document.execCommand("insertHTML", false, html);
    syncBody();
    setInsertMode("none");
    setLinkUrl(""); setLinkText("");
  }

  function doInsertQr(text: string, size: number) {
    if (!text.trim()) return;
    const encoded = encodeURIComponent(text.trim());
    const src = `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=${size}x${size}&format=png`;
    const html = `<div style="text-align:center;margin:12px 0;"><img src="${src}" alt="QR Code" width="${size}" height="${size}" style="display:block;margin:0 auto;border:1px solid #e5e7eb;padding:8px;background:#fff;border-radius:6px;" /></div><br/>`;
    editorRef.current?.focus();
    restoreRange();
    document.execCommand("insertHTML", false, html);
    syncBody();
    setInsertMode("none");
    setQrText("");
  }

  function doInsertTable(rows: number, cols: number) {
    const cellStyle = "border:1px solid #d1d5db;padding:8px 12px;text-align:left;font-family:Arial,sans-serif;font-size:14px;";
    const headerStyle = cellStyle + "background:#f3f4f6;font-weight:600;";
    const headerRow = `<tr>${Array.from({ length: cols }, (_, c) => `<th style="${headerStyle}">Header ${c + 1}</th>`).join("")}</tr>`;
    const bodyRows = Array.from({ length: rows - 1 }, (_, r) =>
      `<tr>${Array.from({ length: cols }, () => `<td style="${cellStyle}">Cell</td>`).join("")}</tr>`
    ).join("");
    const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${headerRow}${bodyRows}</table><br/>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    syncBody();
    setInsertMode("none");
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const body = editorRef.current?.innerHTML ?? htmlBody;
    await fetch(`/api/v2/organizer/email/blasts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        htmlBody: body,
        includeHeader,
        includeFooter,
        scheduledAt: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // Build the preview HTML (full email envelope)
  function buildPreviewHtml() {
    const body = htmlBody;
    const headerSection = includeHeader
      ? `<div style="background:linear-gradient(135deg,#3b0764 0%,#5b21b6 55%,#7c3aed 100%);padding:36px 40px 28px;text-align:center;">
           <img src="/logos-white/mt-logo-white.svg" alt="Malaysia Techlympics" style="height:48px;width:auto;max-width:200px;display:block;margin:0 auto;" />
           <div style="margin-top:18px;width:56px;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:2px;margin-left:auto;margin-right:auto;"></div>
         </div>
         <div style="height:4px;background:linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed);"></div>`
      : "";
    const footerSection = includeFooter
      ? `<div style="border-top:1px solid #e5e7eb;background:#f9fafb;padding:28px 40px;text-align:center;">
           <img src="/logo-mt.svg" alt="Malaysia Techlympics" style="height:32px;width:auto;max-width:120px;display:block;margin:0 auto 10px;opacity:0.65;" />
           <p style="margin:0 0 8px;font-family:sans-serif;font-size:13px;font-weight:600;color:#374151;letter-spacing:0.05em;">MALAYSIA TECHLYMPICS</p>
           <p style="margin:0 0 8px;font-family:sans-serif;font-size:11px;color:#9ca3af;">
             <a href="https://techlympics.my" style="color:#7c3aed;text-decoration:none;font-weight:500;">techlympics.my</a>
           </p>
           <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-family:sans-serif;font-size:10px;color:#d1d5db;">
             © 2025 Malaysia Techlympics. All rights reserved.<br/>
             You are receiving this email because you registered as a contingent manager.
           </p>
         </div>`
      : "";

    return `
      <div style="background:#ede9fe;padding:24px;min-height:100%;font-family:Arial,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(91,33,182,0.12);">
          ${headerSection}
          <div style="padding:32px 40px;font-size:15px;line-height:1.7;color:#1f2937;">${body}</div>
          ${footerSection}
        </div>
      </div>`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/organizer/email/bulk")}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-zinc-900 truncate">{blast?.title}</h1>
          <p className="text-xs text-zinc-400">Compose email message</p>
        </div>
        <button onClick={save} disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            saved
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          )}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="rounded-xl border bg-white p-5 space-y-5">
        {/* Subject */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Subject <span className="text-rose-500">*</span></label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Email subject…"
            className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        {/* Header / Footer toggles */}
        <div className="flex items-center gap-5 px-3 py-2.5 bg-zinc-50 rounded-lg border border-zinc-200">
          <LayoutTemplate className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-500 shrink-0">Email layout</span>
          <div className="flex items-center gap-6 ml-auto">
            <Toggle checked={includeHeader} onChange={setIncludeHeader} label="Include header" />
            <Toggle checked={includeFooter} onChange={setIncludeFooter} label="Include footer" />
          </div>
        </div>

        {/* Body */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-zinc-500">Body <span className="text-rose-500">*</span></label>
            <button type="button" onClick={togglePreview}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800">
              {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {preview ? "Edit" : "Preview full email"}
            </button>
          </div>

          {/* ── Editor (always mounted, hidden in preview) ── */}
          <div style={{ display: preview ? "none" : "block" }}>
            {/* Toolbar */}
            <div className="flex flex-wrap gap-1 border border-zinc-200 rounded-t-md bg-zinc-50 px-2 py-1.5">
              {[
                { icon: Bold,      cmd: "bold",      title: "Bold" },
                { icon: Italic,    cmd: "italic",    title: "Italic" },
                { icon: Underline, cmd: "underline", title: "Underline" },
              ].map(({ icon: Icon, cmd, title }) => (
                <button key={cmd} type="button" title={title}
                  onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}
                  className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              <span className="w-px bg-zinc-200 mx-1" />
              <button type="button" title="Heading 2"
                onMouseDown={e => { e.preventDefault(); execCmd("formatBlock", "h2"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <Heading2 className="h-4 w-4" />
              </button>
              <button type="button" title="Heading 3"
                onMouseDown={e => { e.preventDefault(); execCmd("formatBlock", "h3"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <Heading3 className="h-4 w-4" />
              </button>
              <span className="w-px bg-zinc-200 mx-1" />
              <button type="button" title="Bullet list"
                onMouseDown={e => { e.preventDefault(); execCmd("insertUnorderedList"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <List className="h-4 w-4" />
              </button>
              <button type="button" title="Numbered list"
                onMouseDown={e => { e.preventDefault(); execCmd("insertOrderedList"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <ListOrdered className="h-4 w-4" />
              </button>
              <button type="button" title="Horizontal rule"
                onMouseDown={e => { e.preventDefault(); execCmd("insertHTML", "<hr/>"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-px bg-zinc-200 mx-1" />
              <button type="button" title="Clear formatting"
                onMouseDown={e => { e.preventDefault(); execCmd("removeFormat"); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-600">
                <RemoveFormatting className="h-4 w-4" />
              </button>
              <span className="w-px bg-zinc-200 mx-1" />
              <button type="button" title="Insert image"
                onClick={() => setInsertMode(m => m === "image" ? "none" : "image")}
                className={cn("p-1 rounded text-zinc-600", insertMode === "image" ? "bg-violet-100 text-violet-700" : "hover:bg-zinc-200")}>
                <ImageIcon className="h-4 w-4" />
              </button>
              <button type="button" title="Insert document / PDF"
                onClick={() => setInsertMode(m => m === "doc" ? "none" : "doc")}
                className={cn("p-1 rounded text-zinc-600", insertMode === "doc" ? "bg-violet-100 text-violet-700" : "hover:bg-zinc-200")}>
                <Paperclip className="h-4 w-4" />
              </button>
              <span className="w-px bg-zinc-200 mx-1" />
              <button type="button" title="Insert hyperlink"
                onMouseDown={e => { e.preventDefault(); saveRange(); setInsertMode(m => m === "link" ? "none" : "link"); }}
                className={cn("p-1 rounded text-zinc-600", insertMode === "link" ? "bg-blue-100 text-blue-700" : "hover:bg-zinc-200")}>
                <Link2 className="h-4 w-4" />
              </button>
              <button type="button" title="Insert QR code"
                onMouseDown={e => { e.preventDefault(); saveRange(); setInsertMode(m => m === "qrcode" ? "none" : "qrcode"); }}
                className={cn("p-1 rounded text-zinc-600", insertMode === "qrcode" ? "bg-emerald-100 text-emerald-700" : "hover:bg-zinc-200")}>
                <QrCode className="h-4 w-4" />
              </button>
              <button type="button" title="Insert table"
                onClick={() => setInsertMode(m => m === "table" ? "none" : "table")}
                className={cn("p-1 rounded text-zinc-600", insertMode === "table" ? "bg-amber-100 text-amber-700" : "hover:bg-zinc-200")}>
                <Table2 className="h-4 w-4" />
              </button>
            </div>

            {/* Image insert panel */}
            {insertMode === "image" && (
              <div className="border border-t-0 border-zinc-200 bg-violet-50 px-3 py-2 flex flex-wrap items-center gap-2">
                <ImageIcon className="h-4 w-4 text-violet-400 shrink-0" />
                <input
                  placeholder="Paste image URL…"
                  value={insertUrl}
                  onChange={e => setInsertUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doInsertImage(insertUrl)}
                  className="flex-1 min-w-0 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
                <span className="text-zinc-400 text-xs shrink-0">or</span>
                <input ref={imgFileRef} type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await uploadFile(f);
                    doInsertImage(url);
                    e.target.value = "";
                  }} />
                <button type="button" onClick={() => imgFileRef.current?.click()} disabled={uploading}
                  className="text-xs px-2.5 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-600 disabled:opacity-50 shrink-0">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : "Upload"}
                </button>
                <button type="button" disabled={!insertUrl} onClick={() => doInsertImage(insertUrl)}
                  className="text-xs px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 shrink-0">
                  Insert
                </button>
                <button type="button" onClick={() => { setInsertMode("none"); setInsertUrl(""); }}
                  className="text-zinc-400 hover:text-zinc-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Document insert panel */}
            {insertMode === "doc" && (
              <div className="border border-t-0 border-zinc-200 bg-violet-50 px-3 py-2 flex flex-wrap items-center gap-2">
                <Paperclip className="h-4 w-4 text-violet-400 shrink-0" />
                <input
                  placeholder="File URL or PDF link…"
                  value={insertUrl}
                  onChange={e => setInsertUrl(e.target.value)}
                  className="flex-1 min-w-0 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
                <input
                  placeholder="Label (optional)"
                  value={insertLabel}
                  onChange={e => setInsertLabel(e.target.value)}
                  className="w-36 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 shrink-0"
                />
                <span className="text-zinc-400 text-xs shrink-0">or</span>
                <input ref={docFileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await uploadFile(f);
                    doInsertDoc(url, f.name);
                    e.target.value = "";
                  }} />
                <button type="button" onClick={() => docFileRef.current?.click()} disabled={uploading}
                  className="text-xs px-2.5 py-1 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-600 disabled:opacity-50 shrink-0">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : "Upload"}
                </button>
                <button type="button" disabled={!insertUrl} onClick={() => doInsertDoc(insertUrl, insertLabel)}
                  className="text-xs px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 shrink-0">
                  Insert
                </button>
                <button type="button" onClick={() => { setInsertMode("none"); setInsertUrl(""); setInsertLabel(""); }}
                  className="text-zinc-400 hover:text-zinc-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Hyperlink panel */}
            {insertMode === "link" && (
              <div className="border border-t-0 border-zinc-200 bg-blue-50 px-3 py-2 flex flex-wrap items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-400 shrink-0" />
                <input
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doInsertLink(linkUrl, linkText)}
                  className="flex-1 min-w-[160px] text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  placeholder="Link text (optional)"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doInsertLink(linkUrl, linkText)}
                  className="w-40 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
                />
                <button type="button" disabled={!linkUrl} onClick={() => doInsertLink(linkUrl, linkText)}
                  className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0">
                  Insert
                </button>
                <button type="button" onClick={() => { setInsertMode("none"); setLinkUrl(""); setLinkText(""); }}
                  className="text-zinc-400 hover:text-zinc-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* QR code panel */}
            {insertMode === "qrcode" && (
              <div className="border border-t-0 border-zinc-200 bg-emerald-50 px-3 py-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <QrCode className="h-4 w-4 text-emerald-500 shrink-0" />
                  <input
                    placeholder="Text or URL to encode…"
                    value={qrText}
                    onChange={e => setQrText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doInsertQr(qrText, qrSize)}
                    className="flex-1 min-w-[200px] text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  <select
                    value={qrSize}
                    onChange={e => setQrSize(Number(e.target.value))}
                    className="text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none shrink-0"
                  >
                    <option value={100}>100 px</option>
                    <option value={150}>150 px</option>
                    <option value={200}>200 px</option>
                    <option value={250}>250 px</option>
                    <option value={300}>300 px</option>
                  </select>
                  <button type="button" disabled={!qrText.trim()} onClick={() => doInsertQr(qrText, qrSize)}
                    className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 shrink-0">
                    Insert QR
                  </button>
                  <button type="button" onClick={() => { setInsertMode("none"); setQrText(""); }}
                    className="text-zinc-400 hover:text-zinc-700 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {qrText.trim() && (
                  <div className="flex items-center gap-3 pl-6">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrText.trim())}&size=${qrSize}x${qrSize}&format=png`}
                      alt="QR preview"
                      width={64} height={64}
                      className="border border-zinc-200 rounded bg-white p-1"
                    />
                    <p className="text-xs text-emerald-700">Live preview · will be inserted as hosted image (email-safe)</p>
                  </div>
                )}
              </div>
            )}

            {/* Table panel */}
            {insertMode === "table" && (
              <div className="border border-t-0 border-zinc-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-3">
                <Table2 className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-xs text-zinc-600 shrink-0">Rows</span>
                <input
                  type="number" min={2} max={20} value={tableRows}
                  onChange={e => setTableRows(Math.max(2, Math.min(20, Number(e.target.value))))}
                  className="w-16 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none text-center"
                />
                <span className="text-xs text-zinc-600 shrink-0">Cols</span>
                <input
                  type="number" min={1} max={10} value={tableCols}
                  onChange={e => setTableCols(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-16 text-sm border border-zinc-200 rounded px-2 py-1 bg-white focus:outline-none text-center"
                />
                <span className="text-xs text-zinc-400 shrink-0">(first row = header)</span>
                <button type="button" onClick={() => doInsertTable(tableRows, tableCols)}
                  className="text-xs px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 shrink-0">
                  Insert Table
                </button>
                <button type="button" onClick={() => setInsertMode("none")}
                  className="text-zinc-400 hover:text-zinc-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Editor area */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncBody}
              className="min-h-[400px] border border-t-0 border-zinc-200 rounded-b-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400 prose prose-sm max-w-none"
            />
          </div>

          {/* ── Preview — full email envelope ── */}
          <div style={{ display: preview ? "block" : "none" }}>
            <div className="rounded-md border border-zinc-200 overflow-hidden">
              {/* mini email client chrome */}
              <div className="bg-zinc-100 border-b border-zinc-200 px-4 py-2 flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-medium">Preview</span>
                <span className="flex-1" />
                <span className="text-xs text-zinc-400 italic">{subject || "(no subject)"}</span>
              </div>
              <div
                className="overflow-auto bg-[#ede9fe]"
                dangerouslySetInnerHTML={{ __html: buildPreviewHtml() }}
              />
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer select-none">
            <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)}
              className="accent-violet-600" />
            <CalendarClock className="h-4 w-4 text-zinc-400" />
            Schedule for later
          </label>
          {scheduleEnabled && (
            <div>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                className="text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <p className="text-xs text-zinc-400 mt-1">Resend supports scheduling up to 72 hours ahead.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
