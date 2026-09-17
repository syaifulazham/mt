"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CertConfig } from "@/lib/certificates/config-schema";

/**
 * Renders the *real* PDF through the same renderer the download endpoint uses,
 * so WYSIWYG is demonstrated rather than asserted. The canvas is an SVG
 * approximation; this is the arbiter.
 */
export function TruePreviewDialog({
  templateId, config, open, onClose,
}: {
  templateId: string;
  config: CertConfig;
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl]       = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [warnings, setWarn] = useState(0);

  useEffect(() => {
    if (!open) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      setUrl(null); setError(null); setWarn(0);
      try {
        const res = await fetch(`/api/v2/organizer/certificates/templates/${templateId}/preview`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ config }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setWarn(Number(res.headers.get("X-Render-Warnings") ?? 0));
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, templateId, config]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            True preview — rendered by the download engine
          </DialogTitle>
        </DialogHeader>

        {warnings > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {warnings} render warning{warnings > 1 ? "s" : ""} — check the server log
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {!url && !error && (
          <div className="flex h-[70vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}

        {url && <iframe src={url} title="Certificate preview" className="h-[70vh] w-full rounded-md border" />}
      </DialogContent>
    </Dialog>
  );
}
