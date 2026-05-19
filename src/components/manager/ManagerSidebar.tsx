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
  BookOpen,
  Award,
} from "lucide-react";

const NAV = [
  { href: "/manager/dashboard",   icon: Home,          key: "dashboard"   },
  { href: "/manager/profile",     icon: User,          key: "profile"     },
  { href: "/manager/contingents", icon: Building2,     key: "contingents" },
  { href: "/manager/participants", icon: Users,         key: "participants" },
  { href: "/manager/trainers",    icon: GraduationCap, key: "trainers"    },
  { href: "/manager/teams",       icon: Swords,        key: "teams"       },
  { href: "/manager/lms",         icon: BookOpen,      key: "lms"         },
  { href: "/manager/certificates",icon: Award,         key: "certificates"},
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
};

export function ManagerSidebar({ userName, institutionName }: Props) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r bg-white">
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, icon: Icon, key }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-[#085782]"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? "text-[#085782]" : "text-zinc-400"}`}
                strokeWidth={active ? 2.5 : 1.8}
              />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* ── User account ──────────────────────────── */}
      <div className="border-t px-4 py-3 flex items-center gap-3">
        <UserButton afterSignOutUrl="/manager/sign-in" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{userName}</p>
          <p className="text-xs text-zinc-400 leading-tight truncate mt-0.5">{institutionName}</p>
        </div>
      </div>
    </aside>
  );
}
