"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Trophy,
  UserCheck,
  Gavel,
  Database,
  LogOut,
  ChevronRight,
  BotMessageSquare,
  BookMarked,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: OrganizerRole[];
  phase2?: boolean;
};

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/organizer/dashboard", icon: LayoutDashboard },
  { label: "Staff", href: "/organizer/users", icon: Users, roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Reference Data", href: "/organizer/reference-data", icon: Database, roles: ["SUPER_ADMIN", "ADMIN"] },
  { label: "Competitions", href: "/organizer/competitions", icon: Trophy },
  { label: "Participation", href: "/organizer/participation", icon: UserCheck },
  { label: "Events", href: "/organizer/events", icon: CalendarDays },
  { label: "Judging", href: "/organizer/judging", icon: Gavel },
  { label: "Smart Chat", href: "/organizer/smart-chat", icon: BotMessageSquare },
  { label: "Knowledge Base", href: "/organizer/knowledge-base", icon: BookMarked },
];

export function Sidebar({ userName, role }: { userName: string; role: OrganizerRole }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="px-6 py-5 border-b">
        <p className="text-lg font-bold">Techlympics</p>
        <p className="text-xs text-muted-foreground">Organizer Portal</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const Icon = item.icon;
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
