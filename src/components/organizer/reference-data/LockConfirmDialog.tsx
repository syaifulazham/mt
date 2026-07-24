"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

interface Props {
  open: boolean;
  itemName: string;
  isLocked: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function LockConfirmContent({ itemName, isLocked, onConfirm, onClose }: Omit<Props, "open">) {
  const [code] = useState(genCode);
  const [input, setInput] = useState("");

  function handleConfirm() {
    if (input !== code) return;
    onConfirm();
    onClose();
  }

  const action = isLocked ? "Buka Kunci" : "Kunci";
  const Icon   = isLocked ? LockOpen : Lock;
  const color  = isLocked ? "text-emerald-600" : "text-amber-600";
  const btnCls = isLocked
    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
    : "bg-amber-600 hover:bg-amber-700 text-white";

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className={`flex items-center gap-2 ${color}`}>
          <Icon className="h-4 w-4" />
          {action} Seksyen
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-1">
        <p className="text-sm text-zinc-600">
          {isLocked
            ? "Buka kunci akan membenarkan pengeditan semula pada seksyen ini."
            : "Mengunci seksyen ini akan menghalang sebarang penambahan, pengeditan atau pemadaman."}
        </p>
        <p className="text-sm font-medium text-zinc-800 truncate">{itemName}</p>

        <div className="rounded-lg bg-zinc-50 border px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">Taip kod ini untuk teruskan</p>
          <p className="text-2xl font-black tracking-[0.3em] text-zinc-800 font-mono">{code}</p>
        </div>

        <div>
          <Label className="text-xs text-zinc-500">Masukkan kod pengesahan</Label>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            placeholder="_ _ _ _ _"
            maxLength={5}
            className="mt-1 font-mono tracking-widest text-center text-base"
            autoFocus
          />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Batal</Button>
        <Button size="sm" disabled={input !== code} onClick={handleConfirm} className={btnCls}>
          <Icon className="h-3.5 w-3.5 mr-1.5" />
          {action}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function LockConfirmDialog({ open, itemName, isLocked, onConfirm, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {open && (
        <LockConfirmContent
          key={String(open)}
          itemName={itemName}
          isLocked={isLocked}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
