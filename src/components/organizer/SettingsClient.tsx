"use client";

import { useState } from "react";
import { Settings, DoorOpen, DoorClosed, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SettingsClient({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/organizer/settings/registration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setOpen(j.open);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-zinc-500" />
          Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-0.5">System-wide switches for the Techlympics platform.</p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-zinc-900">Registration</h2>
              {open ? (
                <Badge variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
                  <DoorOpen className="h-3 w-3" /> Open
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-red-300 text-red-700 bg-red-50">
                  <DoorClosed className="h-3 w-3" /> Closed
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500 max-w-xl">
              {open
                ? "New contingent managers can sign up, and managers can add or import participants."
                : "The landing page shows login only, new sign-ups are blocked, and managers cannot add or import participants. Existing data stays editable."}
            </p>
          </div>
          {open ? (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 bg-red-600 hover:bg-red-500"
              onClick={() => setConfirming(true)}
              disabled={saving}
            >
              <DoorClosed className="h-3.5 w-3.5" /> Close Registration
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => void apply(true)} disabled={saving}>
              <DoorOpen className="h-3.5 w-3.5" /> Open Registration
            </Button>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Close registration?"
        description="New managers will not be able to sign up, and managers will not be able to add or import participants until registration is opened again."
        confirmLabel="Close Registration"
        loading={saving}
        onConfirm={() => apply(false)}
      />
    </div>
  );
}
