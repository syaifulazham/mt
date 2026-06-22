"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview",       href: "/organizer/dashboard",       exact: true  },
  { label: "View by Zone",   href: "/organizer/dashboard/zone",  exact: false },
  { label: "View by State",  href: "/organizer/dashboard/state", exact: false },
] as const;

export function DashboardTabNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="border-b border-zinc-200 bg-white">
      <nav className="flex gap-1 px-6 max-w-6xl mx-auto" aria-label="Dashboard views">
        {TABS.map(({ label, href, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-[#085782] text-[#085782]"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
