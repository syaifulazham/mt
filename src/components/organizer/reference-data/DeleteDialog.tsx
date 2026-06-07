"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title?: string;
  description?: string;
};

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function DeleteDialog({ open, onClose, onConfirm, title = "Delete record", description = "This action cannot be undone." }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  // code is stable per mount — parent must use key={target.id} to remount on each new target
  const [code]                = useState(genCode);
  const [input, setInput]     = useState("");

  async function handleConfirm() {
    if (input.trim().toUpperCase() !== code) { setError("Code does not match. Please try again."); return; }
    setLoading(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="px-1 space-y-3">
          <p className="text-sm text-zinc-600">Type the code below to confirm:</p>
          <div className="flex items-center justify-center rounded-md bg-zinc-100 border border-zinc-200 py-2">
            <span className="font-mono text-lg font-bold tracking-[0.3em] text-zinc-800 select-all">{code}</span>
          </div>
          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(""); }}
            placeholder="Enter code"
            className="font-mono tracking-widest text-center uppercase"
            maxLength={5}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || input.trim().length < 5}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
