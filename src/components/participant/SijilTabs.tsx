// Sijil ↔ PAJSK (Beta) tabs at the top of both pages — the only way to PAJSK on
// mobile, where the bottom bar has no room for sub-items. Rendered only when
// PAJSK is open to this participant.
import Link from "next/link";
import { BetaBadge } from "@/components/pajsk/PajskEntryList";

export function SijilTabs({ active }: { active: "sijil" | "pajsk" }) {
  const tab = (key: "sijil" | "pajsk", href: string, label: React.ReactNode) => (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors ${
        active === key
          ? "border-[var(--pt-active-border,#085782)] text-[var(--pt-active-text,#085782)]"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {tab("sijil", "/participant/certificates", "Sijil")}
      {tab("pajsk", "/participant/certificates/pajsk", <>PAJSK <BetaBadge /></>)}
    </nav>
  );
}
