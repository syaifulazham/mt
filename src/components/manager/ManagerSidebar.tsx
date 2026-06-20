"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserButton } from "@clerk/nextjs";
import {
  Home,
  User,
  Building2,
  Users,
  GraduationCap,
  Swords,
  CalendarDays,
  BookOpen,
  Award,
  Lock,
} from "lucide-react";

const NAV = [
  { href: "/manager/dashboard",    icon: Home,          key: "dashboard",    gated: false },
  { href: "/manager/profile",      icon: User,          key: "profile",      gated: false },
  { href: "/manager/contingents",  icon: Building2,     key: "contingents",  gated: false },
  { href: "/manager/participants", icon: Users,         key: "participants", gated: true  },
  { href: "/manager/trainers",     icon: GraduationCap, key: "trainers",     gated: true  },
  { href: "/manager/teams",        icon: Swords,        key: "teams",        gated: true  },
  { href: "/manager/events",       icon: CalendarDays,  key: "events",       gated: true  },
  { href: "/manager/lms",          icon: BookOpen,      key: "lms",          gated: true  },
  { href: "/manager/certificates", icon: Award,         key: "certificates", gated: true  },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/manager/dashboard") {
    return pathname === "/manager" || pathname === "/manager/dashboard";
  }
  return pathname.startsWith(href);
}

type Props = {
  userName: string;
  institutionName: string;
  hasContingent: boolean;
};

export function ManagerSidebar({ userName, institutionName, hasContingent }: Props) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r bg-white dark:bg-zinc-900 dark:border-zinc-800">
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, icon: Icon, key, gated }) => {
          const disabled = gated && !hasContingent;
          const active = !disabled && isActive(pathname, href);

          if (disabled) {
            return (
              <span
                key={href}
                title="Set up a contingent first"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 dark:text-zinc-600 cursor-not-allowed select-none"
              >
                <Icon className="h-4 w-4 shrink-0 text-zinc-200 dark:text-zinc-700" strokeWidth={1.8} />
                {t(key)}
                <Lock className="ml-auto h-3 w-3 text-zinc-300 dark:text-zinc-600" />
              </span>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-[#085782] dark:bg-blue-950/30 dark:text-blue-400"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? "text-[#085782] dark:text-blue-400" : "text-zinc-400 dark:text-zinc-500"}`}
                strokeWidth={active ? 2.5 : 1.8}
              />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* ── User account ──────────────────────────── */}
      <div className="border-t dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <UserButton afterSignOutUrl="/manager/sign-in" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate dark:text-zinc-200">{userName}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-tight truncate mt-0.5">{institutionName}</p>
        </div>
      </div>
    </aside>
  );
}
