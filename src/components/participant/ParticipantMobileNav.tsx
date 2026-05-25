"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Swords, Trophy, Award, MessageCircle } from "lucide-react";

const NAV = [
  { href: "/participant/profile",      icon: User,          label: "Profil" },
  { href: "/participant/team",         icon: Swords,        label: "Pasukan" },
  { href: "/participant/competitions", icon: Trophy,        label: "Pertandingan" },
  { href: "/participant/certificates", icon: Award,         label: "Sijil" },
  { href: "/participant/chat",         icon: MessageCircle, label: "Smart Chat" },
] as const;

export function ParticipantMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex h-16 items-stretch border-t bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-[0_-2px_12px_rgba(0,0,0,0.07)]">
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              active
                ? "text-[#085782] dark:text-blue-400"
                : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
            {active && (
              <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-[#085782]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
