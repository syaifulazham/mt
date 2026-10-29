"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Background, Block } from "@/lib/landingSections";

export type AiResult = { title: string; eyebrow: string; background: Background; blocks: Block[] };
export type AiMode = "replace" | "append" | "revise";

const EXAMPLES = [
  "Bahagian 'Tentang Techlympics' dengan pengenalan ringkas, 3 kad tentang objektif, dan butang Daftar Sekarang ke /manager/sign-up",
  "Jadual penting pertandingan dalam bentuk senarai, dengan nota bahawa tarikh boleh berubah",
  "Section thanking our sponsors and partners, with a photo grid from past events",
];

export function AiHelperDialog({ open, onClose, current, onApply }: {
  open: boolean;
  onClose: () => void;
  current: { title: string; blocks: Block[] };
  onApply: (result: AiResult, mode: AiMode) => void;
}) {
  const hasContent = current.blocks.length > 0;
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState<"ms" | "en">("ms");
  const [useGallery, setUseGallery] = useState(true);
  const [mode, setMode] = useState<AiMode>(hasContent ? "revise" : "replace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/v2/organizer/landing/sections/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt, language, useGallery,
          ...(mode === "revise" && hasContent ? { current } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onApply(j.data as AiResult, hasContent ? mode : "replace");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const modes: { value: AiMode; label: string; hint: string }[] = [
    { value: "revise", label: "Revise this section", hint: "The AI edits the current content following your request." },
    { value: "append", label: "Add blocks below", hint: "New blocks are added after the existing ones." },
    { value: "replace", label: "Start over", hint: "Replaces the title and all blocks." },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" /> AI helper</DialogTitle>
          <DialogDescription className="text-xs">
            Describe the section. The result goes into the editor for you to check before saving. Nothing is published automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">What should this section say?</Label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} autoFocus
              placeholder="e.g. Bahagian tentang bengkel percuma untuk guru, dengan 3 kad faedah dan butang ke borang pendaftaran"
              className="block w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-200" />
            {!prompt && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setPrompt(ex)}
                    className="rounded-full border bg-zinc-50 px-2.5 py-1 text-left text-[11px] text-zinc-600 hover:border-violet-200 hover:bg-violet-50">
                    {ex.length > 70 ? `${ex.slice(0, 70)}…` : ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              Language
              <select value={language} onChange={(e) => setLanguage(e.target.value as "ms" | "en")} className="h-8 rounded-md border border-input bg-white px-2 text-xs">
                <option value="ms">Bahasa Malaysia</option>
                <option value="en">English</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={useGallery} onChange={(e) => setUseGallery(e.target.checked)} className="h-3.5 w-3.5 accent-violet-600" />
              Let it pick photos from the galleries
            </label>
          </div>

          {hasContent && (
            <div className="space-y-1.5">
              {modes.map((m) => (
                <label key={m.value} className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 ${mode === m.value ? "border-violet-300 bg-violet-50/60" : "hover:bg-zinc-50"}`}>
                  <input type="radio" name="ai-mode" checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-0.5 accent-violet-600" />
                  <span>
                    <span className="block text-sm font-medium text-zinc-800">{m.label}</span>
                    <span className="block text-[11px] text-zinc-500">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy || prompt.trim().length < 3} className="bg-violet-600 hover:bg-violet-700">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
