"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, ChevronRight, ChevronDown, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ORGANIZER_NAV as NAV, navForRole } from "./nav";

export function Sidebar({ userName, role }: { userName: string; role: OrganizerRole }) {
  const pathname = usePathname();

  // Track which parent groups are expanded; auto-open if a child is active
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of NAV) {
      if (item.children?.some((c) => pathname.startsWith(c.href))) {
        init[item.href] = true;
      }
    }
    return init;
  });

  function toggleGroup(href: string) {
    setExpanded((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <Link href="/organizer" className="block px-6 py-5 border-b hover:bg-zinc-50 transition-colors">
        <p className="text-lg font-bold">Techlympics</p>
        <p className="text-xs text-muted-foreground">Organizer Portal</p>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navForRole(role).map((item) => {
          const Icon = item.icon;

          // ── Parent with sub-items ───────────────────────────────────────
          if (item.children) {
            const isOpen = !!expanded[item.href];
            const anyChildActive = item.children.some((c) => pathname.startsWith(c.href));
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    anyChildActive
                      ? "bg-zinc-100 font-medium text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                    : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                </button>
                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-100 pl-3">
                    {item.children.map((child) => {
                      const CIcon = child.icon;
                      const childActive = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                            childActive
                              ? "bg-zinc-100 font-medium text-zinc-900"
                              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                          )}
                        >
                          <CIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{child.label}</span>
                          {childActive && <ChevronRight className="ml-auto h-3 w-3 text-zinc-400" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // ── Regular item ────────────────────────────────────────────────
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.phase2 ? "#" : item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                item.phase2 && "opacity-40 cursor-not-allowed"
              )}
              aria-disabled={item.phase2}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="h-3 w-3 text-zinc-400" />}
              {item.phase2 && <span className="text-[10px] text-zinc-400">P2</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-4 py-4 space-y-2">
        <Link
          href="/organizer/profile"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-50 transition-colors group"
        >
          <UserCircle className="h-5 w-5 text-zinc-400 group-hover:text-zinc-700 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-zinc-900">{userName}</p>
            <Badge variant="outline" className="text-[10px] mt-0.5">{role}</Badge>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/organizer/login" })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
