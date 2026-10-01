"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Checkbox backed by the `?all=1` search param, so the server page does the
 * filtering and the choice survives reloads and shared links.
 */
export function ShowAllCompetitionsToggle({ checked, label }: { checked: boolean; label: string }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(() => router.replace(next ? `${pathname}?all=1` : pathname, { scroll: false }));
        }}
        className="h-4 w-4 rounded border-zinc-300 accent-[#085782]"
      />
      {label}
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
    </label>
  );
}
