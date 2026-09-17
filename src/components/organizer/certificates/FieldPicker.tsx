"use client";

import { Plus } from "lucide-react";
import { CERT_FIELDS, type CertFieldToken } from "@/lib/certificates/fields";

/**
 * Lists the field registry. Because `render.ts` resolves the same list, the
 * editor cannot offer a token the renderer would drop.
 */
export function FieldPicker({ onAdd }: { onAdd: (field: CertFieldToken) => void }) {
  return (
    <div className="space-y-1">
      {CERT_FIELDS.map((f) => (
        <button
          key={f.token}
          type="button"
          onClick={() => onAdd(f.token)}
          className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-100 transition-colors"
        >
          <span className="min-w-0">
            <span className="block truncate text-zinc-700">{f.label}</span>
            <span className="block truncate font-mono text-[10px] text-zinc-400">{f.token}</span>
          </span>
          <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </button>
      ))}
    </div>
  );
}
