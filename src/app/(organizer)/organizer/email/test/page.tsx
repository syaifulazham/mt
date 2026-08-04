"use client";

import { useState } from "react";
import { Mail, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type Status = { ok: boolean; message: string } | null;

export default function EmailTestPage() {
  const [to, setTo]           = useState("");
  const [subject, setSubject] = useState("Techlympics — Test Email");
  const [body, setBody]       = useState("This is a test email sent from the Techlympics organizer portal.\n\nIf you received this, outgoing email is working correctly.");
  const [sending, setSending] = useState(false);
  const [status, setStatus]   = useState<Status>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/v2/organizer/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      setStatus({ ok: true, message: `Delivered — Resend message ID: ${j.id}` });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="h-5 w-5 text-zinc-500" />
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Email Test</h1>
          <p className="text-sm text-zinc-400">Send a test email via Resend to verify outgoing mail is working.</p>
        </div>
      </div>

      <form onSubmit={handleSend} className="rounded-xl border bg-white p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">From</label>
          <div className="text-sm text-zinc-700 border border-zinc-100 rounded-md px-3 py-2 bg-zinc-50">
            Techlympics &lt;noreply@techlympics.my&gt;
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">To <span className="text-rose-500">*</span></label>
          <input
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Subject <span className="text-rose-500">*</span></label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Body <span className="text-rose-500">*</span></label>
          <textarea
            required
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        {status && (
          <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${status.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {status.ok
              ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            {status.message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 rounded-md bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send Test Email"}
          </button>
        </div>
      </form>

      <p className="mt-4 text-xs text-zinc-400 text-center">
        Emails are sent via <span className="font-mono">RESEND_API_KEY</span>. Check server env if delivery fails.
      </p>
    </div>
  );
}
