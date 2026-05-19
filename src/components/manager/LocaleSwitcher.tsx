"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

const LABELS: Record<string, string> = { en: "EN", ms: "BM" };
const LOCALES = ["en", "ms"] as const;

export function LocaleSwitcher({ dark = false }: { dark?: boolean }) {
  const locale  = useLocale();
  const router  = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  if (dark) {
    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${pending ? "opacity-60 pointer-events-none" : ""}`}>
        {LOCALES.map((l, i) => (
          <span key={l} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/20">|</span>}
            <button
              onClick={() => switchTo(l)}
              className={`px-2 py-1 rounded transition-colors ${
                l === locale
                  ? "text-[#00F5FF] font-semibold"
                  : "text-white/40 hover:text-white/80"
              }`}
            >
              {LABELS[l]}
            </button>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex rounded-md border border-zinc-200 overflow-hidden text-xs font-medium ${pending ? "opacity-60 pointer-events-none" : ""}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={`px-2.5 py-1 transition-colors ${
            l === locale
              ? "bg-[#085782] text-white"
              : "bg-white text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
