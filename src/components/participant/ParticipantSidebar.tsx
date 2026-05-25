"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User, Swords, Trophy, Award, MessageCircle, LogOut } from "lucide-react";

const NAV = [
  { href: "/participant/profile",      icon: User,          label: "Profil" },
  { href: "/participant/team",         icon: Swords,        label: "Pasukan" },
  { href: "/participant/competitions", icon: Trophy,        label: "Pertandingan" },
  { href: "/participant/certificates", icon: Award,         label: "Sijil" },
  { href: "/participant/chat",         icon: MessageCircle, label: "Smart Chat" },
] as const;

type Props = {
  name: string;
  contingentName: string;
};

export function ParticipantSidebar({ name, contingentName }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/participant/auth/logout", { method: "POST" });
    router.push("/participant/sign-in");
  }

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r bg-white dark:bg-zinc-900 dark:border-zinc-800">
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
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
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── User account ──────────────────────────── */}
      <div className="border-t dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate dark:text-zinc-200">{name}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-tight truncate mt-0.5">{contingentName}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className="shrink-0 rounded-md p-1.5 transition-colors text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}
