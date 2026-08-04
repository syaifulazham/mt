"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Test",      href: "/organizer/email/test" },
  { label: "Bulk Send", href: "/organizer/email/bulk" },
];

export function EmailTabNav() {
  const pathname = usePathname();
  return (
    <div className="flex border-b bg-white px-6">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "mr-6 py-3 text-sm border-b-2 transition-colors",
              active
                ? "border-violet-600 text-violet-700 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
