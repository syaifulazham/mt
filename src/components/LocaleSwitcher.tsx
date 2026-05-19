"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchLocale(next: string) {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => switchLocale("en")}
        disabled={isPending || locale === "en"}
        className={`px-2 py-1 rounded transition-colors ${
          locale === "en"
            ? "font-semibold text-zinc-900"
            : "text-zinc-400 hover:text-zinc-700"
        }`}
      >
        EN
      </button>
      <span className="text-zinc-300">|</span>
      <button
        onClick={() => switchLocale("ms")}
        disabled={isPending || locale === "ms"}
        className={`px-2 py-1 rounded transition-colors ${
          locale === "ms"
            ? "font-semibold text-zinc-900"
            : "text-zinc-400 hover:text-zinc-700"
        }`}
      >
        BM
      </button>
    </div>
  );
}
