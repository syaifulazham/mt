"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DatabaseBackup, Download, Trash2, Loader2, RefreshCw, CheckCircle2,
  XCircle, Clock, HardDrive, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

type Backup = {
  id: string;
  filename: string;
  size: number | null;
  status: "running" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
  note: string | null;
  error: string | null;
};

function fmtSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function StatusBadge({ status }: { status: Backup["status"] }) {
  if (status === "running")
    return (
      <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700 bg-blue-50">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 border-red-300 text-red-700 bg-red-50">
      <XCircle className="h-3 w-3" /> Failed
    </Badge>
  );
}

export function BackupsClient() {
  const [backups,   setBackups]   = useState<Backup[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [error,     setError]     = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/organizer/backups");
      const json = await res.json();
      if (res.ok) setBackups(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while any backup is running
  useEffect(() => {
    const hasRunning = backups.some((b) => b.status === "running");
    if (!hasRunning) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [backups, load]);

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/v2/organizer/backups", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to start backup");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/v2/organizer/backups/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  function handleDownload(b: Backup) {
    window.open(`/api/v2/organizer/backups/${b.id}/download`, "_blank");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <DatabaseBackup className="h-6 w-6 text-zinc-500" />
            DB Backups
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            PostgreSQL full backups using pg_dump (custom format).
            Stored in <code className="text-xs bg-zinc-100 px-1 rounded">/app/data/backups/</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1.5">
            {creating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <DatabaseBackup className="h-3.5 w-3.5" />}
            Create Backup
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
            <HardDrive className="h-10 w-10" strokeWidth={1.2} />
            <p className="text-sm">No backups yet. Click <strong>Create Backup</strong> to start.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Filename</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Completed</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {backups.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700 max-w-xs truncate">
                    {b.filename}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={b.status} />
                      {b.error && (
                        <p className="text-[11px] text-red-500 max-w-xs truncate" title={b.error}>
                          {b.error}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                    {fmtSize(b.size)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      {fmtDate(b.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {fmtDate(b.completed_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {b.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => handleDownload(b)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50"
                        disabled={b.status === "running"}
                        onClick={() => setDeleteId(b.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(open: boolean) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this backup?</DialogTitle>
            <DialogDescription>
              The dump file will be permanently removed from disk. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
