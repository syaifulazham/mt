"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User, Swords, Trophy, BookOpen, Award, MessageCircle, LogOut } from "lucide-react";

const NAV = [
  { href: "/participant/profile",      icon: User,          label: "Profil" },
  { href: "/participant/team",         icon: Swords,        label: "Pasukan" },
  { href: "/participant/competitions", icon: Trophy,        label: "Pertandingan" },
  { href: "/participant/bengkel",      icon: BookOpen,      label: "Bengkel" },
  { href: "/participant/certificates", icon: Award,         label: "Sijil" },
  { href: "/participant/chat",         icon: MessageCircle, label: "AI Rimau" },
] as const;

type Props = { name: string; contingentName: string };

export function ParticipantSidebar({ name, contingentName }: Props) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    await fetch("/api/participant/auth/logout", { method: "POST" });
    router.push("/participant/sign-in");
  }

  return (
    <aside
      className="hidden lg:flex w-56 shrink-0 flex-col border-r"
      style={{
        background:      "var(--pt-surface, white)",
        borderRightColor: "var(--pt-border-color, #e4e4e7)",
      }}
    >
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`pt-nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "pt-nav-active"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
              style={
                active
                  ? {
                      background:   "var(--pt-active-bg,   #eff6ff)",
                      color:        "var(--pt-active-text,  #085782)",
                      borderLeft:   "3px solid var(--pt-active-border, transparent)",
                      paddingLeft:  "calc(0.75rem - 3px)",
                    }
                  : {}
              }
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? "var(--pt-active-text, #085782)" : undefined }}
                strokeWidth={active ? 2.5 : 1.8}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User row */}
      <div
        className="border-t px-4 py-3 flex items-center gap-3"
        style={{ borderTopColor: "var(--pt-border-color, #e4e4e7)" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate dark:text-zinc-200">{name}</p>
          <p className="text-xs leading-tight truncate mt-0.5" style={{ color: "var(--pt-muted, #71717a)" }}>
            {contingentName}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Log keluar"
          className="shrink-0 rounded-md p-1.5 transition-colors text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}
